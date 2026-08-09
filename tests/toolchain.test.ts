import { describe, expect, it } from 'vitest'

/**
 * Phase 0 has no engine code to test yet. This asserts something genuinely worth
 * pinning — that tests run on the Node version package.json requires — so a
 * misconfigured CI runner fails loudly here rather than producing confusing errors
 * later. Phase 1 adds the first real tests, covering the isometric transforms.
 */
describe('toolchain', () => {
  it('runs on the Node version the project requires', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)

    expect(major).toBeGreaterThanOrEqual(22)
  })
})
