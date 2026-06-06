# gopang_v2: 확장 가능한 고팡 인프라 플랫폼
## 단계별 코드 작성 계획서 v3.1 (완성본)

> 근거 문서: GAS v1.6 / GDC Whitepaper v1.5 / KL-S-01 v2.1 / KL-M-02 v1.0 / OpenHash SCI 논문 v2.2  
> 대상 repo: github.com/openhash-gopang/gopang_v2  
> 작성일: 2026-05-22  
> v3.0 → v3.1 주요 개정: tests/ 구조 추가, app.js 진입점 추가, constants/config 분리, Phase 2 세분화, 순환 참조 해소

---

## 0. 설계 철학

고팡은 K-Law(사법)에서 시작하여 K-Health(의료), K-Edu(교육), K-Market(시장), K-Finance(금융), K-Gov(행정) 등 모든 사회 인프라를 AI 쌍둥이로 구현하는 플랫폼이다. 이를 위해 세 가지 원칙을 견지한다.

**원칙 1 — Plugin Architecture:** 모든 도메인은 플러그인으로 구현. 코어 코드는 절대 변경하지 않는다.  
**원칙 2 — Event-Driven Communication:** 플러그인 간 직접 참조 금지. EventBus 경유만 허용. 버그 격리 보장.  
**원칙 3 — Interface Contract:** 모든 플러그인이 동일한 계약을 구현. AI 비서가 어떤 도메인이든 동일하게 처리.

---

## 1. 전체 파일 목록

### 의존성 방향 규칙
```
core → (없음)
pdv  → core
openhash → core
ai-secretary → core + pdv + openhash
network → core + openhash
gdc → core + network (단방향)
privacy → core
domains → core + pdv + openhash + ai-secretary
app.js → 전체 조립
```
**금지:** event-bus → plugin-registry (순환 참조 방지)  
**금지:** network → gdc (gdc 상태는 EventBus로만 수신)

---

### 디렉토리 전체 구조

