// GenieRoom — the authoritative shared world, now with Supabase persistence.
// Player position + inventory survive server restarts, keyed by a stable client
// pid. If Supabase env vars aren't set, it runs in memory (no persistence) so
// the world still works for local/testing without a database.

const { Room } = require("colyseus");
const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");
const { createClient } = require("@supabase/supabase-js");

const WORLD = { w: 40, h: 40 };
const KINDS = ["mana", "herb", "shard"];
const NODE_COUNT = 28;
const NODE_MAX = 5;
const GATHER_COOLDOWN = 400; // ms between gathers per player
const SAVE_INTERVAL = 5000;  // flush changed players every 5s

// Server-side Supabase client (uses the service-role key, which bypasses RLS).
// Never expose this key to the browser. No env = persistence disabled.
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// --- synced state ---------------------------------------------------------
class Player extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.name = "genie";
    this.dir = "down";
    this.skin = 0;
    this.inv = new MapSchema();
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
const invToObj = (inv) => {
  const o = {};
  inv.forEach((v, k) => { o[k] = v; });
  return o;
};

// --- room -----------------------------------------------------------------
class GenieRoom extends Room {
  onCreate() {
    this.maxClients = 50;
    this.lastGather = {};
    this.pidOf = {};       // sessionId -> stable player id
    this.dirty = new Set(); // sessionIds with unsaved changes
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
        this.dirty.add(client.sessionId);
      }
    });

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
      this.dirty.add(client.sessionId);
    });

    // resource regen
    this.clock.setInterval(() => {
      this.state.nodes.forEach((n) => { if (n.amount < NODE_MAX) n.amount += 1; });
    }, 8000);

    // periodic persistence flush
    if (supabase) this.clock.setInterval(() => this.flushAll(), SAVE_INTERVAL);
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

  async onJoin(client, options) {
    const pid = (options?.pid ? String(options.pid) : client.sessionId).slice(0, 64);
    this.pidOf[client.sessionId] = pid;

    const p = new Player();
    p.name = (options?.name ? String(options.name) : "genie").slice(0, 16);
    p.skin = Math.floor(Math.random() * 6);

    // restore from the database if this player has been here before
    let saved = null;
    if (supabase) {
      try {
        const { data } = await supabase
          .from("players").select("x,y,inv,name").eq("pid", pid).maybeSingle();
        saved = data || null;
      } catch (e) {
        console.error("load failed:", e.message);
      }
    }

    if (saved) {
      p.x = clamp(saved.x | 0, 0, WORLD.w - 1);
      p.y = clamp(saved.y | 0, 0, WORLD.h - 1);
      if (saved.name) p.name = saved.name;
      const inv = saved.inv || {};
      for (const k of KINDS) if (inv[k]) p.inv.set(k, inv[k]);
    } else {
      p.x = Math.floor(Math.random() * WORLD.w);
      p.y = Math.floor(Math.random() * WORLD.h);
    }

    this.state.players.set(client.sessionId, p);
    console.log(`${p.name} joined ${this.roomId}${saved ? " (restored)" : ""}`);
  }

  async savePlayer(sessionId) {
    if (!supabase) return;
    const p = this.state.players.get(sessionId);
    const pid = this.pidOf[sessionId];
    if (!p || !pid) return;
    try {
      await supabase.from("players").upsert(
        { pid, name: p.name, x: p.x, y: p.y, inv: invToObj(p.inv), updated_at: new Date().toISOString() },
        { onConflict: "pid" }
      );
    } catch (e) {
      console.error("save failed:", e.message);
    }
  }

  async flushAll() {
    const ids = [...this.dirty];
    this.dirty.clear();
    for (const id of ids) await this.savePlayer(id);
  }

  async onLeave(client) {
    await this.savePlayer(client.sessionId); // final save on disconnect
    delete this.lastGather[client.sessionId];
    delete this.pidOf[client.sessionId];
    this.dirty.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }
}

module.exports = { GenieRoom, WORLD, KINDS };
