const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GenieRoom } = require("./GenieRoom");

const port = Number(process.env.PORT || 2567);
const app = express();

const corsOptions = {
  origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};
app.use(cors(corsOptions));
// Handle CORS preflight for all routes, including Colyseus matchmaking endpoints
app.options("*", cors(corsOptions));
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
