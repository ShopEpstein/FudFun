const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { GenieRoom } = require("./src/GenieRoom");

module.exports = Arena({
  getId: () => "Genies World",
  initializeGameServer: (gameServer) => {
    gameServer.define("genie_world", GenieRoom);
  },
  initializeExpress: (_app) => {},
  beforeListen: () => {},
});

// Arena is injected by Colyseus Cloud at runtime
