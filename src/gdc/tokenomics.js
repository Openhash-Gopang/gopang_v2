/**
 * @file tokenomics.js
 * @description GDC 통화 정책 — 인플레이션 공식·다중 소각·GEI
 * @version 1.0.0
 * @author AI City Inc.
 *
 * 근거: GDC Whitepaper v1.5
 *   §4.2: 인플레이션율 = 기준율 + α×(GDP성장률-목표) - β×소각률 (α=0.20, β=0.50)
 *   §4.3: 다중 소각 6개 경로
 *   §5:   GEI = (CPI_global_weighted + GPI_gopang) / 2
 */

import { GDC_POLICY } from '../core/constants.js'

// ── 인플레이션 정책 ───────────────────────────────────────────────────────

/**
 * 연간 인플레이션율 계산 (GDC §4.2)
 * 인플레이션율 = 기준율(0~2%) + α×(GDP성장률-목표) - β×소각률
 *
 * @param {number} gdpGrowthRate  - 생태계 GDP 성장률 (예: 0.35 = 35%)
 * @param {number} burnRate       - 연간 소각률 (예: 0.05 = 5%)
 * @param {number} baseRate       - 기준 인플레이션율 (기본 0.01 = 1%)
 * @returns {number} 인플레이션율 (0~MAX_INFLATION)
 */
export function calcInflationRate(gdpGrowthRate, burnRate, baseRate = 0.01) {
  const TARGET_GROWTH = 0.30  // 목표 성장률 30%

  const raw = baseRate
    + GDC_POLICY.INFLATION_ALPHA * (gdpGrowthRate - TARGET_GROWTH)
    - GDC_POLICY.INFLATION_BETA  * burnRate

  // 0 ~ MAX_INFLATION 클램핑
  return parseFloat(Math.min(Math.max(raw, 0), GDC_POLICY.MAX_INFLATION).toFixed(6))
}

/**
 * 신규 발행량 계산
 * @param {number} currentSupply
 * @param {number} inflationRate
 * @returns {number} 신규 발행 GDC
 */
export function calcNewIssuance(currentSupply, inflationRate) {
  const issuance = currentSupply * inflationRate
  const newSupply = currentSupply + issuance

  if (newSupply > GDC_POLICY.MAX_SUPPLY) {
    return GDC_POLICY.MAX_SUPPLY - currentSupply
  }
  return parseFloat(issuance.toFixed(2))
}

// ── 다중 소각 6개 경로 (GDC §4.3) ────────────────────────────────────────

export const BURN_PATH = Object.freeze({
  MSG_FEE:        'MSG_FEE',        // 1. 메시지 수수료 일부
  STAKING_SLASH:  'STAKING_SLASH',  // 2. 스테이킹 슬래싱
  STEALTH_TAG:    'STEALTH_TAG',    // 3. Stealth 태그 확장
  NICKNAME_REG:   'NICKNAME_REG',  // 4. 닉네임 등록
  NICKNAME_AUCTION:'NICKNAME_AUCTION', // 5. 닉네임 경매 20%
  DAO_RESOLUTION: 'DAO_RESOLUTION', // 6. DAO 결의
})

// 소각 이력 (메모리)
const _burnLog = []

/**
 * GDC 소각 처리
 * @param {string} path   - BURN_PATH 중 하나
 * @param {number} amount - 소각량
 * @param {string} [ref]  - 참조 ID
 * @returns {{ path, amount, ts, totalBurned }}
 */
export function burn(path, amount, ref = '') {
  if (!Object.values(BURN_PATH).includes(path)) {
    throw new Error(`[Tokenomics] 알 수 없는 소각 경로: ${path}`)
  }
  if (amount <= 0) {
    throw new Error(`[Tokenomics] 소각량은 양수여야 함: ${amount}`)
  }

  const entry = { path, amount, ref, ts: Date.now() }
  _burnLog.push(entry)

  return { ...entry, totalBurned: getTotalBurned() }
}

/**
 * 총 소각량 조회
 * @returns {number}
 */
export function getTotalBurned() {
  return parseFloat(_burnLog.reduce((sum, e) => sum + e.amount, 0).toFixed(6))
}

/**
 * 소각 이력 조회
 * @param {string} [path] - 특정 경로 필터 (없으면 전체)
 * @returns {Array}
 */
export function getBurnLog(path = null) {
  return path ? _burnLog.filter(e => e.path === path) : [..._burnLog]
}

// ── GEI (Gopang Economic Index) (GDC §5) ─────────────────────────────────

/**
 * GEI 계산
 * GEI = (CPI_global_weighted + GPI_gopang) / 2
 *
 * @param {number} cpiGlobalWeighted - 주요 10개국 CPI 가중평균 (Chainlink 오라클)
 * @param {number} gpiGopang         - 고팡 생태계 내 서비스 가격 지수
 * @returns {number} GEI
 */
export function calcGEI(cpiGlobalWeighted, gpiGopang) {
  return parseFloat(((cpiGlobalWeighted + gpiGopang) / 2).toFixed(4))
}

/** 테스트용 초기화 */
export function _resetBurnLog() { _burnLog.length = 0 }
