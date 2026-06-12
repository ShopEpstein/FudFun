import Phaser from "phaser";
import { Client } from "colyseus.js";

// --- world constants (must match the server) ------------------------------
const TILE_W = 64;
const TILE_H = 32;
const WORLD = { w: 40, h: 40 };
const SERVER = import.meta.env.VITE_SERVER || "ws://localhost:2567";

// original placeholder art keys — swap for real genie-world art later
const SKINS = [0x8a5bff, 0xff4d9d, 0x00e0ff, 0x7bff4d, 0xffc53d, 0xff5c5c];
const KIND = {
  mana:  { color: 0x00e0ff, icon: "🔮" },
  herb:  { color: 0x7bff4d, icon: "🌿" },
  shard: { color: 0xff4d9d, icon: "💎" },
};

const iso = (cx, cy) => ({ x: (cx - cy) * (TILE_W / 2), y: (cx + cy) * (TILE_H / 2) });

// --- inventory HUD (DOM overlay) ------------------------------------------
const hud = document.createElement("div");
hud.style.cssText =
  "position:fixed;left:12px;bottom:12px;z-index:10;font-family:ui-monospace,monospace;" +
  "font-size:14px;color:#ecedf5;background:#101220cc;border:1px solid #ffffff22;" +
  "border-radius:10px;padding:8px 12px;backdrop-filter:blur(8px)";
hud.textContent = "inventory: empty";
document.body.appendChild(hud);

class WorldScene extends Phaser.Scene {
  constructor() {
    super("world");
    this.others = new Map();
    this.nodeGfx = new Map();
    this.lastStep = 0;
    this.nearNode = null;
  }

  async create() {
    this.cameras.main.setBackgroundColor("#0b0c13");
    this.board = this.add.container(0, 0);
    this.drawGround();

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    const name = (window.prompt("Pick a genie name") || "genie").slice(0, 16);

    // stable id so the server can restore your saved position + inventory
    let pid = localStorage.getItem("genie_pid");
    if (!pid) { pid = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()); localStorage.setItem("genie_pid", pid); }

