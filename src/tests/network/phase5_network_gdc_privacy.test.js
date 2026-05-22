/**
 * @file phase5_network_gdc_privacy.test.js
 * @description Phase 5 Network + GDC + Privacy 통합 테스트
 * @테스트항목 N-01~N-05, G-01~G-08, P-01~P-06
 */

// ── Network ──────────────────────────────────────────────────────────────
import { submitToLayer, getLayerStatus, _resetStatus } from '../../network/layerClient.js'
import { deriveGUID, deriveIPv6, calcTrustLevel, generateStealthAddress,
         matchStealthAddress, checkPermission, getDailyMsgLimit,
         TRUST_LEVEL } from '../../network/gasAddress.js'
import { gdcWeightedDistance, findClosestNode, registerRecord,
         lookupGUID, registerNickname, resolveNickname,
         auctionNickname, updateMobility, _resetDHT } from '../../network/dht.js'

// ── GDC ──────────────────────────────────────────────────────────────────
import { calcInflationRate, calcNewIssuance, burn, getTotalBurned,
         getBurnLog, calcGEI, BURN_PATH, _resetBurnLog } from '../../gdc/tokenomics.js'
import { createVault, getVault, calcExpectedVolatility,
         VAULT_TYPE, _resetVaults } from '../../gdc/smartVault.js'
import { depositGDC, exchange, getPoolBalance, _resetPool } from '../../gdc/currencyPool.js'
import { createEscrow, executeFromKLaw, getEscrow, _resetEscrows } from '../../gdc/escrow.js'
import { createProposal, vote, finalizeProposal, _resetDAO } from '../../gdc/dao.js'
import { calcDeposit, enqueue, confirmReceived, _resetQueue } from '../../gdc/offlineQueue.js'

// ── Privacy ───────────────────────────────────────────────────────────────
import { registerMixnode, selectPath, rewardRelay, slashNode, _resetMixnet } from '../../privacy/mixnet.js'
import { createGroup, satisfiesKAnonymity } from '../../privacy/kAnonymity.js'
import { calcDifficulty, verifyPoW, updateReputation, _resetReputation } from '../../privacy/adaptivePow.js'
import { deriveSalt, maskAdminCode } from '../../privacy/salt.js'
import { createRecoveryRequest, approveRecovery, _resetRecovery } from '../../privacy/socialRecovery.js'

import { generateKeyPair } from '../../pdv/keyManager.js'

let passed = 0, failed = 0

async function test(id, desc, fn) {
  try {
    await fn()
    console.log(`  ✅ ${id}: ${desc}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${id}: ${desc}\n     └─ ${err.message}`)
    failed++
  }
}

function assert(c, m) { if (!c) throw new Error(m || '단언 실패') }

function setup() {
  _resetStatus(); _resetDHT(); _resetBurnLog(); _resetVaults()
  _resetPool(); _resetEscrows(); _resetDAO(); _resetQueue()
  _resetMixnet(); _resetReputation(); _resetRecovery()
}

console.log('\n=== Phase 5 Network + GDC + Privacy 테스트 ===\n')

// ── Network 테스트 ────────────────────────────────────────────────────────
console.log('[ Network ]')

setup()
await test('N-01', 'layerClient dev 환경 제출 성공', async () => {
  const r = await submitToLayer('L1', { entryHash: 'abc', msgHash: 'def' })
  assert(r.success === true, `성공: ${r.success}`)
  assert(r.layer === 'L1', `계층: ${r.layer}`)
})

await test('N-02', 'GUID 파생 결정론적', async () => {
  const { publicKeyB64 } = await generateKeyPair()
  const g1 = await deriveGUID(publicKeyB64, 12345)
  const g2 = await deriveGUID(publicKeyB64, 12345)
  assert(g1 === g2, '동일 입력 → 동일 GUID')
  assert(g1.length === 64, `GUID 길이: ${g1.length}`)
})

await test('N-03', 'Stealth Address 생성·매칭', async () => {
  const recipGUID = 'a'.repeat(64)
  const { stealthAddr, tagBits, factor } = await generateStealthAddress(recipGUID, 10, 'seed-xyz')
  assert(tagBits >= 32 && tagBits <= 40, `tagBits: ${tagBits}`)
  const match = await matchStealthAddress(stealthAddr, recipGUID, 'seed-xyz', tagBits)
  assert(match === true, 'Stealth 매칭 성공')
  const noMatch = await matchStealthAddress(stealthAddr, recipGUID, 'wrong-seed', tagBits)
  assert(noMatch === false, 'Stealth 불일치 탐지')
})

await test('N-04', 'GDC 가중 DHT 거리 + 닉네임 등록·조회', async () => {
  // DHT 거리: 스테이킹 높을수록 가깝게 위치
  const gA = 'a'.repeat(64), gB = 'b'.repeat(64)
  const d0  = gdcWeightedDistance(gA, gB, 0)      // 스테이킹 없음
  const d100 = gdcWeightedDistance(gA, gB, 100)   // 100 GDC 스테이킹
  assert(d100 < d0, `스테이킹 → 거리 단축: ${d100} < ${d0}`)

  // 닉네임 등록
  const r = await registerNickname('주피터', gA, 'pubkey-b64', 0.001)
  assert(r.success === true, `닉네임 등록: ${r.success}`)
  assert(resolveNickname('주피터') === gA, '닉네임 조회')

  // 이동성: IPv6 업데이트
  registerRecord(gA, '::1', 100)
  updateMobility(gA, '::2')
  assert(lookupGUID(gA)?.ipv6 === '::2', 'IPv6 업데이트')
})

