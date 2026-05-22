/**
 * @file layerClient.js
 * @description L1~L5 노드 통신 — K=3 리던던시 + 자동 페일오버
 * @version 1.0.0
 * @author AI City Inc.
 *
 * 근거: GAS v1.6 §12.1 K=3 리던던시 의무
 *   - 3개 노드 중 1개 장애 시 자동 페일오버
 *   - dev 환경: 로컬 에뮬레이션
 *   - prod 환경: 실제 GitHub Pages 노드
 */

import { config } from '../core/config.js'
import { PLSM } from '../core/constants.js'

// K=3 리던던시: 각 계층별 3개 노드 엔드포인트
const LAYER_NODES = {
  L1: [
    `${config.LAYER_ENDPOINTS.L1}`,
    `${config.LAYER_ENDPOINTS.L1}/replica-1`,
    `${config.LAYER_ENDPOINTS.L1}/replica-2`,
  ],
  L2: [
    `${config.LAYER_ENDPOINTS.L2}`,
    `${config.LAYER_ENDPOINTS.L2}/replica-1`,
    `${config.LAYER_ENDPOINTS.L2}/replica-2`,
  ],
  L3: [
    `${config.LAYER_ENDPOINTS.L3}`,
    `${config.LAYER_ENDPOINTS.L3}/replica-1`,
    `${config.LAYER_ENDPOINTS.L3}/replica-2`,
  ],
  L4: [
    `${config.LAYER_ENDPOINTS.L4}`,
    `${config.LAYER_ENDPOINTS.L4}/replica-1`,
    `${config.LAYER_ENDPOINTS.L4}/replica-2`,
  ],
  L5: [
    `${config.LAYER_ENDPOINTS.L5}`,
    `${config.LAYER_ENDPOINTS.L5}/replica-1`,
    `${config.LAYER_ENDPOINTS.L5}/replica-2`,
  ],
}

// 노드 상태 추적 (메모리)
const _nodeStatus = new Map()  // endpoint → { healthy, failCount, lastCheck }

/**
 * 지정 계층에 엔트리 제출 (K=3 리던던시 + 페일오버)
 * @param {string} layer - 'L1'~'L5'
 * @param {Object} entry - 앵커 엔트리
 * @returns {Promise<{ success: boolean, node: string, layer: string }>}
 */
export async function submitToLayer(layer, entry) {
  const nodes = LAYER_NODES[layer]
  if (!nodes) throw new Error(`[LayerClient] 알 수 없는 계층: ${layer}`)

  // 건강한 노드 우선 순서 정렬
  const ordered = _orderByHealth(nodes)

  for (const node of ordered) {
    try {
      await _submitToNode(node, entry)
      _markHealthy(node)
      return { success: true, node, layer }
    } catch (err) {
      _markFailed(node)
      console.warn(`[LayerClient] ${node} 실패 → 다음 노드로: ${err.message}`)
    }
  }

  // 모든 노드 실패
  console.error(`[LayerClient] ${layer} 모든 노드 실패 — 로컬 캐시 유지`)
  return { success: false, node: null, layer }
}

/**
 * 모든 계층 상태 조회
 * @returns {Object} { L1: { healthy, nodes }, ... }
 */
export function getLayerStatus() {
  const status = {}
  for (const [layer, nodes] of Object.entries(LAYER_NODES)) {
    status[layer] = {
      healthy: nodes.filter(n => _isHealthy(n)).length,
      total:   nodes.length,
      nodes:   nodes.map(n => ({ url: n, healthy: _isHealthy(n) })),
    }
  }
  return status
}

/**
 * 계층별 TPS 조회 (시뮬레이션)
 * @param {string} layer
 * @returns {number}
 */
export function getLayerTPS(layer) {
  // dev: 시뮬레이션 값 (PLSM 분포 기반)
  const baseTPS = { L1: 2640, L2: 880, L3: 440, L4: 264, L5: 176 }
  return baseTPS[layer] ?? 0
}

// ── Private ───────────────────────────────────────────────────────────────

async function _submitToNode(nodeUrl, entry) {
  if (config.ENV === 'dev') {
    // dev: 항상 성공 (노드 미배포)
    return { ok: true }
  }

  const res = await fetch(`${nodeUrl}/anchor`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(entry),
    signal:  AbortSignal.timeout(3000),  // 3초 타임아웃
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function _orderByHealth(nodes) {
  return [...nodes].sort((a, b) => {
    const aH = _isHealthy(a) ? 0 : 1
    const bH = _isHealthy(b) ? 0 : 1
    return aH - bH
  })
}

function _isHealthy(node) {
  const s = _nodeStatus.get(node)
  if (!s) return true  // 미확인 = 건강으로 간주
  return s.healthy
}

function _markHealthy(node) {
  _nodeStatus.set(node, { healthy: true, failCount: 0, lastCheck: Date.now() })
}

function _markFailed(node) {
  const s = _nodeStatus.get(node) ?? { failCount: 0 }
  _nodeStatus.set(node, { healthy: false, failCount: s.failCount + 1, lastCheck: Date.now() })
}

/** 테스트용 상태 초기화 */
export function _resetStatus() { _nodeStatus.clear() }
