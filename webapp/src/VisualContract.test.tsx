import { describe, expect, it } from 'vitest'

const nodeProcess = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(name: string): unknown } }).process
const fileSystem = nodeProcess.getBuiltinModule('fs') as { readFileSync(path: string, encoding: string): string }
const styles = fileSystem.readFileSync(nodeProcess.cwd() + '/src/styles.css', 'utf8')

describe('accepted v1 visual contract', function () {
  it('keeps the signature palette and shell dimensions', function () {
    expect(styles).toContain('--accent: #c8f15d')
    expect(styles).toContain('--accent-strong: #9dce57')
    expect(styles).toMatch(/\.brand-mark[^}]*width: 32px[^}]*height: 32px/)
    expect(styles).toMatch(/\.masthead[^}]*min-height: 68px/)
    expect(styles).toMatch(/\.mast-inner[^}]*max-width: 1380px/)
    expect(styles).toMatch(/\.steps button\[aria-selected="true"\][^}]*var\(--accent-soft\)/)
  })

  it('retains narrow stacking, local table scrolling, focus, and reduced motion', function () {
    expect(styles).toMatch(/@media \(max-width: 760px\)/)
    expect(styles).toMatch(/\.import-grid, \.share-grid, \.settle-grid[^}]*grid-template-columns: minmax\(0, 1fr\)/)
    expect(styles).toMatch(/\.table-scroll \{ overflow-x: auto; \}/)
    expect(styles).toMatch(/:focus-visible[^}]*outline:/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
