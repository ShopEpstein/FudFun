const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GenieRoom } = require("./GenieRoom");

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());
app.get("/healthz", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const transport = new WebSocketTransport({ server });

const gameServer = new Server({ transport });
gameServer.define("genie_world", GenieRoom);

// Let Colyseus attach its matchmaking routes to our express app
gameServer.attach({ server, express: app });

server.listen(port, () => {
  console.log(`🧞 Genies server listening on :${port}`);
});
