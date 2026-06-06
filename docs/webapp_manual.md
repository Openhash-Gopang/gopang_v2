# Gopang webapp.html — 설계 명세 및 검증 보고서

> **문서 코드:** GOPANG-WEBAPP-SPEC-v2.0
> **작성일:** 2026년 06월 07일
> **작성:** AI City Inc. · 팀 주피터
> **대상 파일:** `webapp.html` (SP-00 v10.0 적용본)
> **저장소:** `github.com/Openhash-Gopang/gopang`
> **이전 버전:** GOPANG-WEBAPP-SPEC-v1.0 (2026-06-06) — SP-00 v9.0 기준

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-06-06 | 최초 작성 — SP-00 v9.0, _gwpMatch + runRouter 이중 구조 |
| v2.0 | 2026-06-07 | SP-00 v10.0 전면 재설계 — LLM 단일 판단 구조로 전환 |

---

## 1. 개요

`webapp.html`은 고팡(Gopang) AI 메신저 플랫폼의 핵심 진입점이다.
사용자의 모든 질문과 지시를 수신하여, 아래 두 경로 중 하나로 처리한다.

```
사용자 입력
    │
    ▼
┌─────────────────────────────────────┐
│  sendMessage (고팡 webapp)          │
│  callAI() — SP-00 v10.0 LLM 판단   │
└─────────────────────────────────────┘
    │                        │
    ▼                        ▼
[직접 처리]          [하위 시스템 호출]
AI 응답 스트리밍      [GWP:id] 태그 감지
    │                → getService(id)
    ▼                → _gwpLaunch()
응답 출력                    │
                             ▼
                      새 탭에서 서비스 실행
                             │
                             ▼
                      용무 완료 → GWP_DONE
                             │
                             ▼
                      보고서 수신 → PDV 기록
                             │
                             ▼
                      고팡 탭 자동 복귀
```

### v1.0 대비 핵심 구조 변경

| 항목 | v1.0 (SP-00 v9.0) | v2.0 (SP-00 v10.0) |
|---|---|---|
| 판단 주체 | 코드(_gwpMatch) + LLM(runRouter) | LLM(SP-00) 단독 |
| LLM 호출 횟수 | 매 턴 최대 2회 | 1회 |
| 하위 시스템 인식 방법 | gwp-registry.js triggers 키워드 | SP-00 § 2 서비스 목록 |
| 라우팅 신호 | _gwpMatch 반환값, runRouter JSON | [GWP:서비스ID] 태그 |
| 유지 파일 수 | 4개 (gwp-registry, DOMAIN_DETECT, ROUTER_GWP_MAP, SP-00-ROUTER) | 2개 (gwp-registry URL만, SP-00) |
| gwp-registry.js | 407줄 (triggers 포함) | 242줄 (URL 조회만) |

---

## 2. 핵심 설계 원칙

### 2-1. 단일 진입점
모든 사용자 입력은 `sendMessage()` 함수 하나를 통해 처리된다.
`sendMessage()`는 판단 없이 즉시 `callAI()`를 호출한다.
**판단은 LLM(SP-00)이 전담한다.**

### 2-2. LLM 단일 판단 (SP-00 v10.0)
SP-00에 16개 하위 시스템 목록이 내장되어 있다.
LLM이 사용자 입력을 받아 스스로 결정한다:
- **직접 처리:** 일반 질문·계산·검색 → 텍스트 응답 스트리밍
- **하위 시스템 호출:** 응답 첫 줄에 `[GWP:서비스ID]` 태그 출력

코드는 태그를 감지하여 `window.open()`을 실행한다. 코드가 의미를 해석하지 않는다.

### 2-3. GWP (Gopang Widget Protocol) v2.0
하위 시스템은 **iframe이 아닌 새 탭**으로 실행된다.
iframe 방식의 JS 전역 변수 충돌, SyntaxError, CFG 미초기화 문제를 원천 해결한다.

### 2-4. PDV 이중 저장
모든 서비스 이력은 **로컬(localStorage)** 과 **Supabase(클라우드 백업)** 에 동시 저장된다.
네트워크 오류 시에도 로컬 저장은 보장된다.

### 2-5. 보안 원칙
- postMessage 수신 시 `origin` 검증 필수
- 사용자 신원: IPv6 기반 PDV GUID 전달
- ctx 파라미터: Base64 인코딩으로 한국어 안전 전달
- Supabase 인증: apikey 헤더 포함

---

## 3. 아키텍처 상세 설계

