/**
 * @file kAnonymity.js
 * @description K-익명성 그룹 — 기본 프라이버시 계층
 * @version 1.0.0
 * 근거: GAS v1.6 §17.1
 */

const DEFAULT_K = 5  // 기본 K=5 익명성 그룹

/**
 * K-익명성 그룹 생성
 * @param {string[]} userGUIDs - 같은 그룹 사용자 GUID 목록
 * @param {number}   k         - 최소 그룹 크기
 * @returns {{ groupId: string, valid: boolean, size: number }}
 */
export function createGroup(userGUIDs, k = DEFAULT_K) {
  const valid   = userGUIDs.length >= k
  const groupId = userGUIDs.sort().join('|').slice(0, 16)
  return { groupId, valid, size: userGUIDs.length, k }
}

/**
 * 요청이 K-익명성을 만족하는지 확인
 * @param {string[]} candidates - 동일 조건 사용자 목록
 * @param {number}   k
 */
export function satisfiesKAnonymity(candidates, k = DEFAULT_K) {
  return candidates.length >= k
}
