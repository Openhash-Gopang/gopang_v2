/**
 * test-harness.js — Phase 8 통합 테스트 공통 하네스
 * 실제 모듈 없이 전체 시스템 흐름을 검증하기 위한 모의(Mock) 레이어
 */

// ── EventBus ────────────────────────────────────────────────
export function makeEventBus() {
  const _h = {};
  const _log = [];
  return {
    init() {},
    on(e, fn)  { (_h[e] || (_h[e] = [])).push(fn); },
    off(e, fn) { if (_h[e]) _h[e] = _h[e].filter(h => h !== fn); },
    emit(e, d) {
      _log.push({ event: e, data: d, ts: Date.now() });
      (_h[e] || []).forEach(fn => { try { fn(d); } catch (err) { /* 격리 */ } });
    },
    emitted(e)    { return _log.filter(x => x.event === e); },
    emittedOnce(e){ return _log.find(x => x.event === e); },
    reset()       { Object.keys(_h).forEach(k => delete _h[k]); _log.length = 0; },
    _log,
  };
}

// ── PluginRegistry ───────────────────────────────────────────
export function makeRegistry(bus) {
  const _plugins = new Map();
  return {
    async init() {},
    async register(plugin) {
      if (_plugins.has(plugin.name)) throw new Error(`DUPLICATE: ${plugin.name}`);
      _plugins.set(plugin.name, plugin);
      bus.emit('plugin:registered', { plugin });
    },
    async update(name, newPlugin) {
      if (!_plugins.has(name)) throw new Error(`NOT_FOUND: ${name}`);
      _plugins.set(name, newPlugin);
      bus.emit('plugin:updated', { name, plugin: newPlugin });
    },
    get(name)  { return _plugins.get(name); },
    list()     { return [..._plugins.values()]; },
    has(name)  { return _plugins.has(name); },
    unregister(name) { _plugins.delete(name); },
  };
}

// ── keyManager (Ed25519 모의) ────────────────────────────────
export const MockKeyManager = {
  generateKeyPair() {
    const id = Math.random().toString(36).slice(2, 10);
    return { pubKey: `pub_${id}`, privKey: `priv_${id}` };
  },
  signMessage(msg, privKey) {
    return `sig::${privKey.slice(0,6)}::${msg.slice(0,8)}`;
  },
  verifySignature(msg, sig, pubKey) {
    return sig.startsWith('sig::');
  },
  generateTripleSignature(userSig, agentSig, openHashRef) {
    return { userSig, agentSig, openHashRef, ts: Date.now(), valid: true };
  },
};

// ── Vault (PDV 저장소 모의) ──────────────────────────────────
export function makeVault() {
  const _store = new Map();
  return {
    async init() {},
    async save(record) {
      const id = record.msgId || `msg_${Date.now()}`;
      _store.set(id, { ...record, msgId: id });
      return id;
    },
    async get(id)    { return _store.get(id) || null; },
    async delete(id) { _store.delete(id); },
    list()           { return [..._store.values()]; },
    size()           { return _store.size; },
  };
}

// ── OpenHash (해시체인 모의) ─────────────────────────────────
export const MockOpenHash = {
  _chain: [],
  async init() {},
  anchor(data) {
    const ref = `0x${Buffer.from(JSON.stringify(data)).toString('hex').slice(0, 16)}`;
    this._chain.push({ ref, data, ts: Date.now() });
    return ref;
  },
  verify(ref) {
    return this._chain.some(x => x.ref === ref);
  },
  selectLayer(msgId) {
    // PLSM 모의: msgId 첫 글자 코드 기반 L1~L5
    const code = msgId.charCodeAt(0) % 1000;
    if (code < 600) return 'L1';
    if (code < 800) return 'L2';
    if (code < 900) return 'L3';
    if (code < 960) return 'L4';
    return 'L5';
  },
};

// ── 법령 분류기 (K-Law 모의) ────────────────────────────────
export const MockKLawClassifier = {
  classify(text) {
    const flags = [];
    if (/보이스피싱|대포통장|대출사기/.test(text)) flags.push('CR-3');
    if (/임대차|보증금|계약서/.test(text))         flags.push('CV-2');
    if (/명의도용|신분증/.test(text))              flags.push('CR-1');
    if (/저작권|특허|상표/.test(text))             flags.push('LB-1');
    if (/하청|임금/.test(text))                    flags.push('CC-1');
    return flags;
  },
  fastPath(text) {
    if (/계좌.*보내|송금.*지금|긴급.*이체/.test(text)) return 'S3';
    return null;
  },
};

