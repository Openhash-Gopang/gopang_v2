/**
 * @file smartVault.js
 * @description GDC Smart Vault — 4가지 자산 바스켓
 * @version 1.0.0
 * 근거: GDC §11
 */

export const VAULT_TYPE = Object.freeze({
  STABLE:   'stable',    // 안정형: 채권50%+금30%+GDC20%, 변동성<5%
  BALANCED: 'balanced',  // 균형형: 주식30%+채권30%+금20%+GDC20%
  GROWTH:   'growth',    // 성장형: 주식60%+REIT20%+금10%+GDC10%
  CURRENCY: 'currency',  // 통화형: 다국적 통화 풀 100%
})

export const VAULT_ALLOCATION = Object.freeze({
  stable:   { bonds:0.50, gold:0.30, gdc:0.20, stocks:0,    reit:0,    pool:0    },
  balanced: { bonds:0.30, gold:0.20, gdc:0.20, stocks:0.30, reit:0,    pool:0    },
  growth:   { bonds:0,    gold:0.10, gdc:0.10, stocks:0.60, reit:0.20, pool:0    },
  currency: { bonds:0,    gold:0,    gdc:0,    stocks:0,    reit:0,    pool:1.00 },
})

const _vaults = new Map()  // userId → { type, amount, createdAt }

export function createVault(userId, type, amountGDC) {
  if (!Object.values(VAULT_TYPE).includes(type))
    throw new Error(`[SmartVault] 알 수 없는 바스켓 유형: ${type}`)
  if (amountGDC <= 0)
    throw new Error(`[SmartVault] 금액은 양수여야 함: ${amountGDC}`)

  const vault = { type, amount: amountGDC, allocation: VAULT_ALLOCATION[type], createdAt: Date.now() }
  _vaults.set(userId, vault)
  return vault
}

export function getVault(userId) { return _vaults.get(userId) ?? null }

export function calcExpectedVolatility(type) {
  const vol = { stable:0.05, balanced:0.125, growth:0.225, currency:0.03 }
  return vol[type] ?? 0
}

export function _resetVaults() { _vaults.clear() }