### 3-1. 사용자 입력 → LLM 판단 → 실행

**담당 함수:** `sendMessage()` → `callAI()`

사용자가 메시지를 전송하면 즉시 `callAI()`로 진입한다.
LLM(SP-00 v10.0)이 응답을 생성하고, 스트리밍 완료 후 코드가 태그를 감지한다.

```
sendMessage()
    │
    └─ text 있음 + aiActive
           │
           ▼
       callAI(text, file)
           │
           ▼
       SP-00 v10.0 LLM 스트리밍
           │
           ▼ (완료 후)
       fullReply.match(/\[GWP:([\w-]+)\]/)
           │
    ┌──────┴──────────┐
    │ 태그 없음       │ 태그 있음
    ▼                 ▼
AI 응답 표시     getService(svcId)
                      │
                      ▼
                 _gwpLaunch(svcDef, text)
```

**SP-00 § 2 — 16개 하위 시스템 (LLM 내장):**

| 태그 | 서비스 | 담당 영역 |
|---|---|---|
| `[GWP:kemergency]` | K-Emergency | 긴급·응급·119·화재·구조·재난 |
| `[GWP:klaw]` | K-Law | 법률·소송·계약서·판결·고소 |
| `[GWP:kpolice]` | K-Police | 경찰·범죄신고·폭행·스토킹 |
| `[GWP:ksecurity]` | K-Security | 해킹·랜섬웨어·사이버보안 |
| `[GWP:khealth]` | K-Health | 병원·증상·처방·진단·의료 |
| `[GWP:kedu]` | K-School | 교육·학습·입시·논문·자격증 |
| `[GWP:kgdc]` | GDC | GDC 잔액·이체·환전·대출 |
| `[GWP:kfinance]` | K-Stock | 주식·투자·ETF·자산관리 |
| `[GWP:kinsurance]` | K-Insurance | 보험·보상·청구·실손 |
| `[GWP:ktax]` | K-Tax | 세금·세무·납부·환급·절세 |
| `[GWP:kcommerce]` | K-Market | 주문·배달·음식·쇼핑·예약 |
| `[GWP:ktransport]` | K-Traffic | 교통·버스·지하철·택시·길찾기 |
| `[GWP:klogistics]` | K-Logistics | 택배·배송·물류·운송·추적 |
| `[GWP:fiil-kcleaner]` | K-Cleaner | 쓰레기·환경오염·불법투기·신고 |
| `[GWP:kgov]` | K-Gov | 민원·등본·허가·면허·행정심판 |
| `[GWP:kdemocracy]` | K-Democracy | 투표·안건·청원·고팡 의회 |

---

### 3-2. [GWP] 태그 감지 → 하위 시스템 실행

**담당 코드:** `callAI()` 스트리밍 완료 후 태그 감지 블록

```
스트리밍 완료 (fullReply 확정)
    │
    ▼
fullReply.match(/\[GWP:([\w-]+)\]/)
    │
    ├─ 태그 없음 → 그대로 표시
    │
    └─ 태그 있음 (예: [GWP:kcommerce])
           │
           ▼
       getService('kcommerce')        ← gwp-registry.js URL 조회
           │
           ▼
       버블에서 [GWP:...] 태그 제거 후 렌더링
           │
           ▼
       _gwpLaunch(svcDef, userText)   ← 새 탭 실행
```

**LLM 응답 예시:**
```
사용자: "짜장면 한 그릇 시켜 줘"
LLM:   "[GWP:kcommerce] K-Market에서 주문을 도와드립니다."

→ 버블 표시: "K-Market에서 주문을 도와드립니다."
→ market.gopang.net 새 탭 오픈
```

---

### 3-3. 하위 시스템 호출 — 새 탭 방식

**담당 함수:** `_gwpLaunch(service, context)`

```
_gwpLaunch 실행 흐름:

1. ctx를 Base64 인코딩
   btoa(unescape(encodeURIComponent(context)))

2. URL 파라미터 구성
   ?gwp=1
   &token={사용자 GUID}
   &origin={고팡 origin}
   &ctx={Base64 인코딩 지시}
   &ctx_enc=b64

3. window.open(svcUrl, '_blank') 새 탭 실행

4. 팝업 차단 시 → 링크 버블로 안내

5. setInterval 200ms 폴링 시작
   _gwpTab.closed 감지 대기
```

**탭 닫힘 → 고팡 복귀:**