// ── 법령 분류기 (K-Health 모의) ─────────────────────────────
export const MockKHealthClassifier = {
  classify(text) {
    const flags = [];
    // MED-01: 무허가 의료행위 — 무허가 병원·의료, 무면허 수술·진료 포함
    if (/무허가.*(의료|병원)|무면허.*(진료|수술)/.test(text)) flags.push('MED-01');
    if (/처방전.*없이|처방전.*위조/.test(text)) flags.push('MED-02');
    if (/환자.*개인정보|의료.*유출/.test(text)) flags.push('MED-03');
    if (/불법.*의약품|마약류/.test(text))       flags.push('MED-05');
    return flags;
  },
  fastPath(text) {
    if (/무면허.*수술|무허가.*병원/.test(text)) return 'S3';
    return null;
  },
};

// ── AI 비서 파이프라인 (모의) ────────────────────────────────
export function makeAIPipeline(bus, registry, vault, openHash, keyManager) {
  return {
    async init() {},
    async process(input) {
      const { text, attachedDoc } = input;
      const startMs = Date.now();

      // Phase 0: 소통 객체 식별
      const isShort = text.length < 50;

      // Phase 1: Fast-Path 검사 (오류 격리 포함)
      const fastPathHits = new Set();
      for (const plugin of registry.list()) {
        try {
          const fp = plugin.classifier?.fastPath?.(text);
          if (fp === 'S3') fastPathHits.add(plugin.name);
        } catch { /* 오류 격리 */ }
      }
      const fastPathResult = fastPathHits.size > 0
        ? { riskLevel: 'S3', plugins: [...fastPathHits] }
        : null;

      // Phase 2~4: 전체 분류 (모든 플러그인 classify 실행, 오류 격리)
      const pluginResults = [];
      for (const plugin of registry.list()) {
        try {
          const flags = plugin.classifier?.classify?.(text) || [];
          let riskLevel = 'S0';
          if (flags.length > 0) riskLevel = 'S1';
          if (flags.some(f => /CR|MED-01|MED-02/.test(f))) riskLevel = 'S2';
          if (fastPathHits.has(plugin.name)) riskLevel = 'S3';
          pluginResults.push({ plugin: plugin.name, flags, riskLevel });
        } catch {
          // 오류 격리 — 다른 플러그인 계속 실행
        }
      }

      // Phase 3: 문서 분석
      const docAnalysis = attachedDoc
        ? { type: 'DOC-2', detected: true, analysisMs: Date.now() - startMs }
        : null;

      // Phase 5: 최종 등급
      const maxRisk = fastPathResult ? 'S3' :
        ['S0','S1','S2','S3'].reduce((max, lvl) =>
          pluginResults.some(r => r.riskLevel === lvl) ? lvl : max, 'S0');

      // Phase 6: PDV 기록 + OpenHash 앵커링
      const record = {
        msgId:        `msg_${Date.now()}`,
        content:      text,
        riskLevel:    maxRisk,
        legalFlags:   pluginResults.flatMap(r => r.flags),
        pluginResults,
        docAnalysis,
        phaseLog:     { processMs: Date.now() - startMs },
      };

      const msgId  = await vault.save(record);
      const hashRef = await openHash.anchor({ msgId, riskLevel: maxRisk });

      // 키 서명 (삼중 서명)
      const kp      = keyManager.generateKeyPair();
      const userSig = keyManager.signMessage(text, kp.privKey);
      const triple  = keyManager.generateTripleSignature(userSig, 'agent_sig', hashRef);

      const result = { ...record, msgId, openHashRef: hashRef, tripleSign: triple };

      // 이벤트 발행
      bus.emit('ai:result', result);
      if (maxRisk === 'S3') {
        bus.emit('legal:dispute', { msgId, riskLevel: 'S3', flags: record.legalFlags });
        bus.emit('gdc:escrow_created', { msgId });
      }
      if (pluginResults.some(r => r.flags.some(f => f.startsWith('MED')))) {
        bus.emit('health:medical_alert', { msgId, flags: record.legalFlags });
      }
      bus.emit('hash:anchored', { ref: hashRef });

      return result;
    },
  };
}

// ── 플러그인 팩토리 ──────────────────────────────────────────
export function makeKLawPlugin() {
  return {
    name: 'k-law',
    version: '1.0.0',
    metadata: { icon: '⚖️', label: 'K-Law', domain: 'legal' },
    classifier: MockKLawClassifier,
    async init() {},
  };
}

export function makeKHealthPlugin() {
  return {
    name: 'k-health',
    version: '1.0.0',
    metadata: { icon: '🏥', label: 'K-Health', domain: 'medical' },
    classifier: MockKHealthClassifier,
    async init() {},
  };
}

// ── 오류 주입 플러그인 ───────────────────────────────────────
export function makeFaultyPlugin(name) {
  return {
    name,
    version: '1.0.0',
    metadata: { icon: '💥', label: 'Faulty' },
    classifier: {
      classify() { throw new Error(`[${name}] 의도적 오류 주입`); },
      fastPath()  { throw new Error(`[${name}] fastPath 오류`); },
    },
    async init() {},
  };
}
