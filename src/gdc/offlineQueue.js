/**
 * @file offlineQueue.js
 * @description GDC 예치금 기반 오프라인 큐 + IPFS 폴백
 * @version 1.0.0
 * 근거: GAS v1.6 §15.1 / GDC §13
 *   예치금 = 0.0001 × KB × 보관시간(h) × (1 + 지연가중치)
 *   수신 확인 → 전액 환불 / 30일 미수신 → L1 노드 귀속
 */

import { QUEUE } from '../core/constants.js'

const _queue = new Map()  // msgId → { deposit, senderId, trustLevel, queuedAt, received }

/**
 * 예치금 계산
 * @param {number} sizeKB
 * @param {number} holdHours
 * @param {'L0'|'L1'|'L2'} receiverTrustLevel
 * @returns {number} GDC 예치금
 */
export function calcDeposit(sizeKB, holdHours, receiverTrustLevel) {
  const weight = QUEUE.DELAY_WEIGHT[receiverTrustLevel] ?? QUEUE.DELAY_WEIGHT.L0
  return parseFloat((QUEUE.RATE * sizeKB * holdHours * (1 + weight)).toFixed(6))
}

/**
 * 큐에 메시지 등록
 */
export function enqueue(msgId, senderId, sizeKB, receiverTrustLevel) {
  const holdHours  = QUEUE.MAX_HOLD_HOURS
  const deposit    = calcDeposit(sizeKB, holdHours, receiverTrustLevel)

  _queue.set(msgId, {
    msgId, senderId, sizeKB, deposit,
    receiverTrustLevel, queuedAt: Date.now(), received: false
  })
  return { msgId, deposit, holdHours }
}

/**
 * 수신 확인 → 예치금 환불
 */
export function confirmReceived(msgId) {
  const entry = _queue.get(msgId)
  if (!entry) return { success: false }
  entry.received = true
  entry.receivedAt = Date.now()
  return { success: true, refund: entry.deposit, msgId }
}

/**
 * 만료된 미수신 메시지 처리 → L1 귀속
 */
export function processExpired() {
  const now     = Date.now()
  const cutoff  = QUEUE.MAX_HOLD_HOURS * 3600 * 1000
  const expired = []

  for (const [msgId, entry] of _queue.entries()) {
    if (!entry.received && now - entry.queuedAt > cutoff) {
      expired.push({ msgId, amount: entry.deposit, beneficiary: 'L1-node' })
      _queue.delete(msgId)
    }
  }
  return expired
}

export function getQueueEntry(msgId) { return _queue.get(msgId) ?? null }
export function _resetQueue() { _queue.clear() }