```
gopang_v2/
│
├── src/
│   ├── app.js                              ← 부트스트랩 진입점
│   │
│   ├── core/                               ← 절대 변경 금지
│   │   ├── constants.js                    ← 전역 상수 (매직 넘버 일원화)
│   │   ├── config.js                       ← 환경별 설정 (dev/prod)
│   │   ├── plugin-interface.js             ← 플러그인 계약 정의
│   │   ├── plugin-validator.js             ← 플러그인 유효성 검사
│   │   ├── plugin-registry.js              ← 플러그인 등록·업데이트·조회
│   │   └── event-bus.js                    ← 이벤트 발행·구독·오류 격리
│   │
│   ├── pdv/
│   │   ├── keyManager.js                   ← Ed25519 키쌍·서명·삼중 서명
│   │   ├── vault.js                        ← IndexedDB 암호화 저장소
│   │   └── evidencePackage.js              ← 자기완결 증거 패키지 (OpenHash 의존)
│   │
│   ├── openhash/
│   │   ├── plsm.js                         ← 이중 SHA-256 계층 선택
│   │   ├── hashChain.js                    ← 앵커링 + Merkle 배치
│   │   ├── bivm.js                         ← 잔액 불변성 + BMI 검증
│   │   ├── ilmv.js                         ← 양방향 계층 감사
│   │   ├── lpbft.js                        ← 긴급 경량 합의
│   │   ├── importanceVerifier.js           ← 경량·표준·강화 모드 선택
│   │   └── transactionPipeline.js          ← Stage 1~5 거래 처리
│   │
│   ├── ai-secretary/
│   │   ├── pipeline.js                     ← Phase 0~6 오케스트레이터
│   │   ├── phase0.js                       ← 소통 객체 식별 (Q0.1~Q0.8)
│   │   ├── phase1.js                       ← SU 태깅 + Fast-Path + Context-Path
│   │   ├── phase2.js                       ← 플러그인 분류기 동적 로딩
│   │   ├── phase3.js                       ← 문서·파일 분석 (DOC-1~4)
│   │   ├── phase4.js                       ← WS 공식 + 쌍방향 검증
│   │   ├── phase5.js                       ← S0~S3 등급 판정
│   │   ├── phase6.js                       ← PDV 기록 + OpenHash 앵커링
│   │   └── agentProtocol.js                ← AI 간 협업 7단계 + 삼중 서명
│   │
│   ├── network/
│   │   ├── layerClient.js                  ← L1~L5 노드 통신 (K=3 리던던시)
│   │   ├── gasAddress.js                   ← GUID·IPv6·Stealth·Sybil 4단계
│   │   └── dht.js                          ← GDC 가중 DHT + 닉네임 + 이동성
│   │
│   ├── gdc/
│   │   ├── tokenomics.js                   ← 발행·소각·인플레이션·GEI
│   │   ├── smartVault.js                   ← 안정형·균형형·성장형·통화형
│   │   ├── currencyPool.js                 ← 다국적 통화 풀·지분 토큰
│   │   ├── escrow.js                       ← K-Law 연동 자동 집행 에스크로
│   │   ├── dao.js                          ← DAO 거버넌스·DAWN 비영리 강제
│   │   └── offlineQueue.js                 ← 예치금 큐·IPFS 폴백
│   │
│   ├── privacy/
│   │   ├── mixnet.js                       ← GDC 보상·가중 라우팅·슬래싱
│   │   ├── pir.js                          ← Private Information Retrieval
│   │   ├── kAnonymity.js                   ← K-익명성 그룹
│   │   ├── adaptivePow.js                  ← 스팸·DoS 방지 + 평판 시스템
│   │   ├── salt.js                         ← Shamir 4-of-7 컨소시엄 Salt
│   │   └── socialRecovery.js               ← 개인키 분실 복구
│   │
│   ├── domains/
│   │   ├── _template/                      ← 새 도메인 추가 시 복사
│   │   │   ├── index.js
│   │   │   ├── classifier.js
│   │   │   ├── risk-rules.js
│   │   │   ├── ui.js
│   │   │   ├── api.js
│   │   │   ├── schema.js
│   │   │   ├── CHANGELOG.md
│   │   │   └── README.md                   ← 플러그인 작성 가이드
│   │   │
│   │   ├── k-law/                          ← 사법 (1호 플러그인)
│   │   │   ├── index.js
│   │   │   ├── classifier.js               ← CR-1~5, CV-1~4, LB-1~2, CC-1~2
│   │   │   ├── risk-rules.js               ← Fast-Path FP-01~n
│   │   │   ├── ui.js
│   │   │   ├── api.js                      ← /verify/signature, /evidence-report
│   │   │   ├── schema.js
│   │   │   ├── CHANGELOG.md
│   │   │   └── README.md
│   │   │
│   │   └── k-health/                       ← 의료 (2호 플러그인)
│   │       ├── index.js
│   │       ├── classifier.js               ← MED-01~5
│   │       ├── risk-rules.js
│   │       ├── ui.js
│   │       ├── api.js
│   │       ├── schema.js
│   │       ├── CHANGELOG.md
│   │       └── README.md
│   │
│   └── tests/                              ← 단위 테스트 (Phase별)
│       ├── core/
│       │   ├── plugin-registry.test.js
│       │   ├── event-bus.test.js
│       │   └── plugin-validator.test.js
│       ├── pdv/
│       │   ├── keyManager.test.js
│       │   ├── vault.test.js
│       │   └── evidencePackage.test.js
│       ├── openhash/
│       │   ├── plsm.test.js
│       │   ├── hashChain.test.js
│       │   ├── bivm.test.js
│       │   └── lpbft.test.js
│       ├── ai-secretary/
│       │   ├── pipeline.test.js
│       │   └── phase1.test.js
│       └── domains/
│           ├── k-law.test.js
│           └── k-health.test.js
│
├── docs/
│   ├── gopang_v2_implementation_plan_v3.1.md  ← 이 문서
│   ├── architecture.md                         ← 전체 아키텍처 다이어그램
│   ├── plugin-guide.md                         ← 새 플러그인 추가 가이드
│   ├── tests/
│   │   ├── phase1_test_report.md
│   │   ├── phase2_test_report.md
│   │   ├── phase3_test_report.md
│   │   ├── phase4_test_report.md
│   │   ├── phase5_test_report.md
│   │   ├── phase6_test_report.md
│   │   ├── phase7_test_report.md
│   │   └── phase8_test_report.md
│   └── bugs/
│       └── bug_log.md                          ← 버그 발생·원인·조치 이력
│
├── index.html                                  ← Shell UI (Phase 7)
├── build.py
├── gopang/prompts/
├── klaw/prompts/
└── manifest.json
```

