/**
 * phase8_integration.test.js — Phase 8 전체 통합 테스트
 * I-01~I-09: 시스템 수준 시나리오 검증
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEventBus, makeRegistry, makeVault,
  MockOpenHash, MockKeyManager, MockKLawClassifier,
  makeAIPipeline, makeKLawPlugin, makeKHealthPlugin, makeFaultyPlugin,
} from './test-harness.js';

// ── 공통 픽스처 ─────────────────────────────────────────────
let bus, registry, vault, pipeline;

function setup() {
  bus      = makeEventBus();
  registry = makeRegistry(bus);
  vault    = makeVault();
  MockOpenHash._chain = [];
  pipeline = makeAIPipeline(bus, registry, vault, MockOpenHash, MockKeyManager);
}

// ── I-01: 보이스피싱 — K-Law S3 + LEGAL_DISPUTE + GDC_ESCROW ─
describe('I-01: 보이스피싱 탐지 (K-Law)', async () => {
  it('S3 판정 + LEGAL_DISPUTE + GDC_ESCROW_CREATED 이벤트 발행', async () => {
    setup();
    await registry.register(makeKLawPlugin());

    const result = await pipeline.process({
      text: '지금 바로 계좌로 보내주세요. 보이스피싱 대포통장 긴급 이체.',
    });

    assert.equal(result.riskLevel, 'S3', 'S3 판정이어야 함');
    assert.ok(result.legalFlags.includes('CR-3'), 'CR-3 플래그 필요');

    const dispute = bus.emittedOnce('legal:dispute');
    assert.ok(dispute, 'LEGAL_DISPUTE 이벤트 발행 필요');

    const escrow = bus.emittedOnce('gdc:escrow_created');
    assert.ok(escrow, 'GDC_ESCROW_CREATED 이벤트 발행 필요');

    const anchored = bus.emittedOnce('hash:anchored');
    assert.ok(anchored?.data?.ref, 'OpenHash 앵커링 완료 필요');
  });
});

// ── I-02: 무허가 의료 — K-Health S3 + MEDICAL_ALERT ──────────
describe('I-02: 무허가 의료 문의 (K-Health)', async () => {
  it('MED-01 플래그 + MEDICAL_ALERT 이벤트 발행', async () => {
    setup();
    await registry.register(makeKHealthPlugin());

    const result = await pipeline.process({
      text: '무면허 수술을 해준다는 무허가 병원을 소개받았습니다.',
    });

    assert.ok(
      result.legalFlags.some(f => f.startsWith('MED')),
      'MED 플래그 필요'
    );

    const alert = bus.emittedOnce('health:medical_alert');
    assert.ok(alert, 'MEDICAL_ALERT 이벤트 발행 필요');
  });
});

// ── I-03: 금융 문서 첨부 + 임대차 위법 조항 ──────────────────
describe('I-03: 문서 첨부 + 임대차 위법 조항 (K-Law)', async () => {
  it('DOC-2 분석 완료 + CV-2 플래그', async () => {
    setup();
    await registry.register(makeKLawPlugin());

    const result = await pipeline.process({
      text: '임대차 보증금 계약서에 위법 조항이 있는 것 같습니다.',
      attachedDoc: { name: 'contract.pdf', type: 'DOC-2' },
    });

    assert.ok(result.legalFlags.includes('CV-2'), 'CV-2 플래그 필요');
    assert.ok(result.docAnalysis, '문서 분석 결과 필요');
    assert.equal(result.docAnalysis.type, 'DOC-2', 'DOC-2 분류이어야 함');
  });
});

// ── I-04: AI 간 협업 — 삼중 서명 생성 ───────────────────────
describe('I-04: AI 간 협업 + 삼중 서명', async () => {
  it('tripleSign 3요소(userSig·agentSig·openHashRef) 모두 존재', async () => {
    setup();
    await registry.register(makeKLawPlugin());

    const result = await pipeline.process({ text: '연말정산 서류를 자동으로 처리해주세요.' });

    assert.ok(result.tripleSign, '삼중 서명 필요');
    assert.ok(result.tripleSign.userSig,    'userSig 필요');
    assert.ok(result.tripleSign.agentSig,   'agentSig 필요');
    assert.ok(result.tripleSign.openHashRef,'openHashRef 필요');
    assert.equal(result.tripleSign.valid, true, 'valid=true이어야 함');
  });
});

// ── I-05: 메시지 위변조 시도 — OpenHash 검증 ─────────────────
describe('I-05: 메시지 위변조 탐지 (OpenHash)', async () => {
  it('저장된 ref는 검증 통과, 임의 ref는 실패', async () => {
    setup();
    await registry.register(makeKLawPlugin());

    const result = await pipeline.process({ text: '정상 메시지입니다.' });
    const ref = result.openHashRef;

    assert.ok(MockOpenHash.verify(ref),         '실제 ref는 검증 통과해야 함');
    assert.equal(MockOpenHash.verify('0xdeadbeef00'), false, '위조 ref는 검증 실패해야 함');
  });
});

// ── I-06: 가해자 PDV 삭제 시뮬 — 증거 패키지 완결 확인 ────────
describe('I-06: PDV 삭제 후 증거 패키지 완결', async () => {
  it('vault 삭제 후에도 tripleSign + openHashRef 유지', async () => {
    setup();
    await registry.register(makeKLawPlugin());

    const result = await pipeline.process({
      text: '보이스피싱 대포통장으로 긴급 이체 요청.',
    });
    const { msgId, tripleSign, openHashRef } = result;

    // 가해자가 PDV 삭제 시도
    await vault.delete(msgId);
    const deleted = await vault.get(msgId);
    assert.equal(deleted, null, 'vault에서 삭제되어야 함');

    // 증거 패키지 3요소는 result 객체에 자기완결로 보존
    assert.ok(tripleSign.userSig,    '삭제 후에도 userSig 보존');
    assert.ok(openHashRef,           'OpenHash ref 보존');
    assert.ok(MockOpenHash.verify(openHashRef), 'OpenHash 검증 통과');
  });
});

// ── I-07: K-Health 플러그인 충돌 주입 — K-Law 정상 동작 ───────
describe('I-07: 오류 격리 — Faulty 플러그인이 K-Law에 영향 없음', async () => {
  it('faulty 플러그인 오류에도 K-Law 결과 정상 반환', async () => {
    setup();
    await registry.register(makeKLawPlugin());
    await registry.register(makeFaultyPlugin('faulty-health'));

    const result = await pipeline.process({
      text: '보이스피싱 대포통장 사기',
    });

    // K-Law 결과는 정상
    const klawResult = result.pluginResults.find(r => r.plugin === 'k-law');
    assert.ok(klawResult, 'K-Law 결과 존재해야 함');
    assert.ok(klawResult.flags.includes('CR-3'), 'K-Law CR-3 플래그 정상');

    // 전체 파이프라인은 완료됨 (faulty가 예외를 던졌어도)
    assert.ok(result.openHashRef, 'OpenHash 앵커링 완료');
  });
});

// ── I-08: K-Law v1.1.0 hot-update — 다른 플러그인 무영향 ──────
describe('I-08: K-Law hot-update v1.0.0 → v1.1.0', async () => {
  it('K-Law 업데이트 후 K-Health 동작 정상 유지', async () => {
    setup();
    await registry.register(makeKLawPlugin());
    await registry.register(makeKHealthPlugin());

    // K-Law v1.1.0으로 업데이트
    const updatedKLaw = {
      ...makeKLawPlugin(),
      version: '1.1.0',
      classifier: {
        ...MockKLawClassifier,
        classify(text) {
          const flags = MockKLawClassifier.classify(text);
          if (/스팸/.test(text)) flags.push('CR-NEW');
          return flags;
        },
      },
    };
    await registry.update('k-law', updatedKLaw);
    assert.equal(registry.get('k-law').version, '1.1.0', '버전 갱신 확인');

    // K-Health는 영향 없음
    const result = await pipeline.process({
      text: '무면허 수술 무허가 병원 소개',
    });
    const healthResult = result.pluginResults.find(r => r.plugin === 'k-health');
    assert.ok(healthResult, 'K-Health 결과 존재해야 함');
    assert.ok(
      healthResult.flags.some(f => f.startsWith('MED')),
      'K-Health MED 플래그 정상'
    );
  });
});

// ── I-09: 새 플러그인 hot-register — 탭 자동 생성 ─────────────
describe('I-09: 새 플러그인 hot-register (K-Market 시뮬)', async () => {
  it('앱 재시작 없이 새 플러그인 등록 + PLUGIN_REGISTERED 이벤트', async () => {
    setup();
    await registry.register(makeKLawPlugin());

    // K-Market 플러그인 동적 등록
    const KMarketPlugin = {
      name: 'k-market',
      version: '1.0.0',
      metadata: { icon: '🛒', label: 'K-Market', domain: 'commerce' },
      classifier: {
        classify: (text) => /허위광고|사기판매/.test(text) ? ['MKT-1'] : [],
        fastPath: () => null,
      },
      async init() {},
    };

    let registered = false;
    bus.on('plugin:registered', ({ plugin }) => {
      if (plugin.name === 'k-market') registered = true;
    });

    await registry.register(KMarketPlugin);

    assert.ok(registered,                 'PLUGIN_REGISTERED 이벤트 발행 확인');
    assert.ok(registry.has('k-market'),   'registry에 k-market 등록 확인');
    assert.equal(registry.list().length, 2, '기존 K-Law + K-Market = 2개');

    // 새 플러그인으로 즉시 처리 가능
    const result = await pipeline.process({ text: '허위광고 사기판매 신고합니다.' });
    const mktResult = result.pluginResults.find(r => r.plugin === 'k-market');
    assert.ok(mktResult,                         'K-Market 결과 존재');
    assert.ok(mktResult.flags.includes('MKT-1'), 'MKT-1 플래그 정상');
  });
});
