/**
 * Entry point.
 *
 * Phase 0 is infrastructure only — there is no engine yet. This file exists so the
 * build, dev server, and type checker have something real to operate on, and it will
 * be replaced by the game loop in phase 1. See CLAUDE.md §7.
 */

const root = document.querySelector<HTMLDivElement>('#app')

if (root === null) {
  throw new Error('Expected an element with id "app" in index.html')
}

root.textContent = 'Foundation ready. The engine begins in phase 1.'