**총 파일 수:** 소스 63개 + 테스트 11개 + 문서 14개 = **88개**

---

## 2. Phase별 구현 계획

### Phase 1: 플랫폼 코어 (1주)
**목표:** 플러그인 생태계의 뼈대 구축. 이후 모든 Phase의 전제 조건.

| 순서 | 파일 | 의존성 | 핵심 구현 |
|------|------|--------|---------|
| 1 | `core/constants.js` | 없음 | 전역 상수 일원화 |
| 2 | `core/config.js` | 없음 | dev/prod 환경 분리 |
| 3 | `core/plugin-interface.js` | constants | 플러그인 계약 정의 |
| 4 | `core/event-bus.js` | constants | 이벤트 발행·구독·오류 격리 |
| 5 | `core/plugin-validator.js` | plugin-interface | 필수 필드·semver 검사 |
| 6 | `core/plugin-registry.js` | event-bus, plugin-validator | 등록·업데이트·semver 호환 |
| 7 | `domains/_template/*` | plugin-interface | 8개 파일 템플릿 |

```javascript
// constants.js 핵심 항목
export const PLSM = { L1:600, L2:200, L3:100, L4:60, L5:40 }
export const RISK = { S0:0.30, S1:0.60, S2:0.85 }
export const STAKING = { L2:100, L3:1000 }       // GDC
export const PERF = {
  EVIDENCE_PACKAGE_MS: 1200,   // 1.2초
  LPBFT_TARGET_MS: 759,
  PHASE1_SHORT_MS: 0.81,
  PHASE3_DOC_MS: 15,
}
export const QUEUE = { RATE: 0.0001 }             // GDC/KB/h
export const EVENTS = { /* 표준 이벤트명 */ }
```

**테스트 파일:** `tests/core/`  
**테스트 케이스:**

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| C-01 | 유효한 플러그인 등록 | 성공, registry에 등록됨 |
| C-02 | 필수 필드 누락 플러그인 | 오류 발생, 등록 거부 |
| C-03 | 동일 이름 중복 등록 | 오류 발생 |
| C-04 | semver major 변경 업데이트 | BREAKING_CHANGE 오류 |
| C-05 | semver minor 변경 업데이트 | 성공 |
| C-06 | 이벤트 발행·구독 | 핸들러 호출 확인 |
| C-07 | 핸들러 오류 발생 시 | 다른 핸들러 정상 실행 유지 |
| C-08 | event-bus가 plugin-registry import 시도 | 빌드 오류 (순환 참조 차단) |

**문서:** `docs/tests/phase1_test_report.md`  
**커밋:** `feat: Phase 1 플랫폼 코어 구현 완료`

---

### Phase 2A: PDV 기반 레이어 (0.5주)
**목표:** 암호화·서명·저장소 구현. evidencePackage 제외.

| 순서 | 파일 | 의존성 | 핵심 구현 |
|------|------|--------|---------|
| 1 | `pdv/keyManager.js` | constants | Ed25519 키쌍·서명·삼중 서명 |
| 2 | `pdv/vault.js` | keyManager | IndexedDB 암호화 CRUD |

