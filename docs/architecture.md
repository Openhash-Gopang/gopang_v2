# gopang_v2 아키텍처 문서

> 근거: GAS v1.6 / GDC Whitepaper v1.5 / OpenHash SCI 논문 v2.2  
> 최종 갱신: 2026-05-22

---

## 1. 의존성 방향 (단방향 강제)

```
core          ←  (의존성 없음, 절대 변경 금지)
pdv           ←  core
openhash      ←  core
ai-secretary  ←  core + pdv + openhash
network       ←  core + openhash
gdc           ←  core + network (단방향)
privacy       ←  core
domains       ←  core + pdv + openhash + ai-secretary
app.js        ←  전체 조립
```

**금지 규칙**
- `event-bus → plugin-registry` (순환 참조)
- `network → gdc` (gdc 상태는 EventBus로만 수신)
- 플러그인 간 직접 import (EventBus 경유만 허용)

---

## 2. 부트스트랩 순서 (app.js)

```
1. EventBus.init()          코어 이벤트 버스
2. PluginRegistry.init()    플러그인 레지스트리
3. PDVLayer.init()          암호화·서명·저장소
4. OpenHashLayer.init()     해시체인·앵커링
5. registry.register(...)   도메인 플러그인 (순서 무관)
6. AIPipeline.init()        AI 비서 파이프라인
7. NetworkLayer.init()      L1~L5 노드 통신
8. GDCLayer.init()          토큰경제
9. PrivacyLayer.init()      믹스넷·익명성
10. ShellUI.render()        Shell UI 렌더링
```

---

## 3. 메시지 처리 흐름 (AI 비서 파이프라인)

```
사용자 입력
    │
    ▼
Phase 0: 소통 객체 식별 (Q0.1~Q0.8)
    │
    ▼
Phase 1: Fast-Path 검사 (≤0.81ms 목표)
    ├── S3 즉시 → LEGAL_DISPUTE / MEDICAL_ALERT 이벤트
    └── 통과 → Context-Path
    │
    ▼
Phase 2: 플러그인 분류기 동적 로딩 (registry.list())
    │
    ▼
Phase 3: 문서·파일 분석 (DOC-1~4, ≤15ms)
    │
    ▼
Phase 4: WS 공식 + 쌍방향 검증
    │
    ▼
Phase 5: S0~S3 등급 판정
    │
    ▼
Phase 6: PDV 기록 + OpenHash 앵커링 + 삼중 서명
    │
    ▼
EventBus.emit('ai:result', result)
```

---

## 4. 플러그인 아키텍처

### 인터페이스 계약 (plugin-interface.js)

```javascript
{
  name:     string,          // 고유 식별자
  version:  string,          // semver (x.y.z)
  metadata: {
    icon:   string,          // UI 탭 아이콘
    label:  string,          // UI 탭 이름
    domain: string,          // 도메인 분류
  },
  classifier: {
    classify(text): string[],  // 법령 플래그 배열 반환
    fastPath(text): 'S3'|null, // 즉시 S3 여부
  },
  init(): Promise<void>,
}
```

### 플러그인 격리 보장

- 플러그인 간 직접 import **금지** → EventBus 경유만 허용
- 각 플러그인 `classify()` / `fastPath()` 오류 → `try-catch` 격리 → 다른 플러그인 정상 실행
- hot-register: `registry.register()` 호출 → `PLUGIN_REGISTERED` 이벤트 → ShellUI 탭 자동 추가

---

## 5. OpenHash 레이어

| 모듈 | 역할 |
|------|------|
| `plsm.js` | 이중 SHA-256 + BigInt mod → L1~L5 확률적 선택 |
| `hashChain.js` | 앵커링 + Merkle 배치 + 무결성 검증 |
| `bivm.js` | Σδ=0 잔액 불변성 + BMI 개별 위변조 탐지 |
| `ilmv.js` | 하향 감사 + 상향 모니터링 + 교차 검증 |
| `lpbft.js` | 5개 비상 조건 + 4개 비활성화 복귀 (≤0.759ms) |
| `importanceVerifier.js` | 경량·표준·강화 모드 선택 |
| `transactionPipeline.js` | Stage 1~5 거래 처리 |

**계층 선택 확률 (PLSM)**

| 계층 | 목표 확률 | 범위 |
|------|----------|------|
| L1 | 60% | 0~599 |
| L2 | 20% | 600~799 |
| L3 | 10% | 800~899 |
| L4 | 6% | 900~959 |
| L5 | 4% | 960~999 |

---

## 6. GDC 토큰경제

```
발행: 인플레이션 공식 (GEI 연동)
소각: 6개 경로 (거래 수수료·스팸·슬래싱·에스크로 귀속·오프라인 큐·DAO 벌금)
바스켓: 안정형·균형형·성장형·통화형 (193개국 통화 풀)
DAO: GDC≥1000 1인1표, L1 노드 1표, DAWN 비영리 강제
```

---

## 7. 증거 패키지 3요소 (자기완결)

```
1. PDV 암호화 기록    (vault.js)
2. OpenHash 앵커 ref  (hashChain.js)
3. 삼중 서명          (keyManager.js: userSig + agentSig + openHashRef)
```

가해자가 PDV를 삭제해도 ②③이 블록체인에 앵커링되어 법원 증거 능력 유지.

---

## 8. 성능 목표

| 항목 | 목표 | 실측 |
|------|------|------|
| AI 비서 단문 (Fast-Path) | ≤0.81ms | 0.246ms (3.3배 초과 달성) |
| 문서 분석 A4 1p | ≤15ms | — |
| 증거 패키지 생성 | ≤1200ms | 1ms |
| OpenHash E2E | ≤3.09ms | — |
| PLSM 단일 노드 | 4,399 TPS | — |
| LPBFT L1 4노드 | ≤0.759ms | — |
