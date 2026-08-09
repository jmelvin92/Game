# CLAUDE.md

Orientation for any Claude session working in this repository. Read this before touching anything.
Keeping it accurate is part of finishing every phase — a stale orientation file is worse than none,
because it gets trusted.

---

## 1. What this is

An **isometric game engine** in TypeScript, rendering to HTML canvas. No game engine (no Unity, no
Godot), no rendering framework. Everything is hand-written and everything is plain text.

That choice was deliberate: the hard parts of this genre are simulation — tile world, collision,
line-of-sight, pathfinding, persistence — and an engine helps with none of them. What an engine
would cost is an editor-centric workflow of binary scene files, which suits neither an AI-written
codebase nor a non-programmer reviewer.

### What has NOT been decided

**The game itself.** There is no theme, no setting, no genre commitment.

An early conversation used a Project Zomboid–style zombie survival game as a reference point for
the _perspective and scale_. That reference is **not** the plan — the direction is explicitly open
and probably isn't zombies.

So: **build only what is true of any isometric game.** Do not add tiles named "grass", items,
enemies, health, crafting, or win conditions. Do not infer a direction from this file, from the
git history, or from the reference above. If a task seems to require a design decision, stop and
ask Joshua.

The engine knows only what it structurally needs from a tile: _is it solid, is it opaque, how tall
is it._ It never learns what a wall or a road is.

---

## 2. Who you are working with

**Joshua** (GitHub `jmelvin92`) directs the game design. He does not write code and does not read
it. This shapes how to work:

- **Verify your own work.** Run `npm run dev`, open it in Chrome with the browser tools, screenshot
  it, and read the console. Do not hand Joshua a change and ask whether it worked — he cannot tell
  you, and asking him to debug is asking him to do something he explicitly cannot do.
- **Explain in plain terms.** Describe what changed and what it means for the game. Skip the
  implementation detail unless it affects a decision that is his to make.
- **He decides design; you decide engineering.** Theme, mechanics, and feel are his. Architecture,
  naming, and library choices are yours — make them and say what you picked.
- **His standard is explicit:** built slowly and correctly, no spaghetti, no fluff, no cut corners,
  written to a professional standard. Prefer doing it properly over doing it quickly. If something
  needs to be done twice to be right, do it twice.

---

## 3. Where to find information

| Question                      | Where to look                                          |
| ----------------------------- | ------------------------------------------------------ |
| What changed in each release? | `CHANGELOG.md`                                         |
| **Why** does this line exist? | `git log` — commit bodies carry the reasoning (see §6) |
| What did it look like before? | Tags: `git checkout v0.1.0`. Every phase is tagged.    |
| What are the rules here?      | This file                                              |
| How do I run it?              | §4 below, or `README.md`                               |

There are deliberately **no** architecture decision records and **no** devlog. That was a
considered choice: the reasoning lives in commit bodies instead. This only works if commit messages
stay genuinely good, which is why a hook enforces them.

---

## 4. Commands

```sh
npm run dev        # dev server, hot reload, http://localhost:5173
npm run build      # production build
npm test           # unit tests (vitest, headless)
npm run typecheck  # type errors only, no emit
npm run lint       # eslint, including architecture boundaries
npm run format     # apply prettier
```

---

## 5. Architecture

### The layers

Dependencies point **strictly downward**. A layer may import from layers below it and never from
layers above.

```
render/    drawing, camera, isometric transforms   ← may read everything below
persist/   save / load
nav/       pathfinding
entity/    entities, movement, collision
world/     tile storage, chunks
core/      loop, input, math, RNG                  ← depends on nothing
```

### The rule that matters most

**Simulation never imports rendering.** Nothing in `core/`, `world/`, `entity/`, `nav/`, or
`persist/` may import from `render/`.

This is not a style preference. It is what keeps all logic testable without a browser, lets the
renderer be replaced outright, and keeps the engine portable off the web if it ever outgrows the
browser. **ESLint fails the build on violation** — it is a rule a machine checks, not an intention.