```
_gwpOnTabClose():
  clearInterval(_gwpTabTimer)
  _gwpActive = false
  _gwpService = null
  window.focus()            ← 고팡 탭 포커스 복귀
  appendBubble('ai', '✅ 복귀 메시지')
```

---

### 3-4. 하위 시스템 → 고팡 보고서 수신

**수신 방식:** `window.addEventListener('message', handler)`
**보안:** `e.origin !== svcOrigin` 검증 후 처리

| 메시지 타입 | 동작 |
|---|---|
| `GWP_DONE` | 작업 완료 — summary 표시 + pdvData PDV 기록 |
| `GWP_MESSAGE` | 서비스 → 고팡 채팅창 실시간 메시지 전달 |
| `GWP_ERROR` | 오류 메시지 표시 |
| `GWP_CLOSE` | 서비스 자체 종료 요청 |

**`GWP_DONE` pdvData 구조 (6하원칙):**

```json
{
  "summary": "짜장면 1그릇 주문 완료",
  "pdvData": {
    "who":   "사용자 GUID",
    "when":  "2026-06-07T10:30:00Z",
    "where": "제주시 한림읍 금능리",
    "what":  "K-Market 짜장면 주문",
    "how":   "GDC 결제 7,000원",
    "why":   "사용자 지시"
  }
}
```

---

### 3-5. PDV 이중 저장

**담당 함수:** `_recordPDV(record)`

```
_recordPDV 실행 흐름:

① 로컬 저장 (즉시, 항상 성공)
   localStorage 'gopang_pdv_log'
   최대 1,000건 순환 관리

② Supabase 저장 (비동기, 오류 시 catch)
   POST /rest/v1/pdv_log
   Authorization: apikey {_SUPABASE_KEY}

   저장 필드:
   user_guid    사용자 PDV GUID
   who_name     사용자 식별명 (마스킹)
   location     GPS 위치 또는 IP 위치
   record_type  서비스 유형
   summary      작업 요약
   how          처리 방법
   why          처리 이유
   service_id   하위 시스템 ID
   payload      전체 record JSON
   created_at   DB 기본값 자동 삽입 (when)
```

**호출 시점:**

| 호출 위치 | 조건 |
|---|---|
| `GWP_DONE` 수신 시 | 하위 시스템 작업 완료 보고 수신 즉시 |
| 세션 저장 (`callAI`) | 고팡 AI 직접 응답 시 세션 단위 저장 |

---

### 3-6. 고팡 AI 직접 처리

**담당 함수:** `callAI(text, file)`

| 항목 | 내용 |
|---|---|
| AI 엔진 | DeepSeek V4 Flash (기본) / Pro (K-Law·K-Health 전문 처리 시) |
| 응답 방식 | SSE 스트리밍 실시간 렌더링 |
| 히스토리 | `history[]` 배열 유지 (멀티턴 대화) |
| 자동 감시 | K-Law 모니터 (`_klawReview`) 3초 후 트리거 |
| 오류 처리 | 402 크레딧 부족 시 BYOK 안내 메시지 |

---

### 3-7. gwp-registry.js 역할 변경 (v2.0)

v1.0에서 gwp-registry.js는 triggers 키워드 배열을 포함하여 1차 매칭을 수행했다.
v2.0에서는 **서비스 ID → URL 조회 전용**으로 축소되었다.

| 기능 | v1.0 | v2.0 |
|---|---|---|
| triggers 키워드 매칭 | ✅ (16개 서비스 × 평균 15개 트리거) | ❌ 제거 |
| matchService() 스코어링 | ✅ | ❌ getService() 래퍼로 단순화 |
| getService(id) URL 조회 | ✅ | ✅ 유지 |
| 파일 크기 | 407줄 | 242줄 |

LLM이 service_id를 [GWP:id] 태그로 직접 명시하므로, 코드는 `getService(id)`로 URL만 조회하면 된다.

---

### 3-8. GWP v1.0 vs v2.0 비교

| 항목 | v1.0 (iframe) | v2.0 (새 탭) |
|---|---|---|
| 실행 방식 | iframe DOM 삽입 | `window.open()` |
| JS 전역 충돌 | 발생 (CFG, _USER 등) | 없음 |
| SyntaxError | ctx 한국어 시 발생 | 없음 (Base64 인코딩) |
| CSS 충돌 | 발생 | 없음 |
| 복귀 방식 | GWP 복귀 버튼 | 탭 닫힘 자동 감지 |
| postMessage | 필수 (입력 전달) | 보고서 수신만 |
| 팝업 차단 | 해당 없음 | 링크 버블 안내 |
| 코드 복잡도 | 높음 | 낮음 |

