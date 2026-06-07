# Gopang webapp.html — 설계 명세 및 검증 보고서

> **문서 코드:** GOPANG-WEBAPP-SPEC-v3.0
> **작성일:** 2026년 06월 07일
> **작성:** AI City Inc. · 팀 주피터
> **대상 파일:** `webapp.html` + 분리 모듈 (SP-00 v10.0 적용본)
> **저장소:** `github.com/Openhash-Gopang/gopang`
> **이전 버전:** GOPANG-WEBAPP-SPEC-v2.0 (2026-06-07) — 단일 파일 구조

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-06-06 | 최초 작성 — SP-00 v9.0, _gwpMatch + runRouter 이중 구조 |
| v2.0 | 2026-06-07 | SP-00 v10.0 전면 재설계 — LLM 단일 판단 구조로 전환 |
| v3.0 | 2026-06-07 | webapp.html 모듈 분리 (221KB→23KB), 모바일 마이크 수정, SW gopang-v4, K-Market SP 동적 로드 |

---

## 1. 개요

`webapp.html`은 고팡(Gopang) AI 메신저 플랫폼의 핵심 진입점이다.
v3.0에서 단일 파일(221KB)을 **HTML 골격 + 4개 JS 모듈**로 분리하여
유지보수성과 로딩 효율을 대폭 개선했다.

### v2.0 대비 핵심 변경

| 항목 | v2.0 | v3.0 |
|---|---|---|
| webapp.html 크기 | 221KB / 5,536줄 | **23KB / 515줄 (89% 감소)** |
| JS 구조 | 단일 인라인 `<script>` | **4개 외부 모듈** |
| CSS | 인라인 `<style>` | **`gopang-style.css` 외부 파일** |
| SW 캐시 버전 | gopang-v3 | **gopang-v4** |
| 모바일 마이크 | 입력 필드 미반영 오류 | **dispatchEvent + isTrusted 수정** |
| K-Market SP | 하드코딩 | **GitHub raw URL 동적 로드** |

---

## 2. 파일 구조 (v3.0)

```
gopang/
├── webapp.html          (23KB)  — HTML 골격 + <script src> 로드만
├── gopang-app.js        (160KB) — 앱 코어 IIFE (위치·UI·AI·GWP·마이크·K-Law)
├── gopang-style.css     (21KB)  — 디자인 시스템 v5.0
├── gwp-registry.js              — 서비스 ID → URL 조회
├── sw.js                        — Service Worker (gopang-v4)
└── src/
    ├── pwa/gopang-pwa.js  (11KB) — PWA 설치·업데이트·배너
    └── auth/gopang-auth.js (11KB) — 인증 헬퍼 (MediaPipe·카메라·지문·시드·등록·복구)
```

### 2-1. 모듈 로드 순서 (webapp.html body 끝)

```html
<!-- GWP 레지스트리 (head에서 선로드) -->
<script src="/gwp-registry.js"></script>

<!-- 고팡 모듈 — DOM 완성 후 로드 (</body> 직전) -->
<script src="/src/pwa/gopang-pwa.js"></script>   <!-- IIFE 외부: PWA -->
<script src="/src/auth/gopang-auth.js"></script>  <!-- IIFE 외부: 인증 -->
<script src="/gopang-app.js"></script>             <!-- IIFE 전체: 앱 코어 -->
```

> **중요:** `gopang-app.js`는 `(async () => { ... })();` IIFE 전체를 포함한다.
> IIFE 내부에 `await`·`return`이 있으므로, `</body>` 직전에 로드하여 DOM이 완성된 후 실행해야 한다.
> `<head>`에서 로드하면 `document.getElementById()`가 `null`을 반환하는 오류가 발생한다.

### 2-2. IIFE 경계 설계

```
webapp.html JS 블록 원본 구조:

L1~L1737:  IIFE 외부 코드
  ├── PWA (Service Worker 등록·설치 배너)  → src/pwa/gopang-pwa.js
  └── 인증 헬퍼 (MediaPipe·카메라·지문)   → src/auth/gopang-auth.js

L1738~L5533:  (async () => { ... })();  IIFE 전체
  └── 앱 코어 전체                         → gopang-app.js
```

IIFE 내부 코드를 개별 파일로 분리하면 최상위 `await`·`return`이 노출되어
SyntaxError가 발생한다. 따라서 IIFE 전체를 `gopang-app.js` 단일 파일로 통합했다.

