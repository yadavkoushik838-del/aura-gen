
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const backendDirectory = fileURLToPath(
  new URL("../", import.meta.url)
);

let serverProcess;
let serverUrl;
let serverOutput = "";

async function getAvailablePort() {
  const temporaryServer = net.createServer();

  await new Promise((resolve, reject) => {
    temporaryServer.once("error", reject);
    temporaryServer.listen(0, "127.0.0.1", resolve);
  });

  const port = temporaryServer.address().port;

  await new Promise((resolve, reject) => {
    temporaryServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Test server exited unexpectedly.\n${serverOutput}`
      );
    }

    try {
      const response = await fetch(`${url}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Test server did not become ready.\n${serverOutput}`
  );
}

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(
        new Error(`Timed out waiting for ${eventName}`)
      );
    }, timeoutMs);

    function handler(data) {
      clearTimeout(timer);
      resolve(data);
    }

    socket.once(eventName, handler);
  });
}

function expectNoEvent(socket, eventName, durationMs = 150) {
  return new Promise((resolve, reject) => {
    function handler() {
      clearTimeout(timer);
      reject(
        new Error(`Unexpected ${eventName} event received`)
      );
    }

    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      resolve();
    }, durationMs);

    socket.once(eventName, handler);
  });
}

async function connectClient() {
  const socket = io(serverUrl, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 4000,
  });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });

  return socket;
}

before(async () => {
  const port = await getAvailablePort();

  serverUrl = `http://127.0.0.1:${port}`;

  serverProcess = spawn(
    process.execPath,
    ["src/server.js"],
    {
      cwd: backendDirectory,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        AI_PROVIDER: "simulated",
        LOG_LEVEL: "silent",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  serverProcess.stdout.on("data", (data) => {
    serverOutput += data.toString();
  });

  serverProcess.stderr.on("data", (data) => {
    serverOutput += data.toString();
  });

  await waitForServer(serverUrl);
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill("SIGTERM");

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);

    serverProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  if (serverProcess.exitCode === null) {
    serverProcess.kill("SIGKILL");
  }
});

test("AuraGen Socket.IO telemetry integration", async (t) => {
  const socket = await connectClient();

  try {
    await t.test(
      "valid telemetry updates the friction score",
      async () => {
        const scorePromise = waitForEvent(
          socket,
          "load-score"
        );

        socket.emit("telemetry", {
          pointerMovements: 3,
        });

        const analysis = await scorePromise;

        assert.equal(analysis.score, 6);
        assert.equal(
          analysis.metrics.pointerMovements,
          3
        );
      }
    );

    await t.test(
      "invalid telemetry payloads are ignored",
      async () => {
        const noScore = expectNoEvent(
          socket,
          "load-score"
        );

        socket.emit("telemetry", null);
        socket.emit("telemetry", []);

        await noScore;
      }
    );

    await t.test(
      "session reset clears interaction metrics",
      async () => {
        const resetPromise = waitForEvent(
          socket,
          "load-score"
        );

        socket.emit("reset-session");

        const analysis = await resetPromise;

        assert.equal(analysis.score, 0);
        assert.equal(
          analysis.metrics.pointerMovements,
          0
        );
      }
    );
  } finally {
    socket.disconnect();
  }

  await t.test(
    "telemetry is limited to 120 events per minute per socket",
    async () => {
      const rateLimitSocket = await connectClient();

      try {
        for (let i = 0; i < 120; i += 1) {
          const scorePromise = waitForEvent(
            rateLimitSocket,
            "load-score"
          );

          rateLimitSocket.emit("telemetry", {});

          await scorePromise;
        }

        const noExtraScore = expectNoEvent(
          rateLimitSocket,
          "load-score",
          250
        );

        rateLimitSocket.emit("telemetry", {});

        await noExtraScore;
      } finally {
        rateLimitSocket.disconnect();
      }
    }
  );
});

test("hesitation signals increase the interaction-friction score", async () => {
  const socket = await connectClient();

  try {
    const scorePromise = waitForEvent(socket, "load-score");

    socket.emit("telemetry", {
      hesitations: 1,
    });

    const analysis = await scorePromise;

    assert.equal(analysis.score, 8);
    assert.equal(analysis.severity, "Low");
    assert.equal(analysis.metrics.hesitations, 1);
  } finally {
    socket.disconnect();
  }
});

test("validation errors increase the interaction-friction score", async () => {
  const socket = await connectClient();

  try {
    const scorePromise = waitForEvent(socket, "load-score");

    socket.emit("telemetry", {
      validationErrors: 3,
    });

    const analysis = await scorePromise;

    assert.equal(analysis.score, 30);
    assert.equal(analysis.severity, "Moderate");
    assert.equal(analysis.metrics.validationErrors, 3);
  } finally {
    socket.disconnect();
  }
});

test("multiple confusion signals produce a high friction score", async () => {
  const socket = await connectClient();

  try {
    const scorePromise = waitForEvent(socket, "load-score");

    socket.emit("telemetry", {
      hesitations: 2,
      rageClicks: 2,
      validationErrors: 2,
      repeatedClicks: 2,
    });

    const analysis = await scorePromise;

    assert.equal(analysis.score, 68);
    assert.equal(analysis.severity, "High");
    assert.ok(analysis.recommendations.length >= 3);
  } finally {
    socket.disconnect();
  }
});

test("session reset returns an elevated friction score to zero", async () => {
  const socket = await connectClient();

  try {
    const elevatedScorePromise = waitForEvent(
      socket,
      "load-score"
    );

    socket.emit("telemetry", {
      hesitations: 2,
      validationErrors: 2,
    });

    const elevatedAnalysis = await elevatedScorePromise;

    assert.equal(elevatedAnalysis.score, 36);

    const resetScorePromise = waitForEvent(
      socket,
      "load-score"
    );

    socket.emit("reset-session");

    const resetAnalysis = await resetScorePromise;

    assert.equal(resetAnalysis.score, 0);
    assert.equal(resetAnalysis.severity, "Low");
  } finally {
    socket.disconnect();
  }
});