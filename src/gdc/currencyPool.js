/**
 * @file currencyPool.js
 * @description 다국적 통화 풀 + 지분 토큰 + 리밸런싱
 * @version 1.0.0
 * 근거: GDC §8 (193개국 통화 풀), §9 (사용자 지분 토큰)
 */

const _pool = new Map()   // currency → amount (법정화폐 적립)
const _shares = new Map() // userId → { currency, shareAmount, gdcAmount }

/**
 * GDC 구매 → 통화 풀 적립
 * @param {string} currency - 'KRW'|'USD'|'JPY'...
 * @param {number} fiatAmount
 * @param {number} gdcAmount
 * @param {string} userId
 */
export function depositGDC(currency, fiatAmount, gdcAmount, userId) {
  const current = _pool.get(currency) ?? 0
  _pool.set(currency, current + fiatAmount)

  _shares.set(userId, { currency, shareAmount: fiatAmount, gdcAmount, depositedAt: Date.now() })
  return { success: true, poolBalance: _pool.get(currency) }
}

/**
 * 법정화폐 환전 (GDC §8.1 내부 장부 교환)
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {number} amount
 * @param {number} rate - fromCurrency/toCurrency 환율
 */
export function exchange(fromCurrency, toCurrency, amount, rate) {
  const fromPool = _pool.get(fromCurrency) ?? 0
  if (fromPool < amount) return { success: false, reason: '풀 잔액 부족' }

  const toAmount = amount / rate
  _pool.set(fromCurrency, fromPool - amount)
  _pool.set(toCurrency, (_pool.get(toCurrency) ?? 0) + toAmount)

  return { success: true, received: toAmount, fee: amount * 0.003 }
}

export function getPoolBalance(currency) { return _pool.get(currency) ?? 0 }
export function getAllPools() { return Object.fromEntries(_pool) }
export function getUserShare(userId) { return _shares.get(userId) ?? null }
export function _resetPool() { _pool.clear(); _shares.clear() }