await test('N-05', 'Sybil 4단계 신뢰 등급 + 권한 확인', async () => {
  assert(calcTrustLevel(0, false)    === TRUST_LEVEL.L1, 'L1: 기본')
  assert(calcTrustLevel(100, false)  === TRUST_LEVEL.L2, 'L2: 100 GDC')
  assert(calcTrustLevel(1000, true)  === TRUST_LEVEL.L3, 'L3: 1000 GDC + KYC')

  assert(checkPermission(TRUST_LEVEL.L3, 'escrow')    === true,  'L3: 에스크로 허용')
  assert(checkPermission(TRUST_LEVEL.L2, 'escrow')    === false, 'L2: 에스크로 불가')
  assert(getDailyMsgLimit(TRUST_LEVEL.L0) === 10,                'L0: 일일 10건')
})

// ── GDC 테스트 ────────────────────────────────────────────────────────────
console.log('\n[ GDC ]')

setup()
await test('G-01', '인플레이션율 공식 검증', () => {
  // GDP 35%, 소각률 5%, 기준율 1%
  const rate = calcInflationRate(0.35, 0.05, 0.01)
  const expected = 0.01 + 0.20 * (0.35 - 0.30) - 0.50 * 0.05
  assert(Math.abs(rate - expected) < 0.0001, `인플레이션율: ${rate} vs ${expected.toFixed(6)}`)
  assert(rate <= 0.02, `최대 2% 이하: ${rate}`)
})

await test('G-02', '신규 발행량 계산 + 최대 공급량 캡', () => {
  const issuance = calcNewIssuance(100_000_000, 0.02)
  assert(issuance === 2_000_000, `발행량: ${issuance}`)
  // 최대 공급량 초과 시 캡
  const capped = calcNewIssuance(199_000_000, 0.02)
  assert(capped === 1_000_000, `캡 발행량: ${capped}`)
})

await test('G-03', '다중 소각 6개 경로', () => {
  burn(BURN_PATH.MSG_FEE,      0.001, 'msg-001')
  burn(BURN_PATH.NICKNAME_REG, 0.001, 'nick-001')
  burn(BURN_PATH.STEALTH_TAG,  0.010, 'stealth-001')
  const total = getTotalBurned()
  assert(Math.abs(total - 0.012) < 0.0001, `총 소각: ${total}`)
  assert(getBurnLog(BURN_PATH.MSG_FEE).length === 1, '경로별 이력')

  // 잘못된 경로
  let threw = false
  try { burn('INVALID_PATH', 1) } catch (_) { threw = true }
  assert(threw, '잘못된 경로 오류')
})

await test('G-04', 'GEI 계산', () => {
  const gei = calcGEI(2.5, 1.5)
  assert(gei === 2.0, `GEI: ${gei}`)
})

await test('G-05', 'Smart Vault 4개 바스켓', () => {
  const v = createVault('user-1', VAULT_TYPE.STABLE, 1000)
  assert(v.type === 'stable', `유형: ${v.type}`)
  assert(v.allocation.bonds === 0.50, `채권 50%: ${v.allocation.bonds}`)
  assert(calcExpectedVolatility('stable') < 0.05, '안정형 변동성 <5%')
  assert(getVault('user-1')?.amount === 1000, '조회 성공')

  // 잘못된 유형
  let threw = false
  try { createVault('u2', 'invalid', 100) } catch (_) { threw = true }
  assert(threw, '잘못된 바스켓 오류')
})

await test('G-06', '통화 풀 입금·환전', () => {
  depositGDC('KRW', 1_000_000, 100, 'user-1')
  depositGDC('USD', 750,       100, 'user-2')
  assert(getPoolBalance('KRW') === 1_000_000, `KRW 풀: ${getPoolBalance('KRW')}`)

  const r = exchange('KRW', 'USD', 100_000, 1333)  // 1333원 = 1달러
  assert(r.success === true, `환전 성공: ${r.success}`)
  assert(Math.abs(r.received - 75) < 0.01, `수령: ${r.received}`)
})

await test('G-07', 'K-Law 연동 에스크로 생성·집행', () => {
  createEscrow('esc-001', 'alice', 'bob', 100, 'DELIVERY_CONFIRMED', 'msg-001')
  assert(getEscrow('esc-001')?.status === 'LOCKED', '에스크로 잠금')
  const r = executeFromKLaw('esc-001', 'RELEASE')
  assert(r.success === true, '집행 성공')
  assert(getEscrow('esc-001')?.status === 'RELEASED', '에스크로 해제')
})

