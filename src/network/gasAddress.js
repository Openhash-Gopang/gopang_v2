/**
 * @file gasAddress.js
 * @description GAS v1.6 주소 체계 — GUID·IPv6 신뢰 등급·Stealth Address·Sybil 4단계
 * @version 1.0.0
 * @author AI City Inc.
 *
 * 근거: GAS v1.6
 *   §11: GDC 의존적 GUID 파생 = SHA256(GDC_master_pubKey || 최초_스테이킹_블록)
 *   §5.2: IPv6 신뢰 등급 인코딩 (하위 니블)
 *   §6.2: Stealth Address GDC 소각 기반 태그 확장
 *   §10.1: Sybil 저항 4단계 신뢰 모델
 */

import { sha256 } from '../pdv/keyManager.js'
import { STAKING, STEALTH } from '../core/constants.js'

// ── Sybil 저항 4단계 ─────────────────────────────────────────────────────
export const TRUST_LEVEL = Object.freeze({
  L0: 0,  // 익명 (Captcha + GDC 소각)
  L1: 1,  // 전화번호 인증
  L2: 2,  // ≥100 GDC 스테이킹
  L3: 3,  // ≥1000 GDC 스테이킹 + KYC
})

// 신뢰 등급별 기능 제한
export const TRUST_PERMISSIONS = Object.freeze({
  [TRUST_LEVEL.L0]: { dailyMsg: 10,  escrow: false, verifyApi: false, nickAuction: false },
  [TRUST_LEVEL.L1]: { dailyMsg: 100, escrow: false, verifyApi: true,  nickAuction: true  },
  [TRUST_LEVEL.L2]: { dailyMsg: Infinity, escrow: false, verifyApi: true, nickAuction: true },
  [TRUST_LEVEL.L3]: { dailyMsg: Infinity, escrow: true,  verifyApi: true, nickAuction: true },
})

// ── GUID 파생 ─────────────────────────────────────────────────────────────

/**
 * GDC 의존적 GUID 파생 (GAS v1.6 §11.1)
 * GUID = SHA256(GDC_master_public_key || 최초_스테이킹_블록)
 *
 * @param {string} gdcMasterPubKeyB64 - GDC 마스터 공개키 (Base64)
 * @param {number} firstStakingBlock  - 최초 스테이킹 블록 번호
 * @returns {Promise<string>} GUID (64자 hex)
 */
export async function deriveGUID(gdcMasterPubKeyB64, firstStakingBlock) {
  return sha256(`${gdcMasterPubKeyB64}:${firstStakingBlock}`)
}

/**
 * ULA 기반 IPv6 주소 생성 (GAS v1.6 §5.1)
 * fd6f:7068:6173::{GUID 첫 64비트}::{신뢰등급 니블}
 *
 * @param {string} guid       - 64자 hex GUID
 * @param {number} trustLevel - TRUST_LEVEL
 * @returns {string} IPv6 주소 문자열
 */
export function deriveIPv6(guid, trustLevel) {
  const prefix = 'fd6f:7068:6173'
  const mid    = guid.slice(0, 16).replace(/(.{4})/g, '$1:').slice(0, -1)
  const nibl   = trustLevel.toString(16)  // 신뢰 등급 하위 니블
  return `${prefix}::${mid}::${nibl}`
}

// ── IPv6 신뢰 등급 인코딩 (GAS v1.6 §5.2) ────────────────────────────────

/**
 * 스테이킹 수량 + KYC 여부 → 신뢰 등급
 * @param {number}  stakingGDC
 * @param {boolean} kycVerified
 * @returns {number} TRUST_LEVEL
 */
export function calcTrustLevel(stakingGDC, kycVerified = false) {
  if (stakingGDC >= STAKING.L3_MIN && kycVerified) return TRUST_LEVEL.L3
  if (stakingGDC >= STAKING.L2_MIN)                return TRUST_LEVEL.L2
  return TRUST_LEVEL.L1   // 전화인증 가정 (L0는 별도 처리)
}

// ── Stealth Address (GAS v1.6 §6.2) ──────────────────────────────────────

/**
 * Stealth Address 생성 (GDC 소각 기반 태그 확장)
 * burn_amount_factor = floor(log₂(burned_GDC + 1)) → 최대 8
 * 소각 0 GDC → 32비트 / 소각 255 GDC → 40비트
 *
 * @param {string} recipientGUID - 수신자 GUID
 * @param {number} burnedGDC     - 발신자 소각 GDC 수량
 * @param {string} ephemeralSeed - 임시 시드 (발신마다 새로 생성)
 * @returns {Promise<{ stealthAddr: string, tagBits: number, factor: number }>}
 */
export async function generateStealthAddress(recipientGUID, burnedGDC, ephemeralSeed) {
  const factor  = Math.min(Math.floor(Math.log2(burnedGDC + 1)), STEALTH.MAX_BURN_FACTOR)
  const tagBits = STEALTH.BASE_BITS + factor  // 32~40비트

  // Stealth Address = SHA256(recipientGUID + ephemeralSeed + tagBits)
  const stealthAddr = await sha256(`${recipientGUID}:${ephemeralSeed}:${tagBits}`)

  return { stealthAddr, tagBits, factor }
}

/**
 * 수신자 스캔 최적화 (O(1)) — Stealth 태그 매칭
 * @param {string} stealthAddr    - 확인할 Stealth Address
 * @param {string} recipientGUID  - 수신자 GUID
 * @param {string} ephemeralSeed  - 임시 시드
 * @param {number} tagBits        - 태그 비트 수
 * @returns {Promise<boolean>}
 */
export async function matchStealthAddress(stealthAddr, recipientGUID, ephemeralSeed, tagBits) {
  const computed = await sha256(`${recipientGUID}:${ephemeralSeed}:${tagBits}`)
  return computed === stealthAddr
}

// ── 신뢰 등급 권한 확인 ──────────────────────────────────────────────────

/**
 * 기능 허용 여부 확인
 * @param {number} trustLevel
 * @param {string} permission - 'escrow'|'verifyApi'|'nickAuction'
 * @returns {boolean}
 */
export function checkPermission(trustLevel, permission) {
  return TRUST_PERMISSIONS[trustLevel]?.[permission] ?? false
}

/**
 * 일일 메시지 한도 조회
 * @param {number} trustLevel
 * @returns {number}
 */
export function getDailyMsgLimit(trustLevel) {
  return TRUST_PERMISSIONS[trustLevel]?.dailyMsg ?? 0
}
