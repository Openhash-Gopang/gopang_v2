/**
 * @file adaptivePow.js
 * @description 적응형 PoW + 평판 시스템 (스팸·DoS 방지)
 * @version 1.0.0
 * 근거: GAS v1.6 §19.2~19.3
 */

const _reputation = new Map()  // userId → { score, violations, lastUpdate }

const BASE_DIFFICULTY = 4    // 기본 PoW 난이도 (앞 0 개수)
const MAX_DIFFICULTY  = 8

/**
 * 현재 사용자의 PoW 난이도 계산
 * 평판 점수 낮을수록 더 어려운 PoW
 * @param {string} userId
 * @returns {number} 난이도 (앞자리 0 개수)
 */
export function calcDifficulty(userId) {
  const rep = _reputation.get(userId)
  if (!rep) return BASE_DIFFICULTY

  const penalty = Math.floor(rep.violations / 3)
  return Math.min(BASE_DIFFICULTY + penalty, MAX_DIFFICULTY)
}

/**
 * PoW 검증 (해시 앞부분 0 확인)
 * @param {string} hash
 * @param {number} difficulty
 * @returns {boolean}
 */
export function verifyPoW(hash, difficulty) {
  return hash.startsWith('0'.repeat(difficulty))
}

/**
 * 평판 점수 업데이트
 * @param {string} userId
 * @param {'good'|'violation'} event
 */
export function updateReputation(userId, event) {
  const rep = _reputation.get(userId) ?? { score: 100, violations: 0, lastUpdate: Date.now() }

  if (event === 'good')      { rep.score = Math.min(rep.score + 1, 100) }
  if (event === 'violation') { rep.score = Math.max(rep.score - 10, 0); rep.violations++ }

  rep.lastUpdate = Date.now()
  _reputation.set(userId, rep)
  return rep
}

export function getReputation(userId) { return _reputation.get(userId) ?? null }
export function _resetReputation() { _reputation.clear() }
