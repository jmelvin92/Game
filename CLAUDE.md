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

### The direction so far

**A post-apocalyptic survival game built around light and electricity.**

The world's power is dead — completely. Nothing is lit that the player has not lit
themselves, which is why the streets are dark and every lamp starts cold.

The character has a supernatural gift: they can energise anything that runs on
electricity. Street lamps today; jukeboxes, vehicles, refrigerators later. **The
gift is the game's currency** — it is spent, not repaired with. Devices differ only
in what they cost, how long they hold a charge, and what they do while lit, so
adding one is a table entry rather than a new mechanic.

Three costs bind it. Channelling drains power, which **only daylight restores**; it
costs health; and it permanently lowers the **ceiling** on how much health can ever
be held again. Rest and medicine — neither built — restore health only up to that
ceiling.

The ceiling is what makes the gift a bargain rather than a resource: every device
you wake costs a sliver of your life. It falls slowly, roughly half a percent per
street lamp, so a night is barely felt and a fortnight is unmistakable. That single
number decides how long a run lasts and is provisional until something else pins
that down.

It is an ordinary value that moves both ways, not a one-way count, because Joshua
wants a late-game way to win some of it back.

Two threats are planned and **neither is built**:

- Something that can only exist or attack in darkness, so light is protection.
- Something drawn _to_ light, which comes to kill or take the player. It does not
  always come, and there is a warning when it does — the intention is that lamps
  begin to flicker, reusing a signal the player has already learned means
  "unreliable".

Together those mean light is never simply good: it protects, it costs health, and
it advertises. Do not quietly resolve that tension in any one direction.

**Not zombies.** That was an early reference point for perspective and scale only.

### Still genuinely undecided

- **What carries over when the player dies.** Joshua wants milestones with no
  ending, and also expects death. Something has to persist — repaired devices, map
  knowledge, reclaimed districts — or the milestones never accumulate.
- **What fills the daytime.** Recharging is passive; scouting and repairing devices
  are the obvious candidates but nothing is built.
- **What restores health up to the ceiling.** Rest in a secure shelter is the
  strongest candidate, and has a useful tension built in: sleeping burns daylight,
  which is the only thing that restores power, so rest and the gift compete for the
  same hours. Scavenged medicine is the obvious emergency source.
- **How long a run should last.** Nothing pins this down, and the ceiling's rate of
  loss cannot be tuned properly until it does.

### The line to hold

Content that exists is theme-flavoured (a road, a wall, a person) but the **engine underneath stays
neutral**. `world/` knows only what it structurally needs from a tile — _is it solid, is it opaque,
how tall is it_ — and never what a road or a building is. Appearance lives entirely in `render/`.
Keeping that seam intact is what makes a change of direction cheap.

---

## 2. Who you are working with

**Joshua** (GitHub `jmelvin92`) directs the game design. He does not write code and does not read
it — but he **does play the game and report back**.

### The loop

**He gives direction → you implement → he tests and tells you what to change.**

He asked for this explicitly, and the reason is worth keeping: driving the game through the browser
tools to prove a change works is slow, and it makes him wait for something he can check himself in
seconds. So:

- **Do not hand-verify in the browser by default.** Make the change, confirm the automated gates
  pass, tell him it is ready. The dev server hot-reloads, so he can look immediately.
- **Do keep the cheap gates.** `typecheck`, `lint` and `test` take seconds, catch what he cannot,
  and are not what he was objecting to. Never skip them.
- **Reach for the browser only when it genuinely earns the time**: something looks wrong and he
  cannot describe why, a bug will not reproduce from his description, or the change is invisible to
  tests and he has asked for a check. Say when you are doing it and why.
- **He reports symptoms, not causes.** "The guy walks weird" is the input; working out why is the
  job. Ask for specifics if a report is ambiguous, rather than guessing and shipping a fix for the
  wrong thing.

### The rest

- **Explain in plain terms.** Describe what changed and what it means for the game. Skip the
  implementation detail unless it affects a decision that is his to make.
- **He decides design; you decide engineering.** Theme, mechanics, and feel are his. Architecture,
  naming, and library choices are yours — make them and say what you picked.
- **His standard is explicit:** built slowly and correctly, no spaghetti, no fluff, no cut corners,
  written to a professional standard. Prefer doing it properly over doing it quickly. If something
  needs to be done twice to be right, do it twice.
- **Do not build ceremony he did not ask for.** He has pushed back on over-engineering once already,
  on branching. Solve the problem in front of you.

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

**There is a walkable island with one hand-built house on it.** Biome noise shapes an island of
grassland, forest, desert and beach ringed by open sea; streets, farms' fields and two airfields'
ground works survive — but **all generated buildings are removed by request**. One house exists,
laid out by hand in `src/world/house.ts`: four rooms, windows, one front door, and full furnishing
including devices the gift can wake (floor lamps, a television, a refrigerator). It is the
standard the building generator will be rebuilt to meet, room by furnished room, before buildings
return at scale. The player spawns on its front path. Furniture is props with facing in the
variant slot — lamp _condition_ also lives in the variant slot, so lamp-specific rules (Broken
refuses charge, Damaged flickers) are gated on the prop being a LampPost.

| Phase | Delivers                                                          | Tag      | Status |
| ----- | ----------------------------------------------------------------- | -------- | ------ |
| **0** | Repo, toolchain, hooks, CI, boundaries                            | `v0.1.0` | done   |
| **1** | Loop, input, isometric maths, tiles, camera, character, collision | `v0.2.0` | done   |
| **2** | Not yet planned — see below                                       |          |        |

Phases 2 and 3 originally read "entities, depth sorting, occlusion" and "chunked world,
pathfinding, save/load". The first was folded into phase 1, because a camera panning over an empty
grid is not something Joshua can react to and a character who walks is. The rest are **not
scheduled**: chunking, pathfinding and persistence are all worth building, but which comes first
depends on what the game turns out to be, and that is still open. Ask rather than assume.

### Known limitations, honestly

- **The world is a fixed 512×1024 grid**, held entirely in memory — 8 MB, at 16 bytes a tile.
  Nothing streams, and at this size nothing needs to: chunking is a memory argument and there is
  not one yet. Roughly two and a half minutes to walk across the town, five from end to end. It is
  **taller than it is wide on purpose**: `TOWN_TOP` in `src/world/sandbox.ts` splits it, with the
  town below and countryside above. Nothing is built north of that line, `District.Countryside` exists to keep it
  that way, and `tests/sandbox.test.ts` fails if buildings or street lighting appear there.
- **Collision is circle-versus-tile**, resolved per axis with substepping so nothing tunnels at
  speed. There is no entity-to-entity collision, because there is only one entity.
- **Tiles have a `height` field and an `opaque` flag that nothing reads yet.** They are there
  because they are properties of a tile rather than of a renderer; line-of-sight will use them.
- **`window.game` exists in dev builds only**, holding the grid, actor, camera and input. Use it to
  verify behaviour from the browser console. Note that Chrome throttles `requestAnimationFrame` in
  a background tab, so a simulation driven from the console can appear frozen when the tab is not
  foregrounded — that is the harness, not a bug in the loop.

### Environment notes

- **npm cache.** Several hundred files under `~/.npm/_cacache` are owned by `root`, left by a past
  `sudo npm install`, and npm cannot overwrite them. `npm install` fails with `EEXIST`/`EACCES`
  until that is fixed. Workaround: prefix commands with `npm_config_cache=/tmp/npm-cache-game`.
  Permanent fix, which Joshua must run himself because it needs sudo:

  ```sh
  sudo chown -R "$(whoami)" ~/.npm
  ```
