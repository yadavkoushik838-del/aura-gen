
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

async function waitForServer() {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Test server exited unexpectedly.\n${serverOutput}`
      );
    }

    try {
      const response = await fetch(`${serverUrl}/health`);

      if (response.ok) return;
    } catch {
      // Server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Test server did not become ready.\n${serverOutput}`
  );
}

function waitForEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    function handler(data) {
      clearTimeout(timer);
      resolve(data);
    }

    socket.once(eventName, handler);
  });
}

function expectNoEvent(socket, eventName, durationMs = 300) {
  return new Promise((resolve, reject) => {
    function handler() {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${eventName} event received`));
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

  await waitForServer();
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

test("AuraGen adaptation integration", async (t) => {
  const socket = await connectClient();

  try {
    await t.test(
      "does not automatically adapt below score 60",
      async () => {
        const scorePromise = waitForEvent(socket, "load-score");
        const noAdaptation = expectNoEvent(socket, "adapt-ui");

        socket.emit("telemetry", {
          hesitations: 4,
          rageClicks: 1,
        });

        const analysis = await scorePromise;

        assert.equal(analysis.score, 44);

        await noAdaptation;
      }
    );

    await t.test(
      "automatically adapts when score reaches 60",
      async () => {
        const adaptationPromise = waitForEvent(socket, "adapt-ui");
        const scorePromise = waitForEvent(socket, "load-score");

        socket.emit("telemetry", {
          rageClicks: 2,
        });

        const analysis = await scorePromise;
        const adaptation = await adaptationPromise;

        assert.equal(analysis.score, 68);
        assert.equal(adaptation.adaptationType, "automatic");
        assert.ok(adaptation.uiConfig);
      }
    );

    await t.test(
      "prevents duplicate automatic adaptations",
      async () => {
        const noDuplicate = expectNoEvent(socket, "adapt-ui", 500);

        socket.emit("telemetry", {
          hesitations: 1,
        });

        await noDuplicate;
      }
    );

    await t.test(
      "manual adaptation emits a manual adaptation event",
      async () => {
        const adaptationPromise = waitForEvent(socket, "adapt-ui");

        socket.emit("request-adaptation", {
          completedFieldCount: 2,
        });

        const adaptation = await adaptationPromise;

        assert.equal(adaptation.adaptationType, "manual");
        assert.ok(adaptation.uiConfig);
      }
    );

    await t.test(
      "session reset clears metrics and automatic trigger state",
      async () => {
        const resetPromise = waitForEvent(socket, "load-score");

        socket.emit("reset-session");

        const analysis = await resetPromise;

        assert.equal(analysis.score, 0);

        for (const value of Object.values(analysis.metrics)) {
          assert.equal(value, 0);
        }
      }
    );
  } finally {
    socket.disconnect();
  }
});
