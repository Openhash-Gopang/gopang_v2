/**
 * @file socialRecovery.js
 * @description 개인키 분실 복구 프로토콜
 * @version 1.0.0
 * 근거: GAS v1.6 §9.1 사회적 복구 + §20.8 법적 효력
 */

import { sha256 } from '../pdv/keyManager.js'

const _recoveryRequests = new Map()  // userId → { guardians, approvals, status }

/**
 * 복구 요청 생성
 * @param {string}   userId
 * @param {string[]} guardianGUIDs - 보호자 GUID 목록 (3명 이상 권장)
 * @param {string}   newPubKeyB64  - 새 공개키
 * @returns {{ requestId: string, threshold: number }}
 */
export async function createRecoveryRequest(userId, guardianGUIDs, newPubKeyB64) {
  const requestId = await sha256(`recovery:${userId}:${Date.now()}`)
  const threshold = Math.ceil(guardianGUIDs.length * 0.6)  // 60% 이상 승인 필요

  _recoveryRequests.set(userId, {
    requestId, userId, guardianGUIDs, newPubKeyB64,
    approvals: [], threshold, status: 'PENDING', createdAt: Date.now()
  })

  return { requestId, threshold, totalGuardians: guardianGUIDs.length }
}

/**
 * 보호자 승인
 * @param {string} userId
 * @param {string} guardianGUID
 * @returns {{ approved: boolean, current: number, required: number, completed: boolean }}
 */
export function approveRecovery(userId, guardianGUID) {
  const req = _recoveryRequests.get(userId)
  if (!req || req.status !== 'PENDING') return { approved: false }
  if (!req.guardianGUIDs.includes(guardianGUID)) return { approved: false, reason: '보호자 아님' }
  if (req.approvals.includes(guardianGUID)) return { approved: false, reason: '이미 승인' }

  req.approvals.push(guardianGUID)
  const completed = req.approvals.length >= req.threshold

  if (completed) {
    req.status = 'APPROVED'
    req.completedAt = Date.now()
  }

  return {
    approved: true,
    current:   req.approvals.length,
    required:  req.threshold,
    completed,
    newPubKeyB64: completed ? req.newPubKeyB64 : null,
  }
}

export function getRecoveryRequest(userId) { return _recoveryRequests.get(userId) ?? null }
export function _resetRecovery() { _recoveryRequests.clear() }
