# Changelog

All notable changes to this project are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the major version is `0`, the
minor version marks a completed project phase.

For the reasoning behind any individual change, read the commit body — `git log` is where the
"why" lives.

## [Unreleased]

## [0.1.0] — Phase 0: Infrastructure

The engineering foundation. No game code — this phase exists so that everything after it is
verifiably correct and mistakes are cheap to undo.

### Added

- Git repository with `main` as the trunk, pushed to GitHub as a private repo.
- `CLAUDE.md` — orientation for future sessions: architecture rules, where information lives, the
  working agreement, and an explicit record of what has *not* been decided.
- TypeScript in full strict mode, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- Vite dev server and production build; Vitest for headless unit tests.
- ESLint and Prettier, with a rule set that fails the build when architecture layer boundaries are
  violated — simulation code cannot import rendering code.
- Git hooks (`commit-msg`, `pre-push`) as plain shell in `.githooks/`, adding no dependencies.
  Commit messages are validated; typecheck, lint, and tests run before every push; direct pushes to
  `main` are refused.

[Unreleased]: https://github.com/jmelvin92/Game/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jmelvin92/Game/releases/tag/v0.1.0
