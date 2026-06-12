const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GenieRoom } = require("./GenieRoom");

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());

const server = http.createServer(app);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define("genie_world", GenieRoom);

gameServer.listen(port).then(() => {
  console.log(`🧞 Genies server listening on :${port}`);
});