---

## 3. 모바일 마이크 수정 (v3.0)

### 3-1. 문제

안드로이드 크롬에서 마이크 음성 입력이 `msg-input` 필드에 반영되지 않는 오류.

**원인:** 모바일 안드로이드 크롬은 JavaScript로 `input.value`를 직접 주입해도
`input` 이벤트를 발생시키지 않는다. 따라서 `autoResize()`·`updateSendBtn()`이
호출되지 않고, `sendMessage()` 시점에 `value`가 비어있는 것처럼 처리된다.

### 3-2. 수정 내용 (3곳)

**Fix 1 — `recognition.onresult` (Web Speech API 경로)**

```javascript
// 수정 전
if (input) { input.value = t; autoResize(input); updateSendBtn(); }

// 수정 후
if (input && t) {
  input.value = t;
  // ★ 모바일: JS value 주입 시 input 이벤트 미발생 → 강제 발생
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // focus() 제거: 모바일 소프트 키보드 강제 팝업 방지
}
```

**Fix 2 — MediaRecorder STT 경로 (동일 패턴)**

```javascript
if (input) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
```

**Fix 3 — DOMContentLoaded input 리스너**

```javascript
// 수정 전
input.addEventListener('input', () => {
  autoResize(input); updateSendBtn();
  if (_micAutoSendTimer) { clearTimeout(_micAutoSendTimer); ... }
});

// 수정 후
input.addEventListener('input', (ev) => {
  autoResize(input); updateSendBtn();
  // ★ 마이크 dispatchEvent(isTrusted=false)는 자동전송 타이머 취소 안 함
  if (_micAutoSendTimer && ev.isTrusted) {
    clearTimeout(_micAutoSendTimer);
    _micAutoSendTimer = null;
  }
});
```

**`ev.isTrusted` 핵심 원리:**

| 이벤트 발생 주체 | `isTrusted` | 타이머 취소 |
|---|---|---|
| 사용자 직접 타이핑 | `true` | ✅ 취소 (자동전송 방지) |
| 마이크 `dispatchEvent` | `false` | ❌ 유지 → 1초 후 자동전송 |

### 3-3. 마이크 전체 흐름 (수정 후)

```
마이크 버튼 클릭
    → recognition.start() 또는 MediaRecorder 시작
    → 음성 인식 완료
    → input.value = transcript
    → dispatchEvent('input', bubbles:true)
          → autoResize(input)          ✅
          → updateSendBtn()            ✅ 전송 버튼 활성화
          → isTrusted=false → 타이머 유지 ✅
    → _micAutoSend() 호출
          → 1초 후 sendMessage()       ✅ 자동 전송
```

---

## 4. Service Worker (gopang-v4)

### 4-1. 버전 업

모듈 분리로 새 파일 경로가 추가됨에 따라 캐시 버전을 `gopang-v3` → `gopang-v4`로 업.
이전 사용자의 `gopang-v3` 캐시는 activate 단계에서 자동 삭제된다.

### 4-2. PRECACHE_URLS (v4)

```javascript
const PRECACHE_URLS = [
  '/', '/index.html', '/desktop.html', '/webapp.html',
  '/manifest.json', '/favicon.ico',
  '/gopang-style.css',
  '/gwp-registry.js',
  '/src/pwa/gopang-pwa.js',
  '/src/auth/gopang-auth.js',
  '/gopang-app.js',
  '/auth/gopang-sso.js',
  '/auth/subsystem-auth.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
```

---

## 5. K-Market SP 동적 로드

### 5-1. 배경

K-Market `webapp.html`의 시스템 프롬프트가 하드코딩되어 있어,
SP 갱신 시마다 webapp.html을 수정·배포해야 하는 문제가 있었다.

### 5-2. 해결 — GitHub raw URL 동적 로드