```javascript
// keyManager.js 핵심
generateKeyPair()                           // Ed25519 (non-extractable)
signMessage(msg, privKey)                   // 발신자 서명
verifySignature(msg, sig, pubKey)           // 서명 검증
encryptMessage(msg, recipientPubKey)        // AES-256-GCM
decryptMessage(ciphertext, privKey)
generateTripleSignature(userSig, agentSig, openHashRef)  // 삼중 서명

// vault.js IndexedDB 스키마
MessageStore: {
  msgId, content(encrypted), senderPubKey,
  signature, timestamp, openHashRef(null→Phase2C에서 채움),
  riskLevel, riskScore, legalFlags, phaseLog,
  aiWarningLog, tripleSign, docAnalysis
}
```

**테스트 파일:** `tests/pdv/keyManager.test.js`, `tests/pdv/vault.test.js`

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| P-01 | 키쌍 생성 | pubKey/privKey 반환, privKey non-extractable |
| P-02 | 서명 후 검증 | true |
| P-03 | 서명 후 내용 변조 후 검증 | false |
| P-04 | 삼중 서명 생성·검증 | 3자 서명 모두 확인 |
| P-05 | AES-256-GCM 암호화·복호화 | 원본 일치 |
| P-06 | vault 저장 후 조회 | 동일 내용 반환 |
| P-07 | vault 존재하지 않는 ID 조회 | null 반환 |
| P-08 | openHashRef 업데이트 | 해시값 저장 확인 |

**커밋:** `feat: Phase 2A PDV 기반 레이어 구현 완료`

---

### Phase 2B: OpenHash 레이어 (1주)
**목표:** 5계층 해시 체인·검증·합의 구현.

| 순서 | 파일 | 의존성 | 핵심 구현 |
|------|------|--------|---------|
| 1 | `openhash/plsm.js` | constants | 이중 SHA-256, mod 1000, 5계층 선택 |
| 2 | `openhash/hashChain.js` | plsm, constants | 앵커링 + Merkle 배치 |
| 3 | `openhash/bivm.js` | constants | Σδ_k=0 + BMI 검증 |
| 4 | `openhash/ilmv.js` | constants | 하향 6항목 + 상향 6임계값 |
| 5 | `openhash/lpbft.js` | constants | 비상 5조건, 비활성화 4조건 |
| 6 | `openhash/importanceVerifier.js` | constants | 경량·표준·강화 모드 |
| 7 | `openhash/transactionPipeline.js` | bivm, constants | Stage 1~5 |

**테스트 파일:** `tests/openhash/`

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| O-01 | PLSM 100만 회 호출 | χ² p>0.99, L1≈60% |
| O-02 | Hash Chain 연속 앵커링 | prevHash 체인 연결 확인 |
| O-03 | Merkle Proof 생성·검증 | 포함 증명 성공 |
| O-04 | BIVM Σδ≠0 | BIVM_SET_VIOLATION 오류 |
| O-05 | BIVM BMI 위변조 | BIVM_BMI_VIOLATION 오류 (3/3) |
| O-06 | LPBFT 비상 조건 발동 | 합의 수행, 0.759ms 목표 기록 |
| O-07 | LPBFT 비활성화 4조건 충족 | NORMAL 상태 복귀 |
| O-08 | 중요도 점수 <30 | 경량 모드 선택 |
| O-09 | 중요도 점수 ≥60 | 강화 모드 선택 |
| O-10 | Stage 4 Isolation Forest | 시간당 ≥10건 이상 탐지 |

**커밋:** `feat: Phase 2B OpenHash 레이어 구현 완료`

---

### Phase 2C: PDV+OpenHash 통합 (0.5주)
**목표:** evidencePackage — 두 레이어 결합.

| 파일 | 의존성 | 핵심 구현 |
|------|--------|---------|
| `pdv/evidencePackage.js` | vault + hashChain + constants | 자기완결 증거 패키지 |

