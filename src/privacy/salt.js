/**
 * @file salt.js
 * @description Shamir 4-of-7 컨소시엄 Salt + 행정코드 보호
 * @version 1.0.0
 * 근거: GAS v1.6 §16.2
 */

import { sha256 } from '../pdv/keyManager.js'

/**
 * 사용자별 파생 Salt 생성
 * @param {string} userId
 * @param {string} adminCode - 행정코드 (읍면동 코드 등)
 * @returns {Promise<string>} Salt (64자 hex)
 */
export async function deriveSalt(userId, adminCode) {
  // 실제: Shamir 4-of-7 컨소시엄 키 조합
  // 현재: SHA256(userId + adminCode) 단순 구현
  return sha256(`salt:${userId}:${adminCode}`)
}

/**
 * 행정코드 마스킹 (프라이버시 보호)
 * @param {string} adminCode - 원본 행정코드
 * @param {string} salt
 * @returns {Promise<string>} 마스킹된 코드
 */
export async function maskAdminCode(adminCode, salt) {
  const masked = await sha256(`${adminCode}:${salt}`)
  return masked.slice(0, 16)  // 64비트 마스킹 코드
}

/**
 * Shamir 4-of-7 시뮬레이션 (구조만 구현)
 * 실제: 7개 컨소시엄 노드에 분산, 4개 이상 합의 시 복원
 */
export function createShamirShares(secret, n = 7, threshold = 4) {
  // TODO: 실제 Shamir's Secret Sharing 구현
  const shares = Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    share: `share-${i+1}-${secret.slice(0, 8)}`,
  }))
  return { shares, n, threshold, note: '실제 Shamir SSS 구현 예정' }
}