    this.client = new Client(SERVER);
    try {
      this.room = await this.client.joinOrCreate("genie_world", { name, pid });
    } catch (e) {
      this.add
        .text(20, 20,
          "Couldn't reach the world server.\nStart it: cd server && npm install && npm start",
          { fontFamily: "monospace", fontSize: "14px", color: "#ff5c5c" })
        .setScrollFactor(0);
      return;
    }
    this.bindState();
  }

  drawGround() {
    for (let cx = 0; cx < WORLD.w; cx++)
      for (let cy = 0; cy < WORLD.h; cy++) {
        const { x, y } = iso(cx, cy);
        const shade = (cx + cy) % 2 ? 0x16321f : 0x122819;
        this.board.add(
          this.add
            .polygon(x, y, [0, -TILE_H / 2, TILE_W / 2, 0, 0, TILE_H / 2, -TILE_W / 2, 0], shade)
            .setStrokeStyle(1, 0x1f4a2e, 0.5)
        );
      }
  }

  makeGenie(skin, name) {
    const c = this.add.container(0, 0);
    c.add([
      this.add.ellipse(0, 2, 22, 10, 0x000000, 0.35),
      this.add.circle(0, -14, 11, SKINS[skin % SKINS.length]).setStrokeStyle(2, 0x0b0c13),
      this.add.text(0, -40, name, { fontFamily: "monospace", fontSize: "12px", color: "#ecedf5" }).setOrigin(0.5),
    ]);
    this.board.add(c);
    return c;
  }

  makeNode(kind) {
    const k = KIND[kind] || KIND.mana;
    const c = this.add.container(0, 0);
    const gem = this.add.star(0, -8, 4, 5, 12, k.color).setStrokeStyle(2, 0x0b0c13);
    c.add([this.add.ellipse(0, 0, 18, 8, 0x000000, 0.3), gem]);
    c.gem = gem;
    this.board.add(c);
    return c;
  }

  placeAt(c, cx, cy) {
    const { x, y } = iso(cx, cy);
    c.x = x;
    c.y = y;
    c.setDepth(y);
  }

  updateHud(inv) {
    const parts = [];
    inv.forEach((count, kind) => {
      const k = KIND[kind] || { icon: "•" };
      if (count > 0) parts.push(`${k.icon} ${kind} ${count}`);
    });
    hud.textContent = parts.length ? parts.join("   ") : "inventory: empty";
  }

  floatText(c, txt, color) {
    const t = this.add
      .text(c.x, c.y - 50, txt, { fontFamily: "monospace", fontSize: "14px", color })
      .setOrigin(0.5)
      .setDepth(99999);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  bindState() {
    // --- players ---
    this.room.state.players.onAdd((player, id) => {
      const g = this.makeGenie(player.skin, player.name);
      this.placeAt(g, player.x, player.y);
      if (id === this.room.sessionId) {
        this.me = g;
        this.mx = player.x;
        this.my = player.y;
        this.cameras.main.startFollow(g, true, 0.12, 0.12);
        player.inv.onChange(() => this.updateHud(player.inv));
      } else {
        this.others.set(id, { g, tx: player.x, ty: player.y });
      }
      player.onChange(() => {
        if (id === this.room.sessionId) return;
        const o = this.others.get(id);
        if (o) { o.tx = player.x; o.ty = player.y; }
      });
    });
    this.room.state.players.onRemove((_p, id) => {
      const o = this.others.get(id);
      if (o) { o.g.destroy(); this.others.delete(id); }
    });

    // --- resource nodes ---
    this.room.state.nodes.onAdd((node, id) => {
      const c = this.makeNode(node.kind);
      this.placeAt(c, node.x, node.y);
      this.nodeGfx.set(id, { c, node });
      node.onChange(() => {
        c.setVisible(node.amount > 0);
        c.gem.setScale(0.55 + 0.09 * node.amount);
      });
    });
    this.room.state.nodes.onRemove((_n, id) => {
      const g = this.nodeGfx.get(id);
      if (g) { g.c.destroy(); this.nodeGfx.delete(id); }
    });
  }

  update(time) {
    // self movement: one tile per ~140ms, predicted locally, confirmed by server
    if (this.me && time - this.lastStep > 140) {
      let dx = 0, dy = 0, dir = null;
      if (this.cursors.left.isDown || this.keys.A.isDown) { dx = -1; dir = "left"; }
      else if (this.cursors.right.isDown || this.keys.D.isDown) { dx = 1; dir = "right"; }
      else if (this.cursors.up.isDown || this.keys.W.isDown) { dy = -1; dir = "up"; }
      else if (this.cursors.down.isDown || this.keys.S.isDown) { dy = 1; dir = "down"; }
      if (dir) {
        const nx = Phaser.Math.Clamp(this.mx + dx, 0, WORLD.w - 1);
        const ny = Phaser.Math.Clamp(this.my + dy, 0, WORLD.h - 1);
        if (nx !== this.mx || ny !== this.my) {
          this.mx = nx; this.my = ny;
          this.placeAt(this.me, nx, ny);
          this.room.send("move", { x: nx, y: ny, dir });
        }
        this.lastStep = time;
      }
    }

    // others glide toward their last server-confirmed tile
    this.others.forEach((o) => {
      const { x, y } = iso(o.tx, o.ty);
      o.g.x = Phaser.Math.Linear(o.g.x, x, 0.2);
      o.g.y = Phaser.Math.Linear(o.g.y, y, 0.2);
      o.g.setDepth(o.g.y);
    });

    // highlight an adjacent, non-empty node you can gather
    let near = null;
    if (this.me) {
      this.nodeGfx.forEach((g, id) => {
        const n = g.node;
        const adj = Math.abs(n.x - this.mx) + Math.abs(n.y - this.my) <= 1 && n.amount > 0;
        g.c.gem.setStrokeStyle(2, adj ? 0xffffff : 0x0b0c13);
        if (adj) near = id;
      });
    }
    this.nearNode = near;

    // gather on SPACE
    if (this.nearNode && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const g = this.nodeGfx.get(this.nearNode);
      this.room.send("gather", { id: this.nearNode });
      if (g) this.floatText(this.me, "+1 " + (KIND[g.node.kind]?.icon || ""), "#ffe600");
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#0b0c13",
  scene: [WorldScene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
});
