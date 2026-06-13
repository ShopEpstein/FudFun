const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GenieRoom } = require("./GenieRoom");

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.options("*", cors({ origin: "*" }));
app.use(express.json());
app.get("/healthz", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);

// Creating the Server with this transport binds the WebSocket upgrade handler
// and matchmaking routes to `server` exactly once. Calling gameServer.attach()
// as well would bind a second upgrade handler to the same socket, which makes
// ws throw "handleUpgrade() was called more than once" and silently kills the
// room connection — the client joins but never receives state.
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define("genie_world", GenieRoom);

server.listen(port, () => {
  console.log(`🧞 Genies server listening on :${port}`);
});
