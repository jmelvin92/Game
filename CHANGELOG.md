# Changelog

All notable changes to this project are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the major version is `0`, the
minor version marks a completed project phase.

For the reasoning behind any individual change, read the commit body — `git log` is where the
"why" lives.

## [Unreleased]

### Added

- An isometric renderer on 64×32 diamond tiles, with camera follow, viewport culling and
  painter's-algorithm depth sorting, so the character passes correctly behind buildings.
- A walkable sandbox: a city crossroads with sidewalks, grass and four enterable buildings, each
  with a doorway. Hand-built rather than generated, so the renderer has a known-good reference.
- A player character with eight-directional movement on WASD or the arrow keys, and collision that
  slides along walls rather than snagging on them.
- Sprites drawn procedurally in code — no image files and no asset pipeline.
- A dev-only `window.game` handle for inspecting and driving the running game from the browser
  console.

### Changed

- The repository is now public. GitHub restricts branch protection to public repositories and paid
  plans, and this was the route chosen to get it.
- Branch protection is active on `main`, with admin enforcement on. Direct pushes are refused
  server-side even for the repository owner, `main` advances only through a pull request whose
  `Verify` check passed, and force-pushes and deletion are refused.

## [0.1.0] — Phase 0: Infrastructure

The engineering foundation. No game code — this phase exists so that everything after it is
verifiably correct and mistakes are cheap to undo.

### Added

- Git repository with `main` as the trunk, pushed to GitHub as a private repo.
- `CLAUDE.md` — orientation for future sessions: architecture rules, where information lives, the
  working agreement, and an explicit record of what has _not_ been decided.
- TypeScript in full strict mode, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- Vite dev server and production build; Vitest for headless unit tests.
- ESLint and Prettier, with a rule set that fails the build when architecture layer boundaries are
  violated — simulation code cannot import rendering code.
- Git hooks (`commit-msg`, `pre-push`) as plain shell in `.githooks/`, adding no dependencies.
  Commit messages are validated; typecheck, lint, and tests run before every push; direct pushes to
  `main` are refused.
- GitHub Actions CI mirroring the pre-push checks, so a clean local push means a green pull request
  and the gates still hold if the hooks are bypassed.

### Notes

- Every gate was verified against cases designed to defeat it rather than assumed to work: the layer
  rule rejects both alias and relative-path escapes while allowing legal downward imports, the commit
  hook was exercised against 17 messages, and a deliberately broken build was confirmed to fail both
  the hook and CI.
- Branch protection on `main` is not active. GitHub restricts it to public repositories and paid
  plans, so the `pre-push` hook is currently the only thing refusing direct pushes.

[Unreleased]: https://github.com/jmelvin92/Game/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jmelvin92/Game/releases/tag/v0.1.0
