
"use client";

import { useEffect, useRef } from "react";

export function useTelemetry({ socket, enabled = true }) {
  const lastMoveAt = useRef(Date.now());
  const lastPosition = useRef(null);
  const recentClicks = useRef([]);

  // Pointer movement is measured locally and never transmitted as coordinates.
  const movementWindow = useRef({
    startedAt: Date.now(),
    distance: 0,
  });

  const lastPointerMovementEventAt = useRef(0);

  useEffect(() => {
    if (!socket || !enabled) return;

    const send = (payload) => {
      if (!socket.connected) return;
      socket.emit("telemetry", payload);
    };

    // Detect hesitation after a long pause followed by pointer movement.
    const onPointerMove = (event) => {
      const now = Date.now();

      if (lastPosition.current) {
        const dx = event.clientX - lastPosition.current.x;
        const dy = event.clientY - lastPosition.current.y;

        const distance = Math.sqrt(dx * dx + dy * dy);
        const pauseDuration = now - lastMoveAt.current;

        if (pauseDuration > 4500 && distance > 15) {
          send({ hesitations: 1 });
        }

        // Track meaningful movement within a one-second window.
        if (now - movementWindow.current.startedAt > 1000) {
          movementWindow.current = {
            startedAt: now,
            distance: 0,
          };
        }

        movementWindow.current.distance += distance;

        // Require at least 120px of movement.
        // Apply a two-second cooldown to avoid excessive events.
        if (
          movementWindow.current.distance >= 120 &&
          now - lastPointerMovementEventAt.current >= 2000
        ) {
          send({ pointerMovements: 1 });

          lastPointerMovementEventAt.current = now;

          movementWindow.current = {
            startedAt: now,
            distance: 0,
          };
        }
      }

      // Coordinates remain local and are never sent to the backend.
      lastPosition.current = {
        x: event.clientX,
        y: event.clientY,
      };

      lastMoveAt.current = now;
    };

    const getInteractiveTarget = (event) => {
      if (!(event.target instanceof Element)) return null;

      return event.target.closest(
        'button, a, input, select, textarea, [role="button"], [data-telemetry-target]'
      );
    };

    // Detect repeated and rapid clicks on the same element.
    const onClick = (event) => {
      const now = Date.now();
      const target = getInteractiveTarget(event);

      if (!target) return;

      recentClicks.current = recentClicks.current.filter(
        (click) => now - click.time < 1800
      );

      recentClicks.current.push({
        target,
        time: now,
      });

      const sameTargetClicks = recentClicks.current.filter(
        (click) => click.target === target
      );

      // Four or more clicks may indicate a rage click.
      if (sameTargetClicks.length >= 4) {
        send({
          rageClicks: 1,
          repeatedClicks: 1,
        });

        recentClicks.current = recentClicks.current.filter(
          (click) => click.target !== target
        );

        return;
      }

      // Two quick clicks indicate repeated clicking.
      if (sameTargetClicks.length >= 2) {
        const previousClick =
          sameTargetClicks[sameTargetClicks.length - 2];

        if (now - previousClick.time < 600) {
          send({ repeatedClicks: 1 });
        }
      }
    };

    // Reset tracking when the browser tab becomes hidden.
    const onVisibilityChange = () => {
      if (document.hidden) {
        lastPosition.current = null;
        lastMoveAt.current = Date.now();
        recentClicks.current = [];

        movementWindow.current = {
          startedAt: Date.now(),
          distance: 0,
        };
      } else {
        lastMoveAt.current = Date.now();
        lastPosition.current = null;

        movementWindow.current = {
          startedAt: Date.now(),
          distance: 0,
        };
      }
    };

    window.addEventListener("pointermove", onPointerMove, {
      passive: true,
    });

    window.addEventListener("click", onClick);

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("click", onClick);

      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
    };
  }, [socket, enabled]);
}
