import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

export function createAuraSocket() {
  return io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