---

## 4. SP-00 v9.0 → v10.0 설계 변경 상세

### 4-1. 변경 배경

v9.0의 구조적 문제:

1. **판단이 코드와 LLM에 분산** — `_gwpMatch()`(코드)와 `runRouter()`(LLM)가 중복 판단하여 LLM이 2회 호출됨
2. **4개 파일 불일치** — gwp-registry triggers, DOMAIN_DETECT 정규식, ROUTER_GWP_MAP, SP-00-ROUTER가 각각 관리되어 동기화 오류 반복
3. **runRouter 빈 응답 버그** — deepseek-v4-flash가 `{}` 반환 시 category=undefined로 라우팅 실패, 사용자에게 침묵
4. **ECO 카테고리 오라우팅** — K-Insurance·K-Tax가 ECO로 분류되어 K-Stock으로 잘못 열림
5. **SP-00에 하위 시스템 목록 없음** — LLM이 어떤 서비스가 있는지 모른 채 호출됨

### 4-2. v10.0 해결 방식

| 문제 | 해결 |
|---|---|
| LLM 2회 호출 | callAI 단일 호출로 통합 |
| 4개 파일 불일치 | SP-00 § 2에 16개 서비스 통합, 나머지 제거 |
| runRouter 빈 응답 버그 | runRouter 자체 제거 |
| ECO 오라우팅 | LLM이 service_id를 직접 명시 → getService(id) 조회 |
| SP-00에 목록 없음 | § 2에 16개 서비스·담당 영역 명시 |

### 4-3. 제거된 코드 요소

| 요소 | 위치 | 비고 |
|---|---|---|
| `_gwpMatch()` 실행 | sendMessage() | 함수 정의는 잔류 (dead code — 향후 제거 예정) |
| `runRouter()` 실행 | sendMessage() | 함수 정의는 잔류 (dead code — 향후 제거 예정) |
| `ROUTER_GWP_MAP` | sendMessage() | 완전 제거 |
| `ROUTER_TO_EXPERT` | callAI() | 완전 제거 |
| `routerCode` 판단 | callAI() | 완전 제거 |
| `precomputedRouterResult` | callAI() 시그니처 | 완전 제거 |
| gwp-registry triggers 배열 | gwp-registry.js | 16개 전량 제거 |
| matchService() 스코어링 | gwp-registry.js | getService() 래퍼로 대체 |

> **참고:** `_gwpMatch()`, `runRouter()`, `_loadRouterPrompt()` 함수 정의가 webapp.html에 잔류하나 호출되지 않는 dead code다. 다음 버전에서 제거 예정.

---

## 5. 검증 테스트 결과

### 5-1. 테스트 환경

| 항목 | 내용 |
|---|---|
| 검증 도구 | 코드 정적 분석 + 시뮬레이션 |
| 검증 대상 | `webapp.html` (SP-00 v10.0 적용본) |
| 테스트 항목 | 총 45개 (7개 카테고리) |
| 검증 일시 | 2026년 06월 07일 |

---

### 5-2. 테스트 결과 상세

#### 【1】 사용자 입력 → LLM 판단 → 실행

| # | 항목 | 결과 |
|---|---|---|
| 1-1 | `sendMessage` 함수 존재 | ✅ |
| 1-2 | text 있음 + aiActive → `callAI()` 직행 | ✅ |
| 1-3 | `_gwpMatch()` / `runRouter()` 미호출 (제거) | ✅ |
| 1-4 | SP-00 § 2에 16개 서비스 목록 내장 | ✅ |
| 1-5 | LLM이 [GWP:id] 태그 출력 규칙 명시 (§ 3) | ✅ |
| 1-6 | GWP_REGISTRY null 방어 (`typeof getService`) | ✅ |

#### 【2】 [GWP] 태그 감지 → 하위 시스템 실행

| # | 항목 | 결과 |
|---|---|---|
| 2-1 | 스트리밍 완료 후 `fullReply.match(/\[GWP:...\]/)` | ✅ |
| 2-2 | `getService(svcId)` — gwp-registry.js URL 조회 | ✅ |
| 2-3 | 버블에서 [GWP:...] 태그 제거 후 렌더링 | ✅ |
| 2-4 | `_gwpLaunch(svcDef, userText)` 새 탭 실행 | ✅ |
| 2-5 | getService 실패(알 수 없는 ID) 시 경고 로그 | ✅ |

#### 【3】 하위 시스템 → 새 탭 호출

