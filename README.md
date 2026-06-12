# Genies — multiplayer world (milestone 1)

An original isometric browser MMO starter. This milestone gets you the hard part
first: a **live shared world** where real players connect and see each other move,
with the **server** owning the truth (no trust-the-client cheating).

Everything here is original — our own code, our own (placeholder) art, our own map.
Nothing is copied from any other game.

## Stack
- **Client:** Phaser (isometric rendering) + Vite
- **Server:** Colyseus (authoritative rooms + automatic state sync), Node
- Later: Supabase (persistence/economy/auth), Solana wallet-gate

## Run it (two terminals)

```bash
# 1) world server
cd server
npm install
npm start            # -> 🧞 Genies server listening on :2567

# 2) client
cd client
npm install
npm run dev          # -> http://localhost:5173
```

Open the client URL in **two browser windows**, pick a name in each, and you
should see both genies walking around the same world in real time. That's the
milestone: a real multiplayer shared world.

## Honest notes (read before you run)
- I wrote this code but **could not run it in my environment** — there's no way to
  boot a live Colyseus server + two browsers where I am. It's correct, idiomatic
  starter code, but expect to need a small adjustment or two on first run. That's
  exactly the loop Claude Code (or a local run) closes: run, read the error, fix.
- **Version sensitivity:** Colyseus's client callback API changed across versions.
  This uses the v0.15+ form (`getStateCallbacks(room)`). If `npm install` pulls a
  different major version, the `onAdd` / `onChange` wiring in `client/src/main.js`
  and/or the server `Server({ transport })` setup in `server/src/index.js` may need
  a tweak to match the installed version's API. Pin versions or adjust to match.

## Dividing the labor (you asked)
The work splits cleanly by function — this is where a second agent / image model
actually helps, rather than two of us editing the same netcode:
- **Art (parallel, biggest win):** original genie sprites, tiles, the world theme.
  Hand this to an image model / designer now; the code uses placeholder shapes that
  swap out cleanly. This is the part I can only stub.
- **Run / test / deploy:** Claude Code in your repo — it boots the server + client,
  tests two windows seeing each other, deploys the server to Colyseus Cloud and the
  client to Vercel. The thing I can't do from chat.
- **Me:** keep building the game systems, file by file (below).

## Roadmap
- [x] **Milestone 1 — live shared world.** Authoritative server, players see each
  other move in real time.
- [x] **Milestone 2 — gathering + inventory.** Resource nodes (mana/herb/shard),
  walk up + SPACE to gather, server-validated, synced inventory HUD, regen.
- [ ] **Milestone 3 — persistence.** Supabase: save player position, inventory, and
  the economy so the world survives restarts.
- [ ] **Milestone 4 — wallet gate.** Solana wallet connect + "hold 1 $GENIE to
  enter," verified server-side.
- [ ] **Milestone 5 — quests + marketplace.** Quest givers, a player marketplace
  priced in-game.
- [ ] **Milestone 6 — polish + scale.** Real art in, interest management, Colyseus
  Cloud scaling.

Once it runs and you see two genies gathering in one world, the loop is real and
everything else bolts onto this.
