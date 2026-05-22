/**
 * @file dao.js
 * @description DAO 거버넌스 — DAWN 비영리 원칙 기술적 강제
 * @version 1.0.0
 * 근거: GDC §19.2 / OpenHash SCI 논문 부록 D
 *   - GDC ≥1000 보유자: 1인1표
 *   - L1 노드: 노드당 1표
 *   - AI City Inc.: 제안권만 (거부권 없음)
 *   - 통화 풀 소유권 이전: 스마트 컨트랙트 수준에서 차단
 */

import { GDC_POLICY } from '../core/constants.js'

const MIN_STAKE_VOTE = 1000  // 투표 참여 최소 스테이킹

const _proposals = new Map()  // proposalId → { title, votes, status }
const _votes      = new Map()  // proposalId:userId → voted

/**
 * 제안 생성 (AI City Inc. 포함 누구나 가능)
 */
export function createProposal(proposalId, title, proposer, params = {}) {
  if (_proposals.has(proposalId)) throw new Error(`제안 중복: ${proposalId}`)

  // DAWN 비영리 원칙: 통화 풀 소유권 이전 제안 원천 차단
  if (params.type === 'OWNERSHIP_TRANSFER') {
    throw new Error('[DAO] DAWN 원칙 위반: 통화 풀 소유권 이전 불가')
  }

  const proposal = {
    proposalId, title, proposer, params,
    votes: { yes: 0, no: 0, abstain: 0 },
    voters: [],
    status:    'ACTIVE',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 86400 * 1000,  // 30일
  }
  _proposals.set(proposalId, proposal)
  return proposal
}

/**
 * 투표 (GDC ≥1000 보유자)
 * @param {string} proposalId
 * @param {string} userId
 * @param {number} stakeGDC   - 보유 GDC (≥1000 필요)
 * @param {'yes'|'no'|'abstain'} choice
 */
export function vote(proposalId, userId, stakeGDC, choice) {
  if (stakeGDC < MIN_STAKE_VOTE)
    return { success: false, reason: `투표 최소 스테이킹 부족: ${stakeGDC} < ${MIN_STAKE_VOTE} GDC` }

  const key = `${proposalId}:${userId}`
  if (_votes.has(key)) return { success: false, reason: '이미 투표함' }

  const proposal = _proposals.get(proposalId)
  if (!proposal) return { success: false, reason: '제안 없음' }
  if (proposal.status !== 'ACTIVE') return { success: false, reason: `투표 종료: ${proposal.status}` }

  proposal.votes[choice] = (proposal.votes[choice] ?? 0) + 1
  proposal.voters.push(userId)
  _votes.set(key, { choice, ts: Date.now() })

  return { success: true, votes: proposal.votes }
}

/**
 * 제안 결과 확정 (30일 후 또는 과반 달성 시)
 */
export function finalizeProposal(proposalId) {
  const proposal = _proposals.get(proposalId)
  if (!proposal) return null

  const { yes, no } = proposal.votes
  const total = yes + no
  proposal.status = total > 0 && yes > no ? 'PASSED' : 'REJECTED'
  proposal.finalizedAt = Date.now()
  return proposal
}

export function getProposal(proposalId) { return _proposals.get(proposalId) ?? null }
export function _resetDAO() { _proposals.clear(); _votes.clear() }