| # | 항목 | 결과 |
|---|---|---|
| 3-1 | `window.open` 새 탭 실행 | ✅ |
| 3-2 | 사용자 token 파라미터 전달 | ✅ |
| 3-3 | 지시 ctx Base64 인코딩 | ✅ |
| 3-4 | 팝업 차단 시 링크 버블 안내 | ✅ |
| 3-5 | 탭 닫힘 200ms 폴링 감지 | ✅ |
| 3-6 | 탭 닫힘 → `_gwpOnTabClose` 호출 | ✅ |
| 3-7 | 고팡 `window.focus()` 복귀 | ✅ |

#### 【4】 하위 시스템 → 고팡 보고서 수신

| # | 항목 | 결과 |
|---|---|---|
| 4-1 | `postMessage` 수신 리스너 | ✅ |
| 4-2 | origin 검증 (보안) | ✅ |
| 4-3 | GWP_DONE 수신 + summary 표시 | ✅ |
| 4-4 | GWP_DONE pdvData 6하원칙 수신 | ✅ |
| 4-5 | GWP_MESSAGE 실시간 메시지 | ✅ |
| 4-6 | GWP_ERROR 오류 처리 | ✅ |
| 4-7 | GWP_CLOSE 자체 종료 요청 | ✅ |

#### 【5】 PDV 기록 — localStorage + Supabase 이중 저장

| # | 항목 | 결과 | 비고 |
|---|---|---|---|
| 5-1 | `_recordPDV` 함수 존재 | ✅ | |
| 5-2 | localStorage 저장 (gopang_pdv_log) | ✅ | |
| 5-3 | 로컬 최대 1,000건 순환 관리 | ✅ | |
| 5-4 | Supabase pdv_log POST | ✅ | |
| 5-5 | Supabase apikey 인증 | ✅ | |
| 5-6 | 6하원칙 who/where/what/how/why | ✅ | |
| 5-7 | 6하원칙 when | ℹ️ | DB `created_at` 기본값 사용 (설계 선택) |
| 5-8 | GWP_DONE → `_recordPDV` 호출 | ✅ | |
| 5-9 | Supabase 오류 처리 (catch) | ✅ | |

#### 【6】 callAI 직접 AI 처리

| # | 항목 | 결과 | 비고 |
|---|---|---|---|
| 6-1 | `callAI(userText, imageFile)` 시그니처 | ✅ | precomputedRouterResult 제거됨 |
| 6-2 | SSE 스트리밍 응답 | ✅ | |
| 6-3 | 대화 히스토리 유지 | ✅ | |
| 6-4 | K-Law 대화 자동 감시 | ✅ | |
| 6-5 | callAI 응답 PDV 자동 기록 | ℹ️ | 세션 저장만 됨 (정책 결정 사항) |
| 6-6 | JUS·MED 전문 처리 시 V4 Pro 자동 전환 | ✅ | |

#### 【7】 전체 흐름 End-to-End 연결

| # | 항목 | 결과 |
|---|---|---|
| 7-1 | `sendMessage` → `callAI` 직행 연결 | ✅ |
| 7-2 | `callAI` → `[GWP:id]` 감지 → `getService` 연결 | ✅ |
| 7-3 | `getService` → `_gwpLaunch` 연결 | ✅ |
| 7-4 | `GWP_DONE` → `_recordPDV` 연결 | ✅ |
| 7-5 | postMessage origin 검증 유지 | ✅ |

---

### 5-3. 최종 집계

| 구분 | 수치 |
|---|---|
| 총 검증 항목 | **45개** |
| ✅ 구현 확인 | **43개** |
| ❌ 미구현 | **0개** |
| ℹ️ 참고 사항 | **2개** |

---

## 6. 참고 사항 (버그 아님)

### 6-1. PDV `when` 필드

Supabase DB의 `created_at` 컬럼 기본값(`NOW()`)을 활용한다.
별도 `when` 필드를 POST 하지 않아도 삽입 시각이 자동 기록되므로 정상 설계다.

### 6-2. callAI 직접 응답 PDV 기록

현재 고팡 AI가 직접 답변한 내용은 세션(`history[]`)에만 저장된다.
하위 시스템 작업 이력과 달리, 일상 대화 전체를 PDV에 영구 기록할지는
**정책 결정** 사항이다. 기록이 필요한 경우 `callAI` 완료 후
`_recordPDV({ type: 'chat', summary: fullReply })` 호출을 추가하면 된다.

---

## 7. 향후 개선 권고

