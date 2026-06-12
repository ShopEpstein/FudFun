const http = require("http");
const express = require("express");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GenieRoom } = require("./GenieRoom");

const port = Number(process.env.PORT || 2567);
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const server = http.createServer(app);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define("genie_world", GenieRoom);

gameServer.listen(port).then(() => {
  console.log(`🧞 Genies server listening on :${port}`);
});
