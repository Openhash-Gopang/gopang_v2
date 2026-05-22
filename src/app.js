/**
 * app.js — 고팡 v2 부트스트랩 진입점 v3
 *
 * BUG-011 수정: 실제 repo export 이름과 완전히 일치하도록 재작성
 *
 * 확인된 실제 export 패턴:
 *   core/plugin-registry.js  → { registry }           싱글톤, init() 있음
 *   core/event-bus.js        → { EventBus, EVENTS }
 *   ai-secretary/pipeline.js → { runPipeline }         함수, init() 없음
 *   domains/k-law/index.js   → export default KLawPlugin
 *   domains/k-health/index.js→ export default KHealthPlugin
 *   pdv/vault.js             → { storeMessage, ... }  개별 함수, init() 없음
 *   openhash/hashChain.js    → { anchor, getEntry, ...} 개별 함수, init() 없음
 *   network/layerClient.js   → { submitToLayer, ... }  개별 함수, init() 없음
 *   gdc/tokenomics.js        → { calcInflationRate, burn, ...} 개별 함수, init() 없음
 *   privacy/mixnet.js        → { registerMixnode, ... } 개별 함수, init() 없음
 */

import { registry }            from './core/plugin-registry.js'
import { EventBus, EVENTS }    from './core/event-bus.js'
import { runPipeline }         from './ai-secretary/pipeline.js'
import KLawPlugin              from './domains/k-law/index.js'
import KHealthPlugin           from './domains/k-health/index.js'
import { ShellUI }             from './shell-ui.js'

// vault, hashChain, layerClient, tokenomics, mixnet 은
// 개별 함수 export이므로 별도 init() 없이 사용됨.
// 각 모듈은 pipeline.js, phase6.js 등 내부에서 직접 import해 사용.

// ── 부트스트랩 상태 ──────────────────────────────────────────
const BootState = { IDLE:'IDLE', BOOTING:'BOOTING', READY:'READY', ERROR:'ERROR' }
let _state = BootState.IDLE

export async function bootstrap() {
  if (_state === BootState.BOOTING) throw new Error('bootstrap() already in progress')
  if (_state === BootState.READY)   return { registry }

  _state = BootState.BOOTING
  const log = (msg) => console.log(`[BOOT] ${msg}`)

  try {
    // ── 1. 코어 초기화 ─────────────────────────────────────
    log('1/6 코어 초기화...')
    await registry.init()

    // ── 2. PDV + OpenHash ──────────────────────────────────
    // 개별 함수 export 모듈 — 별도 init 불필요
    // (IndexedDB는 vault.js 내부에서 최초 접근 시 자동 초기화)
    log('2/6 PDV + OpenHash 준비...')

    // ── 3. 도메인 플러그인 등록 ────────────────────────────
    log('3/6 도메인 플러그인 등록...')
    await registry.register(new KLawPlugin())
    await registry.register(new KHealthPlugin())

    // ── 4. AI 비서 파이프라인 ─────────────────────────────
    // runPipeline은 함수이므로 init() 불필요.
    // ⚠️  파이프라인 실행은 index.html의 _runPipelineBackground()가 담당.
    //     여기서 MSG_RECEIVED를 구독하면 이중 실행 → Phase0 오류 발생.
    //     따라서 자동 연결을 제거한다.
    log('4/6 AI 비서 파이프라인 준비...')

    // ── 5. Network + GDC + Privacy ────────────────────────
    log('5/6 Network + GDC + Privacy 준비...')

    // ── 6. Shell UI 렌더링 ───────────────────────────────
    log('6/6 Shell UI 렌더링...')
    const plugins = registry.list()
    await ShellUI.render(plugins)

    _state = BootState.READY
    EventBus.emit(EVENTS.PLATFORM_READY ?? 'platform:ready',
      { plugins: plugins.map(p => p.name) }, 'app')
    log(`부트스트랩 완료 — 플러그인 ${plugins.length}개 활성화`)

    return { registry, runPipeline, ui: ShellUI }

  } catch (err) {
    _state = BootState.ERROR
    console.error('[BOOT] 부트스트랩 실패:', err)
    throw err
  }
}

export function getBootState()  { return _state }
export function _resetForTest() { _state = BootState.IDLE }

// 브라우저 자동 실행
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => bootstrap())
}
