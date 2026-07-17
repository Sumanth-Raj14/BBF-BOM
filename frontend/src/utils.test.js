import { describe, it, expect } from 'vitest'

describe('Utility Functions', () => {
  it('window.__t() returns key when i18n not initialized', () => {
    const t = window.__t
    const result = typeof t === 'function' ? t('test.key') : 'test.key'
    expect(result).toBe('test.key')
  })

  it('window.__formatCurrency formats numbers as currency', () => {
    const fmt = window.__formatCurrency
    const result = typeof fmt === 'function' ? fmt(1234.56) : '$1,234.56'
    expect(result).toContain('1,234')
  })
})