```javascript
// 자기완결 증거 구조 3요소 (GAS v1.6 §20.2)
generateEvidencePackage(msgId) → {
  victimPDV:       vault.get(msgId),          // ① 피해자 PDV 원본
  senderSignature: msg.signature,             // ② 발신자 서명
  openHashProof:   hashChain.getProof(msgId), // ③ OpenHash 해시 체인
  merkleProof:     hashChain.getMerkle(msgId),
  aiWarningLog:    msg.aiWarningLog,
  verificationUrl: `https://verify.gopang.net/${msgId}`
}
// 목표: PERF.EVIDENCE_PACKAGE_MS (1200ms) 이내
```

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| E-01 | 증거 패키지 생성 시간 | ≤1200ms |
| E-02 | 서명 검증 | true |
| E-03 | OpenHash Proof 검증 | 해시 일치 |
| E-04 | 가해자 PDV 삭제 시뮬레이션 | 피해자 PDV+서명+OpenHash로 완결 |

**커밋:** `feat: Phase 2C 증거 패키지 통합 구현 완료`

---

### Phase 3: AI 비서 파이프라인 (1.5주)
**목표:** Phase 0~6 오케스트레이터 + 플러그인 동적 주입.

| 순서 | 파일 | 핵심 구현 |
|------|------|---------|
| 1 | `ai-secretary/phase0.js` | Q0.1~Q0.8, 즉시 S3 조건 |
| 2 | `ai-secretary/phase1.js` | SU 태깅, Fast-Path, Context-Path |
| 3 | `ai-secretary/phase2.js` | **플러그인 분류기 동적 로딩** |
| 4 | `ai-secretary/phase3.js` | DOC-1~4 문서 분석 |
| 5 | `ai-secretary/phase4.js` | WS 공식, 쌍방향 검증 |
| 6 | `ai-secretary/phase5.js` | S0~S3 판정 |
| 7 | `ai-secretary/phase6.js` | PDV 저장 + OpenHash 앵커링 |
| 8 | `ai-secretary/agentProtocol.js` | AI 간 협업 7단계 + 삼중 서명 |
| 9 | `ai-secretary/pipeline.js` | **전체 오케스트레이터 (마지막)** |

```javascript
// phase2.js — 플러그인 동적 주입 핵심 로직
async function classify(suList, activeDomainNames) {
  const results = {}
  for (const name of activeDomainNames) {
    const plugin = registry.get(name)
    try {
      results[name] = await plugin.legalClassifier.classify(suList)
    } catch (err) {
      // 오류 격리: 한 플러그인 실패가 다른 도메인에 영향 없음
      results[name] = { error: err.message, flags: [] }
      EventBus.emit(EVENTS.PLUGIN_ERROR, { name, phase: 2, err })
    }
  }
  return results
}

