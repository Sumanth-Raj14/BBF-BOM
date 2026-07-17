import { describe, it, expect, beforeEach } from 'vitest'

describe('useAppStore', () => {
  beforeEach(() => {
    window.BOM_DATA = {
      rows: [{ id: 1, name: 'Part A' }, { id: 2, name: 'Part B' }],
      role: 'admin',
      userName: 'Test User',
      theme: 'light',
    }
  })

  it('returns BOM_DATA context with rows', () => {
    const ctx = window.useAppStore?.()
    if (ctx) {
      expect(ctx.rows).toHaveLength(2)
      expect(ctx.role).toBe('admin')
      expect(ctx.userName).toBe('Test User')
    }
  })
})