If you find yourself wanting to import `render/` from a simulation module, the design is wrong.
Simulation produces state; rendering reads it. Never the reverse.

### Other standards

- **TypeScript strict**, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **No `any`.** No `@ts-expect-error` without a comment explaining why it is unavoidable.
- **Test the logic, not the pixels.** Transforms, collision, pathfinding, chunk maths, and save
  round-trips get tests. Rendered output does not.
- **No dependency gets added without a reason worth stating** in the commit body.

---

## 6. Working agreement

### Branches

Two branches. That is the whole model.

```
main  ──●───────────────●──────       protected. only ever receives merges from dev
         \             /
dev   ────●──●──●──●──●──●──●──       all work happens here
```

- **`dev`** — where everything is built. Commit and push freely; breaking it costs nothing.
- **`main`** — known-good, tagged. Merged from `dev` when a phase is finished and green.

`main` is protected by GitHub with `enforce_admins` on, so a direct push is refused server-side even
with `--no-verify`, and force-pushes and deletion are refused outright. Merging `dev` into `main` is
one command: `gh pr create --base main --head dev && gh pr merge --merge`.

Because published history cannot be rewritten, undo a bad commit on `main` with a revert, never a
force-push.

Short `feature/*` branches off `dev` are fine for anything risky, but they are optional — do not
turn a two-line change into a ceremony.

### Commits

**Subject says what changed. Body says why.** The diff already shows what changed and can never
show what it was for — the body is the only place the reasoning survives.

```
feat(nav): cache flow fields per destination tile

A* ran per-entity per-frame, which collapsed to ~8fps once more than
about 40 actors shared a destination. Actors heading to the same tile
can share one field, so it's computed once and reused until the tile
map around it changes.

Invalidated by any tile mutation inside the field's bounds.
```

Format: `type(scope): subject` — subject in imperative mood, lowercase, no trailing period, ≤72
chars. Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.
**A body is required** for every type except `chore` and `docs`.

The `commit-msg` hook rejects anything that does not parse. Do not bypass it with `--no-verify`.

### Pushing

Push the same day the work is written. Nothing of value should ever exist only on this laptop —
GitHub is the backup, and every commit is a restore point.

---

## 7. Where the project stands

**Current phase: 0 — infrastructure.** No game code exists yet, by design.

| Phase | Delivers                                                        | Tag      | Status      |
| ----- | --------------------------------------------------------------- | -------- | ----------- |
| **0** | Repo, toolchain, hooks, CI, boundaries                          | `v0.1.0` | in progress |
| **1** | Game loop, input, isometric maths, tile grid, camera            | `v0.2.0` | not started |
| **2** | Entities, movement, collision, depth sorting, occlusion         | `v0.3.0` | not started |
| **3** | Chunked world, pathfinding, versioned save/load                 | `v0.4.0` | not started |
| —     | **Decide the game.** Engine is finished; direction gets chosen. |          |             |

Phase 1 detail, for whoever picks this up next: 64×32 diamond tiles, transform
`sx = (wx - wy) * 32`, `sy = (wx + wy) * 16 - wz * 32`. Implement the inverse too — it is what lets
the mouse pick a tile. Test the round-trip exhaustively before building anything on it; a subtle
error there makes everything downstream look wrong for reasons that are very hard to trace.

### Environment notes

- **npm cache.** Several hundred files under `~/.npm/_cacache` are owned by `root`, left by a past
  `sudo npm install`, and npm cannot overwrite them. `npm install` fails with `EEXIST`/`EACCES`
  until that is fixed. Workaround: prefix commands with `npm_config_cache=/tmp/npm-cache-game`.
  Permanent fix, which Joshua must run himself because it needs sudo:

  ```sh
  sudo chown -R "$(whoami)" ~/.npm
  ```