```javascript
// CFG 설정 (webapp.html 수정 불필요)
systemPromptURL: 'https://raw.githubusercontent.com/Openhash-Gopang/market/main/prompts/SP-KMARKET-v2_0.txt',
systemPrompt: null,          // 런타임에 loadSystemPrompt()로 채워짐
systemPromptFallback: '...',

// 동적 로드 함수
async function loadSystemPrompt() {
  if (CFG.systemPrompt) return CFG.systemPrompt; // 세션 캐시
  try {
    const r = await fetch(CFG.systemPromptURL + '?t=' + Date.now());
    if (r.ok) { CFG.systemPrompt = await r.text(); return CFG.systemPrompt; }
  } catch(e) {}
  CFG.systemPrompt = CFG.systemPromptFallback;
  return CFG.systemPrompt;
}

// callAI에서 사용
const sp = await loadSystemPrompt();
messages = [{ role:'system', content: sp + buildLocNote() }, ...history];
```

### 5-3. SP 갱신 절차 (v3.0~)

```
1. prompts/SP-KMARKET-v2_0.txt 수정 (또는 신규 버전 파일 추가)
2. git push origin main
3. → 다음 사용자 세션부터 자동 반영 (webapp 수정 불필요)
```

---

## 6. 아키텍처 (v3.0 — 기존 유지)

### 6-1. 사용자 입력 → LLM 판단 → 실행

```
sendMessage()
    └─ callAI(text, file)
           └─ SP-00 v10.0 LLM 스트리밍
                  └─ fullReply.match(/\[GWP:([\w-]+)\]/)
                         ├─ 태그 없음 → AI 응답 표시
                         └─ 태그 있음 → getService(id) → _gwpLaunch()
```

### 6-2. GWP 16개 하위 시스템

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

### 6-3. 하위 시스템 → 고팡 보고 (postMessage)

```javascript
// 작업 완료 보고
window.opener.postMessage({
  type: 'GWP_DONE',
  summary: '짜장면 1그릇 주문 완료',
  pdvData: {
    who:   '사용자 GUID',
    when:  new Date().toISOString(),
    where: '제주시 한림읍 금능리',
    what:  'K-Market 음식 주문',
    how:   'GDC 결제 7,000원',
    why:   '사용자 지시: "짜장면 한 그릇 시켜 줘"',
  }
}, 'https://gopang.net');
```

| 메시지 타입 | 동작 |
|---|---|
| `GWP_DONE` | 작업 완료 — summary 표시 + PDV 기록 |
| `GWP_MESSAGE` | 실시간 메시지 채팅창 전달 |
| `GWP_ERROR` | 오류 메시지 표시 |
| `GWP_CLOSE` | 서비스 자체 종료 요청 |

### 6-4. ctx 수신 (하위 시스템)

```javascript
const params = new URLSearchParams(location.search);
const ctxRaw = params.get('ctx') || '';
const ctxEnc = params.get('ctx_enc');
const ctx = ctxRaw
  ? (ctxEnc === 'b64'
      ? decodeURIComponent(escape(atob(ctxRaw)))
      : decodeURIComponent(ctxRaw))
  : null;
```

---

## 7. 검증 결과 (v3.0 추가 항목)

### 7-1. 모듈 분리 검증

| # | 항목 | 결과 |
|---|---|---|
| M-1 | 분리 파일 합산 == 원본 JS (131,121자 일치) | ✅ |
| M-2 | gopang-app.js IIFE 시작 `(async () => {` | ✅ |
| M-3 | gopang-app.js IIFE 끝 `})();` | ✅ |
| M-4 | 중괄호 균형 0 | ✅ |
| M-5 | script 태그 `</body>` 직전 배치 | ✅ |
| M-6 | SW gopang-v4 캐시 성공: 15, 실패: 0 | ✅ |

### 7-2. 모바일 마이크 검증

| # | 항목 | 결과 |
|---|---|---|
| Mic-1 | `dispatchEvent('input', bubbles:true)` 적용 | ✅ |
| Mic-2 | `focus()` 제거 — 소프트 키보드 팝업 방지 | ✅ |
| Mic-3 | `ev.isTrusted` 체크 — 자동전송 타이머 보호 | ✅ |
| Mic-4 | Web Speech API 경로 수정 | ✅ |
| Mic-5 | MediaRecorder STT 경로 수정 | ✅ |
| Mic-6 | 안드로이드 크롬 실기기 동작 확인 | ✅ |

### 7-3. K-Market 동적 SP 검증

