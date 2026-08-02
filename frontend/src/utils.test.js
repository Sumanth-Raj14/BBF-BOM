import { describe, it, expect } from 'vitest'
import { __t } from './i18n.js'
import { getInrRate, setInrRate, resetInrRate, DEFAULT_INR_RATE } from './utils/currency.js'

/**
 * Improvement #2. This file used to read `window.__t` and
 * `window.__formatCurrency` behind `typeof x === 'function' ? x(...) : <literal>`
 * ternaries. Neither global was ever a function here — window.__formatCurrency
 * is not assigned anywhere in the codebase at all — so both tests only ever
 * asserted their own hardcoded fallback and would have passed against a
 * completely broken app. They now exercise the real ES modules.
 */
describe('i18n __t', () => {
  it('returns undefined for an unknown key, so callers can `|| fallback`', () => {
    expect(__t('test.key')).toBeUndefined()
  })

  it('resolves a key that exists in the bundled locale', () => {
    expect(typeof __t('nav.dashboard')).toBe('string')
  })
})

describe('currency formatting inputs', () => {
  it('defaults to the built-in INR rate', () => {
    resetInrRate()
    expect(getInrRate()).toBe(DEFAULT_INR_RATE)
  })

  it('formats a converted figure with grouping separators', () => {
    resetInrRate()
    const inr = (1234.56 * getInrRate()).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    expect(inr).toContain(',')
  })

  it('rejects a nonsense rate instead of poisoning every money figure', () => {
    resetInrRate()
    expect(setInrRate(0)).toBe(false)
    expect(setInrRate(NaN)).toBe(false)
    expect(getInrRate()).toBe(DEFAULT_INR_RATE)
  })
})
