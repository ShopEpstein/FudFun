import Phaser from "phaser";
import { Client } from "colyseus.js";

// --- world constants (must match the server) ------------------------------
const TILE_W = 64;
const TILE_H = 32;
const WORLD = { w: 40, h: 40 };
const SERVER =
  import.meta.env.VITE_SERVER ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "ws://localhost:2567"
    : "wss://fudfun-server.onrender.com");

const SKINS = [0x8a5bff, 0xff4d9d, 0x00e0ff, 0x7bff4d, 0xffc53d, 0xff5c5c];
const KIND = {
  mana:  { color: 0x00e0ff, icon: "🔮", label: "Mana Crystal" },
  herb:  { color: 0x7bff4d, icon: "🌿", label: "Wild Herb"    },
  shard: { color: 0xff4d9d, icon: "💎", label: "Shard"        },
};
const KINDS_ORDER = ["mana", "herb", "shard"];

const iso = (cx, cy) => ({ x: (cx - cy) * (TILE_W / 2), y: (cx + cy) * (TILE_H / 2) });
const isoInv = (wx, wy) => ({
  cx: Math.round((wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2),
  cy: Math.round((wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2),
});

// --- shared panel style ---------------------------------------------------
const PANEL =
  "font-family:ui-monospace,monospace;color:#ecedf5;" +
  "background:#101220ee;border:1px solid #ffffff22;" +
  "border-radius:10px;backdrop-filter:blur(8px);";

// --- mini-HUD (bottom-left, click to open inventory) ---------------------
const hud = document.createElement("div");
hud.style.cssText =
  `position:fixed;left:12px;bottom:12px;z-index:10;${PANEL}` +
  "font-size:14px;padding:8px 12px;cursor:pointer;user-select:none";
hud.title = "I — inventory";
hud.textContent = "inventory: empty";
document.body.appendChild(hud);

// --- inventory screen (modal) --------------------------------------------
const invOverlay = document.createElement("div");
invOverlay.style.cssText =
  "position:fixed;inset:0;z-index:30;background:#00000077;" +
  "display:none;align-items:center;justify-content:center;";
document.body.appendChild(invOverlay);

const invPanel = document.createElement("div");
invPanel.style.cssText =
  `${PANEL}padding:24px 32px;min-width:280px;max-width:420px;width:90vw;`;
invOverlay.appendChild(invPanel);

invPanel.innerHTML =
  `<div style="font-size:18px;font-weight:bold;margin-bottom:16px;letter-spacing:.04em">Inventory</div>` +
  `<div id="inv-rows"></div>` +
  `<div style="margin-top:16px;font-size:11px;color:#ffffff44">` +
  `[I] toggle &nbsp;·&nbsp; click outside to close &nbsp;·&nbsp; [Z] re-center camera</div>`;

const invRows = invPanel.querySelector("#inv-rows");

invPanel.addEventListener("click", e => e.stopPropagation());
invOverlay.addEventListener("click", () => toggleInv(false));

// --- status chip (top-right) ---------------------------------------------
const statusHud = document.createElement("div");
statusHud.style.cssText =
  `position:fixed;right:12px;top:12px;z-index:10;${PANEL}font-size:12px;padding:6px 10px`;
statusHud.textContent = "connecting…";
document.body.appendChild(statusHud);

// --- re-center button (appears when camera is free-roaming) --------------
const recenterBtn = document.createElement("button");
recenterBtn.style.cssText =
  `position:fixed;bottom:72px;right:12px;z-index:10;${PANEL}` +
  "font-size:12px;padding:6px 12px;cursor:pointer;border:1px solid #ffffff44;display:none";
recenterBtn.textContent = "⊙ re-center  [Z]";
document.body.appendChild(recenterBtn);

// --- gather button (bottom-center, shown when adjacent to a node) --------
const gatherBtn = document.createElement("button");
gatherBtn.textContent = "⛏ Gather";
gatherBtn.style.cssText =
  `position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:10;${PANEL}` +
  "font-size:16px;padding:10px 28px;min-height:48px;min-width:120px;" +
  "cursor:pointer;border:1px solid #8a5bff88;display:none;touch-action:manipulation";
document.body.appendChild(gatherBtn);

// --- module-level helpers (need access to scene) -------------------------
let _scene = null;

function toggleInv(force) {
  const open = force !== undefined ? force : invOverlay.style.display === "none";
  invOverlay.style.display = open ? "flex" : "none";
  if (_scene) _scene.invOpen = open;
}

hud.addEventListener("click", () => toggleInv());
recenterBtn.addEventListener("click", () => _scene && _scene.recenterCamera());

// --- scene ---------------------------------------------------------------
class WorldScene extends Phaser.Scene {
  constructor() {
    super("world");
    this.others      = new Map();
    this.nodeGfx     = new Map();
    this.lastStep    = 0;
    this.nearNode    = null;
    this.invOpen     = false;
    this.freeCamera  = false;
    this.touchTarget = null;
    _scene = this;
  }

  async create() {
    this.cameras.main.setBackgroundColor("#0b0c13");
    this.board = this.add.container(0, 0);
    this.drawGround();

    this.cursors  = this.input.keyboard.createCursorKeys();
    this.keys     = this.input.keyboard.addKeys("W,A,S,D");
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.iKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.zKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);

    // Suppress right-click context menu so right-drag pans the camera.
    this.input.mouse.disableContextMenu();

    // Right-click or middle-mouse drag → free-roam camera pan.
    this.input.on("pointermove", (pointer) => {
      if (!pointer.isDown) return;
      if (!pointer.middleButtonDown() && !pointer.rightButtonDown()) return;
      const dx = pointer.x - pointer.prevPosition.x;
      const dy = pointer.y - pointer.prevPosition.y;
      this.cameras.main.stopFollow();
      this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
      this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
      if (!this.freeCamera) { this.freeCamera = true; recenterBtn.style.display = "block"; }
    });

    // Tap-to-move: left-click / touch on the game canvas.
    this.input.on("pointerdown", (ptr) => {
      if (!this.me || ptr.rightButtonDown() || ptr.middleButtonDown()) return;
      let { cx, cy } = isoInv(ptr.worldX, ptr.worldY);
      cx = Phaser.Math.Clamp(cx, 0, WORLD.w - 1);
      cy = Phaser.Math.Clamp(cy, 0, WORLD.h - 1);
      this.touchTarget = { cx, cy };
    });

    // Gather button tap.
    gatherBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.doGather();
    });

    const name = (window.prompt("Pick a genie name") || "genie").slice(0, 16);

    let pid = localStorage.getItem("genie_pid");
    if (!pid) {
      pid = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());
      localStorage.setItem("genie_pid", pid);
    }

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
    statusHud.textContent = "connected";
    this.bindState();
  }

  recenterCamera() {
    if (!this.me) return;
    this.cameras.main.startFollow(this.me, true, 0.12, 0.12);
    this.freeCamera = false;
    recenterBtn.style.display = "none";
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
    c.x = x; c.y = y;
    c.setDepth(y);
  }

  updateHud(inv) {
    const parts = [];
    inv.forEach((count, kind) => {
      const k = KIND[kind] || { icon: "•" };
      if (count > 0) parts.push(`${k.icon} ${kind} ${count}`);
    });
    hud.textContent = parts.length ? parts.join("   ") : "inventory: empty";

    invRows.innerHTML = "";
    KINDS_ORDER.forEach(kind => {
      const k = KIND[kind];
      const count = inv.get ? (inv.get(kind) || 0) : (inv[kind] || 0);
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:12px;padding:10px 0;" +
        "border-bottom:1px solid #ffffff11;";
      row.innerHTML =
        `<span style="font-size:22px;width:28px;text-align:center">${k.icon}</span>` +
        `<span style="flex:1;color:#ecedf5bb">${k.label}</span>` +
        `<span style="font-size:16px;font-weight:bold;min-width:28px;text-align:right;` +
        `color:${count > 0 ? "#ecedf5" : "#ffffff33"}">${count}</span>`;
      invRows.appendChild(row);
    });
  }

  floatText(c, txt, color) {
    const t = this.add
      .text(c.x, c.y - 50, txt, { fontFamily: "monospace", fontSize: "14px", color })
      .setOrigin(0.5).setDepth(99999);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  updateStatus() {
    const n = this.room ? this.room.state.players.size : 0;
    statusHud.textContent = `🧞 ${n} genie${n !== 1 ? "s" : ""}`;
  }

  bindState() {
    const seenPlayers = new Set();
    const spawnPlayer = (player, id) => {
      if (seenPlayers.has(id)) return;
      seenPlayers.add(id);
      console.log("[spawn]", id, player.name, "@", player.x, player.y);
      const g = this.makeGenie(player.skin, player.name);
      this.placeAt(g, player.x, player.y);
      if (id === this.room.sessionId) {
        this.me = g;
        this.mx = player.x;
        this.my = player.y;
        const { x, y } = iso(player.x, player.y);
        this.cameras.main.centerOn(x, y);
        this.cameras.main.startFollow(g, true, 0.12, 0.12);
        this.updateHud(player.inv);
        player.inv.onChange(() => this.updateHud(player.inv));
      } else {
        this.others.set(id, { g, tx: player.x, ty: player.y });
      }
      this.updateStatus();
      player.onChange(() => {
        if (id === this.room.sessionId) return;
        const o = this.others.get(id);
        if (o) { o.tx = player.x; o.ty = player.y; }
      });
    };
    this.room.state.players.onAdd((p, id) => spawnPlayer(p, id));
    this.room.state.players.forEach((p, id) => spawnPlayer(p, id));

    this.room.state.players.onRemove((_p, id) => {
      seenPlayers.delete(id);
      const o = this.others.get(id);
      if (o) { o.g.destroy(); this.others.delete(id); }
      this.updateStatus();
    });

    const seenNodes = new Set();
    const spawnNode = (node, id) => {
      if (seenNodes.has(id)) return;
      seenNodes.add(id);
      const c = this.makeNode(node.kind);
      this.placeAt(c, node.x, node.y);
      this.nodeGfx.set(id, { c, node });
      node.onChange(() => {
        c.setVisible(node.amount > 0);
        c.gem.setScale(0.55 + 0.09 * node.amount);
      });
    };
    this.room.state.nodes.onAdd((n, id) => spawnNode(n, id));
    this.room.state.nodes.forEach((n, id) => spawnNode(n, id));

    this.room.state.nodes.onRemove((_n, id) => {
      seenNodes.delete(id);
      const g = this.nodeGfx.get(id);
      if (g) { g.c.destroy(); this.nodeGfx.delete(id); }
    });
  }

  doGather() {
    if (!this.nearNode) return;
    const g = this.nodeGfx.get(this.nearNode);
    this.room.send("gather", { id: this.nearNode });
    if (g) this.floatText(this.me, "+1 " + (KIND[g.node.kind]?.icon || ""), "#ffe600");
  }

  update(time) {
    if (Phaser.Input.Keyboard.JustDown(this.iKey)) toggleInv();
    if (Phaser.Input.Keyboard.JustDown(this.zKey)) this.recenterCamera();

    if (!this.invOpen && this.me && time - this.lastStep > 140) {
      let dx = 0, dy = 0, dir = null;
      if      (this.cursors.left.isDown  || this.keys.A.isDown) { dx = -1; dir = "left";  }
      else if (this.cursors.right.isDown || this.keys.D.isDown) { dx =  1; dir = "right"; }
      else if (this.cursors.up.isDown    || this.keys.W.isDown) { dy = -1; dir = "up";    }
      else if (this.cursors.down.isDown  || this.keys.S.isDown) { dy =  1; dir = "down";  }

      if (!dir && this.touchTarget) {
        const { cx: tx, cy: ty } = this.touchTarget;
        if      (tx !== this.mx) { dx = tx > this.mx ? 1 : -1; dir = dx > 0 ? "right" : "left"; }
        else if (ty !== this.my) { dy = ty > this.my ? 1 : -1; dir = dy > 0 ? "down"  : "up";   }
        else                     { this.touchTarget = null; }
      }

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

    this.others.forEach((o) => {
      const { x, y } = iso(o.tx, o.ty);
      o.g.x = Phaser.Math.Linear(o.g.x, x, 0.2);
      o.g.y = Phaser.Math.Linear(o.g.y, y, 0.2);
      o.g.setDepth(o.g.y);
    });

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
    gatherBtn.style.display = (near && !this.invOpen) ? "block" : "none";

    if (!this.invOpen && this.nearNode && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.doGather();
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