| # | 항목 | 결과 |
|---|---|---|
| SP-1 | `loadSystemPrompt()` 함수 추가 | ✅ |
| SP-2 | GitHub raw URL fetch | ✅ |
| SP-3 | 세션 캐시 (2회 이상 호출 방지) | ✅ |
| SP-4 | 폴백 메시지 처리 | ✅ |
| SP-5 | SP-KMARKET-v2_0.txt 적용 확인 | ✅ |
| SP-6 | webapp 수정 없이 SP 갱신 가능 | ✅ |

### 7-4. 전체 집계

| 구분 | v2.0 | v3.0 |
|---|---|---|
| 총 검증 항목 | 45개 | **62개** |
| ✅ 구현 확인 | 43개 | **60개** |
| ❌ 미구현 | 0개 | 0개 |
| ℹ️ 참고 사항 | 2개 | 2개 |

---

## 8. 주요 함수 색인 (v3.0)

| 함수명 | 위치 | 역할 |
|---|---|---|
| `sendMessage()` | gopang-app.js | 사용자 입력 처리 진입점 |
| `callAI(text, file)` | gopang-app.js | SP-00 LLM 호출 + [GWP:id] 태그 감지 |
| `loadSystemPrompt()` | K-Market webapp.js | GitHub raw URL에서 SP 동적 로드 |
| `_gwpLaunch(svc, ctx)` | gopang-app.js | 새 탭으로 하위 시스템 실행 |
| `_gwpOnTabClose()` | gopang-app.js | 탭 닫힘 감지 → 고팡 복귀 |
| `_gwpClose(show)` | gopang-app.js | 강제 탭 종료 |
| `_recordPDV(record)` | gopang-app.js | localStorage + Supabase PDV 기록 |
| `_initLocation()` | gopang-app.js | GPS → IP 폴백 위치 초기화 |
| `_klawReview()` | gopang-app.js | K-Law 대화 내용 자동 감시 |
| `toggleMic()` | gopang-app.js | 마이크 토글 (Web Speech / MediaRecorder) |
| `getService(id)` | gwp-registry.js | 서비스 ID → URL·name·icon 조회 |
| ~~`_gwpMatch(text)`~~ | gopang-app.js | dead code (v2.0에서 미사용) |
| ~~`runRouter(text)`~~ | gopang-app.js | dead code (v2.0에서 미사용) |

---

## 9. 향후 개선 권고 (v3.0 갱신)

| 우선순위 | 항목 | 내용 |
|---|---|---|
| 높음 | dead code 제거 | `_gwpMatch()`, `runRouter()`, `_loadRouterPrompt()` 함수 정의 제거 |
| 높음 | gopang-auth.js 분리 완성 | `src/auth/gopang-auth.js` 내용 검증 및 테스트 |
| 중 | callAI PDV 기록 | 고팡 AI 직접 응답도 PDV에 기록 |
| 중 | 다른 하위 시스템 SP 동적 로드 적용 | K-Law, K-Health 등도 GitHub raw URL 방식으로 전환 |
| 낮음 | 서비스 URL 중앙화 | gwp-registry.js URL을 config.js로 통합 |

---

## 10. GWP 프로토콜 — 하위 시스템 구현 가이드

### 신규 하위 시스템 등록 절차 (v2.0~)

```
1. gwp-registry.js  — 서비스 항목 추가 (id, name, icon, url)
2. SP-00 § 2        — [GWP:새ID]  서비스명  — 담당 영역 한 줄 추가
3. SP 파일          — GitHub prompts/ 폴더에 SP 파일 추가
                      (동적 로드 방식 사용 권장)
```

### 하위 시스템 SP 동적 로드 표준 패턴

모든 하위 시스템은 아래 패턴을 사용하여 SP를 동적 로드하는 것을 권장한다.

```javascript
const SP_URL = 'https://raw.githubusercontent.com/Openhash-Gopang/{저장소}/main/prompts/{SP파일}.txt';

async function loadSystemPrompt() {
  if (CFG.systemPrompt) return CFG.systemPrompt;
  try {
    const r = await fetch(SP_URL + '?t=' + Date.now());
    if (r.ok) { CFG.systemPrompt = await r.text(); return CFG.systemPrompt; }
  } catch(e) { console.warn('[SP] 로드 실패:', e.message); }
  CFG.systemPrompt = CFG.systemPromptFallback;
  return CFG.systemPrompt;
}
```

---

*AI City Inc. · 팀 주피터 · gopang.net · github.com/Openhash-Gopang/gopang*
*DAWN: Democracy is All We Need · MIT License*
