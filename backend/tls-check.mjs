import tls from "node:tls";

const host = "ac-rpdnotn-shard-00-00.cz37jbn.mongodb.net";

const socket = tls.connect({
  host,
  port: 27017,
  servername: host
}, () => {
  console.log("TLS CONNECTED");
  console.log("Protocol:", socket.getProtocol());
  socket.end();
});

socket.setTimeout(10000, () => {
  console.log("TLS TIMEOUT");
  socket.destroy();
});

socket.on("error", error => {
  console.log("TLS ERROR:", error.code || error.message);
});