await test('G-08', 'DAO 거버넌스 + DAWN 비영리 원칙', () => {
  // 정상 제안
  createProposal('P-001', 'GEI 파라미터 조정', 'alice', { type: 'PARAM_CHANGE' })
  vote('P-001', 'voter-1', 1000, 'yes')
  vote('P-001', 'voter-2', 1500, 'yes')
  vote('P-001', 'voter-3', 800, 'no')
  const result = finalizeProposal('P-001')
  assert(result.status === 'PASSED', `제안 통과: ${result.status}`)

  // 통화 풀 소유권 이전 → 차단
  let threw = false
  try { createProposal('P-002', '불법 제안', 'hacker', { type: 'OWNERSHIP_TRANSFER' }) }
  catch (e) { threw = true; assert(e.message.includes('DAWN'), e.message) }
  assert(threw, 'DAWN 원칙 위반 차단')

  // 최소 스테이킹 미충족 → 투표 불가
  const noVote = vote('P-001', 'voter-poor', 50, 'yes')
  assert(noVote.success === false, '스테이킹 부족 투표 거부')
})

// ── Privacy 테스트 ────────────────────────────────────────────────────────
console.log('\n[ Privacy ]')

setup()
await test('P-01', 'Mixnet GDC 보상·가중 선택·슬래싱', () => {
  registerMixnode('node-A', 100)
  registerMixnode('node-B', 500)
  registerMixnode('node-C', 200)

  rewardRelay('node-A', 0.01)
  assert(getMixnode('node-A')?.relayCount === 1, '중계 횟수 증가')

  slashNode('node-B')
  assert(getMixnode('node-B')?.slashed === true, '노드 슬래싱')

  const path = selectPath(2)
  assert(path.length <= 2, `경로 선택: ${path}`)
  assert(!path.includes('node-B'), '슬래싱 노드 경로 제외')
})

await test('P-02', 'K-익명성 그룹 검증', () => {
  const guids = ['g1','g2','g3','g4','g5']
  const grp = createGroup(guids, 5)
  assert(grp.valid === true, `K=5 충족: ${grp.valid}`)

  const small = createGroup(['g1','g2'], 5)
  assert(small.valid === false, `K=5 미충족: ${small.valid}`)

  assert(satisfiesKAnonymity(guids, 5) === true, '만족')
  assert(satisfiesKAnonymity(['g1'], 5) === false, '미만족')
})

await test('P-03', '적응형 PoW + 평판 시스템', () => {
  // 기본 난이도
  assert(calcDifficulty('new-user') === 4, '기본 난이도 4')

  // 위반 3회 → 난이도 +1
  updateReputation('bad-user', 'violation')
  updateReputation('bad-user', 'violation')
  updateReputation('bad-user', 'violation')
  assert(calcDifficulty('bad-user') === 5, `위반 후 난이도: ${calcDifficulty('bad-user')}`)

  // PoW 검증
  assert(verifyPoW('0000abc', 4) === true,  '0000 → 난이도 4 통과')
  assert(verifyPoW('1000abc', 4) === false, '1000 → 난이도 4 실패')
})

await test('P-04', 'Salt 파생 + 행정코드 마스킹', async () => {
  const salt1 = await deriveSalt('user-1', '11010')
  const salt2 = await deriveSalt('user-1', '11010')
  assert(salt1 === salt2, '결정론적 Salt')
  assert(salt1.length === 64, `Salt 길이: ${salt1.length}`)

  const masked = await maskAdminCode('11010', salt1)
  assert(masked.length === 16, `마스킹 길이: ${masked.length}`)
  assert(masked !== '11010', '원본과 다름')
})

await test('P-05', '사회적 복구 — 보호자 60% 승인', async () => {
  const { requestId, threshold } = await createRecoveryRequest(
    'alice', ['g1','g2','g3','g4','g5'], 'new-pubkey-b64'
  )
  assert(threshold === 3, `임계값 3/5: ${threshold}`)

  approveRecovery('alice', 'g1')
  approveRecovery('alice', 'g2')
  const r3 = approveRecovery('alice', 'g3')
  assert(r3.completed === true, '60% 승인 → 복구 완료')
  assert(r3.newPubKeyB64 === 'new-pubkey-b64', '새 공개키 반환')
})

await test('P-06', '오프라인 큐 예치금 계산·환불', () => {
  // 예치금 = 0.0001 × KB × h × (1 + 지연가중치)
  const dep = calcDeposit(10, 24, 'L1')  // L1 지연가중치 0.5
  const expected = 0.0001 * 10 * 24 * 1.5
  assert(Math.abs(dep - expected) < 0.00001, `예치금: ${dep} vs ${expected}`)

  enqueue('msg-q01', 'alice', 10, 'L1')
  const r = confirmReceived('msg-q01')
  assert(r.success === true, '수신 확인')
  assert(r.refund > 0, `환불: ${r.refund}`)
})

// ── 결과 ─────────────────────────────────────────────────────────────────
console.log(`\n결과: ${passed} 통과 / ${failed} 실패 / 총 ${passed + failed}\n`)
if (failed > 0) process.exit(1); else process.exit(0)
