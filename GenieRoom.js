// GenieRoom — the authoritative shared world.
// Now with resource nodes, server-validated gathering, and per-player inventory.
// The server still owns the truth: clients *request* to gather, the server decides.

const { Room } = require("colyseus");
const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");

const WORLD = { w: 40, h: 40 };
const KINDS = ["mana", "herb", "shard"];
const NODE_COUNT = 28;
const NODE_MAX = 5;
const GATHER_COOLDOWN = 400; // ms between gathers, per player (anti-spam)

// --- synced state ---------------------------------------------------------
class Player extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.name = "genie";
    this.dir = "down";
    this.skin = 0;
    this.inv = new MapSchema(); // kind -> count
  }
}
defineTypes(Player, {
  x: "number", y: "number", name: "string", dir: "string", skin: "uint8",
  inv: { map: "number" },
});

class ResourceNode extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.kind = "mana";
    this.amount = NODE_MAX;
  }
}
defineTypes(ResourceNode, { x: "number", y: "number", kind: "string", amount: "uint16" });

class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.nodes = new MapSchema();
  }
}
defineTypes(WorldState, { players: { map: Player }, nodes: { map: ResourceNode } });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const adjacent = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) <= 1;

// --- room -----------------------------------------------------------------
class GenieRoom extends Room {
  onCreate() {
    this.maxClients = 50;
    this.lastGather = {}; // sessionId -> timestamp (not synced)
    this.setState(new WorldState());
    this.spawnNodes();

    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const nx = clamp(Math.round(Number(data?.x)) || 0, 0, WORLD.w - 1);
      const ny = clamp(Math.round(Number(data?.y)) || 0, 0, WORLD.h - 1);
      if (Math.abs(nx - p.x) + Math.abs(ny - p.y) <= 1) {
        p.x = nx;
        p.y = ny;
        if (typeof data.dir === "string") p.dir = data.dir;
      }
    });

    // Gather: validate it's a real node, the player is next to it, it has
    // resource left, and the player isn't spamming. Only then award it.
    this.onMessage("gather", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      const node = this.state.nodes.get(String(data?.id));
      if (!p || !node || node.amount <= 0) return;
      const now = Date.now();
      if (now - (this.lastGather[client.sessionId] || 0) < GATHER_COOLDOWN) return;
      if (!adjacent(p.x, p.y, node.x, node.y)) return;
      this.lastGather[client.sessionId] = now;
      node.amount -= 1;
      p.inv.set(node.kind, (p.inv.get(node.kind) || 0) + 1);
    });

    // Regen so the world can't be strip-mined to nothing.
    this.clock.setInterval(() => {
      this.state.nodes.forEach((n) => {
        if (n.amount < NODE_MAX) n.amount += 1;
      });
    }, 8000);
  }

  spawnNodes() {
    for (let i = 0; i < NODE_COUNT; i++) {
      const n = new ResourceNode();
      n.x = Math.floor(Math.random() * WORLD.w);
      n.y = Math.floor(Math.random() * WORLD.h);
      n.kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      n.amount = NODE_MAX;
      this.state.nodes.set("n" + i, n);
    }
  }

  onJoin(client, options) {
    const p = new Player();
    p.x = Math.floor(Math.random() * WORLD.w);
    p.y = Math.floor(Math.random() * WORLD.h);
    p.name = (options?.name ? String(options.name) : "genie").slice(0, 16);
    p.skin = Math.floor(Math.random() * 6);
    this.state.players.set(client.sessionId, p);
    console.log(`${p.name} joined ${this.roomId}`);
  }

  onLeave(client) {
    delete this.lastGather[client.sessionId];
    this.state.players.delete(client.sessionId);
  }
}

module.exports = { GenieRoom, WORLD, KINDS };