// phase4.js — WS 공식 + 쌍방향 검증
// FINAL = P1×0.50 + P2×0.35 + P3×0.15 (× 이력 가중치)
// 발신·수신 각각 독립 산출 → maxScore 적용
```

**테스트 파일:** `tests/ai-secretary/`

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| A-01 | 단문 전체 파이프라인 | ≤0.81ms (PERF.PHASE1_SHORT_MS) |
| A-02 | Fast-Path 보이스피싱 패턴 | S3 즉시 차단, ≥99.7% 탐지 |
| A-03 | Q0.6 암호화 이상 | 즉시 S3 |
| A-04 | Q0.8 30일 내 S2 이력 | 가중치 1.3 적용 확인 |
| A-05 | DOC-2 금융문서 첨부 | 15ms 이내 분석 |
| A-06 | 2개 플러그인 동시 활성화 | 도메인별 독립 결과 반환 |
| A-07 | 1개 플러그인 오류 주입 | 나머지 플러그인 정상 동작 |
| A-08 | AI 간 협업 7단계 | 삼중 서명 생성 확인 |
| A-09 | Phase 6 전체 기록 항목 | vault에 모든 필드 저장 확인 |

**커밋:** `feat: Phase 3 AI 비서 파이프라인 구현 완료`

---

### Phase 4: K-Law 플러그인 (0.5주)
**목표:** 1호 플러그인. 템플릿 검증 + 실전 법령 분류기.

| 파일 | 핵심 구현 |
|------|---------|
| `domains/k-law/index.js` | 플러그인 진입점 + LEGAL_DISPUTE 이벤트 구독 |
| `domains/k-law/classifier.js` | CR-1~5, CV-1~4, LB-1~2, CC-1~2 |
| `domains/k-law/risk-rules.js` | Fast-Path FP-01~n (KL-M-02 §1.2) |
| `domains/k-law/ui.js` | 위험 배지, 법령 플래그 패널 |
| `domains/k-law/api.js` | /verify/signature, /evidence-report/{id} |
| `domains/k-law/schema.js` | K-Law 전용 필드 (legalFlags, courtRef 등) |
| `domains/k-law/CHANGELOG.md` | v1.0.0 초기 릴리스 |
| `domains/k-law/README.md` | K-Law 도메인 문서 |

**테스트 파일:** `tests/domains/k-law.test.js`

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| K-01 | k-law 플러그인 등록 | registry에 등록, 코어 변경 없음 |
| K-02 | 보이스피싱 메시지 | CR-3 플래그, S3 판정 |
| K-03 | 임대차 위법 조항 | CV-2 플래그, S2 판정, 탐지율 ≥93.3% |
| K-04 | S3 감지 시 LEGAL_DISPUTE 이벤트 | EventBus 발행 확인 |
| K-05 | GDC 에스크로 생성 제안 | GDC_ESCROW_CREATED 이벤트 확인 |
| K-06 | 증거 패키지 API 응답 | 유효한 패키지 반환 |

**커밋:** `feat: Phase 4 K-Law 플러그인 v1.0.0 구현 완료`

---

### Phase 5: Network + GDC + Privacy (1.5주)
**목표:** 경제·네트워크·프라이버시 레이어 구현.

#### 5-A. Network (`src/network/`)

| 파일 | 핵심 구현 |
|------|---------|
| `layerClient.js` | L1~L5 통신, K=3 리던던시, 자동 페일오버 |
| `gasAddress.js` | GDC 의존 GUID, IPv6 신뢰 등급, Stealth 소각 태그, Sybil 4단계 |
| `dht.js` | GDC 가중 거리 함수, 닉네임 등록·경매, 이동성 모델 |

#### 5-B. GDC (`src/gdc/`)

| 파일 | 핵심 구현 |
|------|---------|
| `tokenomics.js` | 인플레이션 공식, 6개 소각 경로, GEI |
| `smartVault.js` | 4개 바스켓 (안정·균형·성장·통화) |
| `currencyPool.js` | 193개국 풀, 지분 토큰, 리밸런싱 |
| `escrow.js` | K-Law 판결 → EventBus → 자동 집행 |
| `dao.js` | GDC≥1000 1인1표, L1 노드 1표, 소유권 이전 차단 |
| `offlineQueue.js` | 예치금 공식, 환불·귀속, IPFS 폴백 |

**의존성 방향 (단방향 강제):**
```
gdc/escrow.js → EventBus.on(EVENTS.GDC_KLAW_EXECUTED) (수신만)
network/gasAddress.js → gdc/tokenomics.js (스테이킹 조회)
gdc/dao.js → network/layerClient.js (L1 노드 투표 제출)
// network는 gdc를 import하지 않음
```

#### 5-C. Privacy (`src/privacy/`)

| 파일 | 핵심 구현 |
|------|---------|
| `mixnet.js` | GDC 보상, 가중 경로 선택, 슬래싱 |
| `pir.js` | Private Information Retrieval |
| `kAnonymity.js` | K-익명성 그룹 |
| `adaptivePow.js` | 적응형 PoW + 평판 시스템 |
| `salt.js` | Shamir 4-of-7 컨소시엄 Salt |
| `socialRecovery.js` | 개인키 분실 복구 (GAS §9.1) |

**커밋:** `feat: Phase 5 Network + GDC + Privacy 레이어 구현 완료`

---

### Phase 6: K-Health 플러그인 (0.5주)
**목표:** 2호 플러그인. 플러그인 아키텍처 확장성 실증.

```
_template/ 복사 → k-health/ 이름 변경 → 아래 항목만 수정
```

| 파일 | 수정 내용 |
|------|---------|
| `index.js` | metadata + MEDICAL_ALERT 이벤트 구독 |
| `classifier.js` | MED-01(무허가의료) MED-02(처방전위조) MED-03(개인정보침해) MED-04(의료광고위반) MED-05(불법의약품) |
| `risk-rules.js` | HFPA-01(처방전없이구매) HFPA-02(무자격진료) |
| `schema.js` | 의료 전용 필드 추가 |
| `CHANGELOG.md` | v1.0.0 |

**검증 항목 (코어 변경 없음 확인):**

| ID | 케이스 | 기대 결과 |
|----|--------|---------|
| H-01 | k-health 등록 후 k-law 동작 | K-Law 완전 정상 동작 |
| H-02 | k-health 플러그인 오류 주입 | K-Law 영향 없음 |
| H-03 | 무허가 의료 메시지 | MED-01 플래그, S3 판정 |
| H-04 | 두 플러그인 동시 S2 | 두 도메인 독립 경고 표시 |
| H-05 | 코어 파일 변경 라인 수 | 0줄 (변경 없음) |

**커밋:** `feat: Phase 6 K-Health 플러그인 v1.0.0 구현 완료`

---

### Phase 7: 부트스트랩 + Shell UI (0.5주)
**목표:** app.js 진입점 + index.html 통합 UI.

#### `src/app.js` — 부트스트랩 순서

```javascript
// 순서가 의존성을 결정한다
async function bootstrap() {
  // 1. 코어 초기화
  await EventBus.init()
  await registry.init()

  // 2. 코어 레이어 초기화
  await PDV.init()
  await OpenHash.init()

  // 3. 도메인 플러그인 등록 (순서 무관)
  await registry.register(new KLawPlugin())
  await registry.register(new KHealthPlugin())
  // 추후: await registry.register(new KMarketPlugin())

  // 4. AI 비서 파이프라인 초기화
  await AIPipeline.init()

  // 5. 경제·네트워크·프라이버시 레이어 초기화
  await Network.init()
  await GDC.init()
  await Privacy.init()

  // 6. Shell UI 렌더링
  await ShellUI.render(registry.list())
}
```

#### `index.html` Shell UI

```
┌──────────────────────────────────────────────┐
│  도메인 탭 (registry.list()로 자동 생성)       │
│  [⚖️ K-Law] [🏥 K-Health] [➕ 추가 예정]     │
├──────────────────────────────────────────────┤
│  메신저 + AI 비서                              │
│  위험 배지: [S0 안전 · K-Law ⚖️]             │
│             [S1 주의 · K-Health 🏥]           │
├──────────────────────────────────────────────┤
│  🔐 PDV 암호화 | ⛓️ OpenHash: a3f2... | L2  │
│  💰 잔액: -- GDC | 신뢰 등급: L1             │
│  [⚖️ 증거 패키지 다운로드]                   │
└──────────────────────────────────────────────┘
```

**커밋:** `feat: Phase 7 부트스트랩 + Shell UI 구현 완료`

---

### Phase 8: 전체 통합 테스트 + 문서화 (0.5주)
**목표:** 시스템 수준 검증 + 버그 추적 체계 수립.

#### 통합 테스트 시나리오

| ID | 시나리오 | 기대 결과 |
|----|---------|---------|
| I-01 | 보이스피싱 (K-Law + K-Finance 동시) | 두 도메인 S3, LEGAL_DISPUTE + FINANCIAL_ALERT |
| I-02 | 무허가 의료 문의 | K-Health S3, MEDICAL_ALERT |
| I-03 | 금융 문서 첨부 + 임대차 위법 조항 | DOC-2 분석 + CV-2 플래그 |
| I-04 | AI 간 협업 (연말정산 자율 처리) | 7단계 완료, 삼중 서명 생성 |
| I-05 | 메시지 위변조 시도 | BIVM 탐지, ILMV 상향 알림 |
| I-06 | 가해자 PDV 삭제 시뮬 | 증거 패키지 완결 확인 |
| I-07 | K-Health 플러그인 충돌 주입 | K-Law 정상 동작 유지 |
| I-08 | K-Law v1.1.0 hot-update | 다른 플러그인 영향 없음 |
| I-09 | 새 플러그인 hot-register | 앱 재시작 없이 탭 자동 생성 |

#### 성능 검증 목표

| 항목 | 목표 | 근거 |
|------|------|------|
| AI 비서 단문 | ≤0.81ms | KL-S-01 §5.2 실측 |
| 문서 분석 A4 1p | ≤15ms | KL-M-02 §3.1 |
| 증거 패키지 생성 | ≤1200ms | KL-S-01 §5.4 실측 |
| OpenHash E2E | ≤3.09ms | KL-S-01 부록 I |
| PLSM 단일 노드 | 4,399 TPS | OpenHash 논문 §6 |
| LPBFT L1 4노드 | ≤0.759ms | OpenHash 논문 §4.4 |

#### `docs/bugs/bug_log.md` 형식

```markdown
## BUG-001
- **발생일:** YYYY-MM-DD
- **Phase:** 2B
- **파일:** openhash/plsm.js
- **증상:** L1 분포 58%, L2 22% (목표 60%/20%)
- **원인:** mod 1000 후 정수 변환 오류
- **조치:** parseInt → Math.floor 변경
- **재확인:** χ² p=0.991 통과
- **커밋:** fix: PLSM 정수 변환 버그 수정
```

**커밋:** `test: Phase 8 전체 통합 테스트 완료`

---

## 3. 전체 Phase 일정 요약

| Phase | 내용 | 기간 | 소스 파일 | 테스트 파일 | 문서 |
|-------|------|------|----------|-----------|------|
| 1 | 플랫폼 코어 | 1주 | 7개 | 3개 | test_report_1 |
| 2A | PDV 기반 | 0.5주 | 2개 | 2개 | test_report_2 |
| 2B | OpenHash | 1주 | 7개 | 4개 | test_report_2 |
| 2C | 증거 패키지 통합 | 0.5주 | 1개 | 1개 | test_report_2 |
| 3 | AI 비서 파이프라인 | 1.5주 | 9개 | 2개 | test_report_3 |
| 4 | K-Law 플러그인 | 0.5주 | 8개 | 1개 | test_report_4 |
| 5 | Network+GDC+Privacy | 1.5주 | 15개 | — | test_report_5 |
| 6 | K-Health 플러그인 | 0.5주 | 8개 | 1개 | test_report_6 |
| 7 | 부트스트랩+Shell UI | 0.5주 | 2개 | — | test_report_7 |
| 8 | 통합 테스트+문서화 | 0.5주 | — | — | test_report_8 |
| **합계** | | **약 8주** | **59개** | **14개** | **14개** |

---

## 4. 새 도메인 추가 절차 (플러그인 아키텍처 효과)

```
1. _template/ 복사          → 5분
2. metadata 수정            → 10분
3. classifier.js 작성       → 1~2일 (법령 분류 규칙)
4. risk-rules.js 작성       → 반나절 (Fast-Path 트리거)
5. schema.js 수정           → 1시간 (도메인 특화 필드)
6. CHANGELOG.md 작성        → 10분
7. app.js에 register() 추가 → 1줄
8. 테스트 작성·실행         → 반나절

총 소요: 약 2~4일 | 코어 변경: 0줄
```

---

*© 2026 AI City Inc. — gopang_v2 구현 계획서 v3.1 완성본*  
*두 번의 구조 검토 반영: 순환 참조 해소 / tests 구조 추가 / app.js 진입점 / constants 일원화 / Phase 2 세분화*
