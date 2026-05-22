# 새 플러그인 추가 가이드

> 총 소요: 약 2~4일 | **코어 변경: 0줄**

---

## 1. 절차 개요

```
1. _template/ 복사          → 5분
2. metadata 수정            → 10분
3. classifier.js 작성       → 1~2일 (법령 분류 규칙)
4. risk-rules.js 작성       → 반나절 (Fast-Path 트리거)
5. schema.js 수정           → 1시간 (도메인 특화 필드)
6. CHANGELOG.md 작성        → 10분
7. app.js에 register() 추가 → 1줄
8. 테스트 작성·실행         → 반나절
```

---

## 2. 디렉토리 생성

```powershell
# Windows
xcopy /E /I "src\domains\_template" "src\domains\k-market"
```

```bash
# Linux/Mac
cp -r src/domains/_template src/domains/k-market
```

---

## 3. 필수 수정 파일

### `index.js` — 플러그인 진입점

```javascript
import { PluginInterface } from '../../core/plugin-interface.js';
import { EventBus }        from '../../core/event-bus.js';
import { EVENTS }          from '../../core/constants.js';
import { KMarketClassifier } from './classifier.js';

export class KMarketPlugin extends PluginInterface {
  constructor() {
    super({
      name:    'k-market',
      version: '1.0.0',
      metadata: { icon: '🛒', label: 'K-Market', domain: 'commerce' },
    });
  }

  async init() {
    // S3 감지 시 이벤트 발행
    EventBus.on(EVENTS.AI_RESULT, (result) => {
      if (result.riskLevel === 'S3' &&
          result.legalFlags.some(f => f.startsWith('MKT'))) {
        EventBus.emit(EVENTS.MARKET_FRAUD_DETECTED, {
          msgId: result.msgId,
          flags: result.legalFlags,
        });
      }
    });
  }

  get classifier() { return KMarketClassifier; }
}
```

### `classifier.js` — 법령 분류기

```javascript
export const KMarketClassifier = {
  // Fast-Path: 즉시 S3 (명백한 사기 패턴)
  fastPath(text) {
    if (/피싱.*쇼핑|결제.*가로채/.test(text)) return 'S3';
    return null;
  },

  // 전체 분류
  classify(text) {
    const flags = [];
    if (/허위광고|과장광고/.test(text))    flags.push('MKT-1'); // 표시광고법
    if (/사기판매|환불거부/.test(text))    flags.push('MKT-2'); // 전자상거래법
    if (/다단계|불법.*유통/.test(text))    flags.push('MKT-3'); // 방문판매법
    return flags;
  },
};
```

### `schema.js` — 도메인 특화 필드

```javascript
export const KMarketSchema = {
  marketFlags:    [],   // MKT-1~n 플래그
  sellerRef:      null, // 판매자 ID
  productRef:     null, // 상품 참조
  transactionRef: null, // 거래 참조
};
```

---

## 4. app.js 등록 (1줄 추가)

```javascript
// src/app.js — 3단계 플러그인 등록 블록
await registry.register(new KLawPlugin());
await registry.register(new KHealthPlugin());
await registry.register(new KMarketPlugin());  // ← 이 줄만 추가
```

---

## 5. 테스트 작성

```javascript
// src/tests/domains/k-market.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('K-Market 플러그인', () => {
  it('MKT-1: 허위광고 탐지', async () => {
    // ...
  });
  it('다른 플러그인 영향 없음', async () => {
    // K-Law, K-Health 동작 확인
  });
});
```

---

## 6. 이벤트 추가 시 constants.js 수정

```javascript
// src/core/constants.js — EVENTS 객체에 추가
export const EVENTS = {
  // ... 기존 이벤트 ...
  MARKET_FRAUD_DETECTED: 'market:fraud_detected',  // ← 추가
};
```

> ⚠️ constants.js는 유일하게 수정이 허용되는 코어 파일입니다.  
> 다른 코어 파일(`event-bus.js`, `plugin-registry.js` 등)은 **절대 변경 금지**.

---

## 7. 검증 체크리스트

- [ ] `core/` 파일 변경 라인 수: constants.js 이벤트 추가 외 **0줄**
- [ ] 기존 플러그인(K-Law, K-Health) 테스트 전체 통과
- [ ] 새 플러그인 오류 주입 시 기존 플러그인 정상 동작
- [ ] hot-register 후 ShellUI 탭 자동 생성 확인
- [ ] CHANGELOG.md v1.0.0 작성 완료