| 우선순위 | 항목 | 내용 |
|---|---|---|
| 높음 | dead code 제거 | `_gwpMatch()`, `runRouter()`, `_loadRouterPrompt()` 함수 정의 및 SP-00-ROUTER 프리로드 블록 제거 |
| 중 | callAI PDV 기록 | 고팡 AI 직접 응답도 PDV에 기록 |
| 중 | GWP_REGISTRY 방어 강화 | `gwp-registry.js` 로드 실패 시 getService() null 반환 처리 보강 |
| 낮음 | 서비스 URL 중앙화 | gwp-registry.js URL을 config.js로 통합 |

---

## 8. 주요 함수 색인

| 함수명 | 위치 | 역할 |
|---|---|---|
| `sendMessage()` | webapp.html | 사용자 입력 처리 진입점 — callAI() 직행 |
| `callAI(text, file)` | webapp.html | SP-00 LLM 호출 + [GWP:id] 태그 감지 |
| `_gwpLaunch(svc, ctx)` | webapp.html | 새 탭으로 하위 시스템 실행 |
| `_gwpOnTabClose()` | webapp.html | 탭 닫힘 감지 → 고팡 복귀 |
| `_gwpClose(show)` | webapp.html | 강제 탭 종료 |
| `_recordPDV(record)` | webapp.html | localStorage + Supabase PDV 기록 |
| `_initLocation()` | webapp.html | GPS → IP 폴백 위치 초기화 |
| `_klawReview()` | webapp.html | K-Law 대화 내용 자동 감시 |
| `getService(id)` | gwp-registry.js | 서비스 ID → URL·name·icon 조회 |
| ~~`_gwpMatch(text)`~~ | webapp.html | ~~키워드 매칭~~ dead code (v2.0에서 미사용) |
| ~~`runRouter(text)`~~ | webapp.html | ~~라우터 LLM 분류~~ dead code (v2.0에서 미사용) |
| ~~`_loadRouterPrompt()`~~ | webapp.html | ~~SP-00-ROUTER GitHub fetch~~ dead code (v2.0에서 미사용) |

---

## 9. GWP 프로토콜 — 하위 시스템 구현 가이드

하위 시스템(K-Market, K-Law 등)이 고팡에 보고서를 전송하려면
`window.opener.postMessage()`를 사용한다.

### 작업 완료 보고 (GWP_DONE)

```javascript
window.opener.postMessage({
  type: 'GWP_DONE',
  summary: '짜장면 1그릇 주문 완료 — 금능반점',
  pdvData: {
    who:   '사용자 GUID 또는 식별명',
    when:  new Date().toISOString(),
    where: '제주시 한림읍 금능리',
    what:  'K-Market 음식 주문',
    how:   'GDC 결제 7,000원',
    why:   '사용자 지시: "짜장면 한 그릇 시켜 줘"',
    data:  { orderId: 'ORD-20260607-001', items: ['짜장면'] }
  }
}, 'https://gopang.net');
```

### 실시간 메시지 전송 (GWP_MESSAGE)

```javascript
window.opener.postMessage({
  type: 'GWP_MESSAGE',
  role: 'ai',
  text: '주문이 접수됐습니다. 배달 예정 시간: 30분'
}, 'https://gopang.net');
```

### ctx(지시) 수신 및 복원

```javascript
const params = new URLSearchParams(location.search);
const ctxRaw = params.get('ctx') || '';
const ctxEnc = params.get('ctx_enc');

const ctx = ctxRaw
  ? (ctxEnc === 'b64'
      ? decodeURIComponent(escape(atob(ctxRaw)))
      : decodeURIComponent(ctxRaw))
  : null;

// ctx: "짜장면 한 그릇 시켜 줘" (원본 사용자 지시)
```

### 신규 하위 시스템 등록 절차 (v2.0 기준)

신규 서비스 추가 시 두 파일을 동시에 수정한다.

1. **`gwp-registry.js`** — 서비스 항목 추가 (id, name, icon, url, category, description)
2. **`SP-00` § 2** — `[GWP:새서비스ID]  서비스명  — 담당 영역 키워드` 한 줄 추가

v1.0의 4개 파일 동시 수정(gwp-registry triggers, DOMAIN_DETECT, ROUTER_GWP_MAP, SP-00-ROUTER)에서 **2개 파일로 축소**됐다.

---

*AI City Inc. · 팀 주피터 · gopang.net · github.com/Openhash-Gopang/gopang*
*DAWN: Democracy is All We Need · MIT License*
