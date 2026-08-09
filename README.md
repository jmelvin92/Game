# Game

An isometric game engine written in TypeScript, rendering to HTML canvas. No game engine, no framework.

**The game itself has not been designed yet.** This repository currently builds only the neutral
foundation — the parts true of *any* isometric game. Tiles, items, enemies, and rules are
deliberately deferred until the engine is finished and the direction is chosen.

## Quick start

```sh
npm install
npm run dev      # http://localhost:5173
```

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm test` | Unit tests |
| `npm run typecheck` | Type errors only, no build |
| `npm run lint` | ESLint, including architecture boundaries |
| `npm run format` | Apply Prettier |

## Contributing

Read [`CLAUDE.md`](./CLAUDE.md) first — it covers the architecture rules, where things live, and
how changes get made. [`CHANGELOG.md`](./CHANGELOG.md) records what changed in each release.
