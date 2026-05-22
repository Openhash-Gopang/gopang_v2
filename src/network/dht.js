/**
 * @file dht.js
 * @description GDC 가중 DHT 라우팅 + 닉네임 등록·경매 + 이동성 모델
 * @version 1.0.0
 * @author AI City Inc.
 *
 * 근거: GAS v1.6
 *   §13.1: 경제적 거리 함수 = XOR(GUID_A, GUID_B) - w×log₂(stake_GDC_B + 1)
 *   §7.1: 닉네임 등록 수수료 최소 0.001 GDC 소각
 *   §7.2: 닉네임 경매 — 낙찰금 80% 이전 소유자, 20% 소각
 *   §8: 이동성 모델 — GUID 불변, IPv6 가변
 */

import { sha256 } from '../pdv/keyManager.js'

// GDC 가중치 상수
const W = 2n ** 40n  // 가중치 스케일 (2^40)

// 닉네임 저장소 (메모리 — 실제는 L0 레지스트리)
const _nicknames  = new Map()  // nickname → { guid, pubKeyB64, registeredAt, owner }
const _dhtRecords = new Map()  // guid → { ipv6, stakeGDC, updatedAt }

// ── GDC 가중 DHT 거리 함수 ───────────────────────────────────────────────

/**
 * GDC 가중 Kademlia 거리 (GAS v1.6 §13.1)
 * 거리(A,B) = XOR(GUID_A, GUID_B) - w × log₂(stake_GDC_B + 1)
 *
 * @param {string} guidA    - 64자 hex
 * @param {string} guidB    - 64자 hex
 * @param {number} stakeBGDC - B의 GDC 스테이킹 수량
 * @returns {bigint} 경제적 거리
 */
export function gdcWeightedDistance(guidA, guidB, stakeBGDC) {
  const bigA = BigInt('0x' + guidA)
  const bigB = BigInt('0x' + guidB)
  const xorDist = bigA ^ bigB

  const stakeWeight = BigInt(Math.floor(Math.log2(stakeBGDC + 1)))
  const weighted    = W * stakeWeight

  // 음수 방지
  const dist = xorDist > weighted ? xorDist - weighted : 0n
  return dist
}

/**
 * 가장 가까운 노드 찾기
 * @param {string}   targetGUID
 * @param {Object[]} nodes - [{ guid, stakeGDC }]
 * @returns {Object|null}
 */
export function findClosestNode(targetGUID, nodes) {
  if (nodes.length === 0) return null

  return nodes.reduce((closest, node) => {
    const d = gdcWeightedDistance(targetGUID, node.guid, node.stakeGDC ?? 0)
    const cD = gdcWeightedDistance(targetGUID, closest.guid, closest.stakeGDC ?? 0)
    return d < cD ? node : closest
  })
}

// ── DHT 레코드 관리 ───────────────────────────────────────────────────────

/**
 * DHT 레코드 등록 (GUID → IPv6 + 스테이킹)
 * @param {string} guid
 * @param {string} ipv6
 * @param {number} stakeGDC
 */
export function registerRecord(guid, ipv6, stakeGDC) {
  _dhtRecords.set(guid, { ipv6, stakeGDC, updatedAt: Date.now() })
}

/**
 * DHT 레코드 조회
 * @param {string} guid
 * @returns {Object|null}
 */
export function lookupGUID(guid) {
  return _dhtRecords.get(guid) ?? null
}

// ── 닉네임 등록·경매 (GAS v1.6 §7) ──────────────────────────────────────

/**
 * 닉네임 등록 (GAS v1.6 §7.1 Proof-of-Uniqueness)
 * 등록 수수료: 최소 0.001 GDC 소각
 *
 * @param {string} nickname
 * @param {string} guid
 * @param {string} pubKeyB64
 * @param {number} feeGDC    - 소각 수수료 (≥ 0.001)
 * @returns {{ success: boolean, burned: number, reason?: string }}
 */
export async function registerNickname(nickname, guid, pubKeyB64, feeGDC = 0.001) {
  const MIN_FEE = 0.001

  if (feeGDC < MIN_FEE) {
    return { success: false, burned: 0, reason: `수수료 부족: ${feeGDC} < ${MIN_FEE} GDC` }
  }

  // Proof-of-Uniqueness: SHA256(nickname) 충돌 확인
  const nickhash = await sha256(nickname)
  if (_nicknames.has(nickname)) {
    return { success: false, burned: 0, reason: `닉네임 이미 사용 중: ${nickname}` }
  }

  _nicknames.set(nickname, {
    guid,
    pubKeyB64,
    nickhash,
    registeredAt: Date.now(),
    owner:        guid,
    auctionPrice: 0,
  })

  return { success: true, burned: feeGDC }
}

/**
 * 닉네임 조회 → GUID
 * @param {string} nickname
 * @returns {string|null} GUID
 */
export function resolveNickname(nickname) {
  return _nicknames.get(nickname)?.guid ?? null
}

/**
 * 닉네임 경매 처리 (GAS v1.6 §7.2)
 * 낙찰금 80% → 이전 소유자 / 20% → 소각
 *
 * @param {string} nickname
 * @param {string} bidderGUID
 * @param {number} bidGDC
 * @returns {{ success: boolean, toOwner: number, burned: number }}
 */
export function auctionNickname(nickname, bidderGUID, bidGDC) {
  const record = _nicknames.get(nickname)
  if (!record) return { success: false, toOwner: 0, burned: 0, reason: '닉네임 없음' }
  if (bidGDC <= record.auctionPrice) {
    return { success: false, toOwner: 0, burned: 0, reason: `입찰 부족: ${bidGDC} ≤ ${record.auctionPrice}` }
  }

  const toOwner = bidGDC * 0.80   // 이전 소유자
  const burned  = bidGDC * 0.20   // 소각

  // 소유권 이전
  const prevOwner = record.owner
  record.owner        = bidderGUID
  record.auctionPrice = bidGDC

  return { success: true, toOwner, burned, prevOwner }
}

// ── 이동성 모델 (GAS v1.6 §8) ────────────────────────────────────────────

/**
 * 이사 처리 — GUID 불변, IPv6 업데이트
 * @param {string} guid
 * @param {string} newIPv6
 */
export function updateMobility(guid, newIPv6) {
  const record = _dhtRecords.get(guid)
  if (!record) {
    _dhtRecords.set(guid, { ipv6: newIPv6, stakeGDC: 0, updatedAt: Date.now() })
  } else {
    record.ipv6      = newIPv6
    record.updatedAt = Date.now()
  }
}

/** 테스트용 초기화 */
export function _resetDHT() {
  _nicknames.clear()
  _dhtRecords.clear()
}
