/**
 * @file escrow.js
 * @description K-Law 연동 자동 집행 에스크로
 * @version 1.0.0
 * 근거: GDC §1.2 K-Law 판결 → 스마트 컨트랙트 자동 반영
 */

import { EventBus, EVENTS } from '../core/event-bus.js'

const _escrows = new Map()  // escrowId → { amount, condition, status, msgId }

export function createEscrow(escrowId, fromUserId, toUserId, amountGDC, condition, msgId) {
  if (_escrows.has(escrowId)) throw new Error(`에스크로 중복: ${escrowId}`)
  const escrow = {
    escrowId, fromUserId, toUserId, amountGDC,
    condition, msgId, status: 'LOCKED', createdAt: Date.now()
  }
  _escrows.set(escrowId, escrow)
  return escrow
}

/**
 * K-Law 판결 결과 → 에스크로 자동 집행
 * EventBus.on(GDC_KLAW_EXECUTED) 에서 호출
 */
export function executeFromKLaw(escrowId, verdict) {
  const escrow = _escrows.get(escrowId)
  if (!escrow) return { success: false, reason: '에스크로 없음' }
  if (escrow.status !== 'LOCKED') return { success: false, reason: `상태 오류: ${escrow.status}` }

  escrow.status  = verdict === 'RELEASE' ? 'RELEASED' : 'REFUNDED'
  escrow.verdict = verdict
  escrow.executedAt = Date.now()

  return { success: true, escrow }
}

export function getEscrow(escrowId) { return _escrows.get(escrowId) ?? null }

// K-Law 판결 이벤트 구독 등록
EventBus.on(EVENTS.GDC_KLAW_EXECUTED, (data) => {
  if (data?.escrowId && data?.verdict) {
    executeFromKLaw(data.escrowId, data.verdict)
  }
}, 'gdc-escrow')

export function _resetEscrows() { _escrows.clear() }
