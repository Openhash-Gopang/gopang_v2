/**
 * @file mixnet.js
 * @description Mixnet — GDC 보상·가중 라우팅·슬래싱
 * @version 1.0.0
 * 근거: GAS v1.6 §18
 */

const _mixnodes = new Map()  // nodeId → { stakeGDC, relayCount, slashed }

export function registerMixnode(nodeId, stakeGDC) {
  _mixnodes.set(nodeId, { nodeId, stakeGDC, relayCount: 0, slashed: false, reward: 0 })
}

/** GDC 스테이킹 기반 경로 가중 선택 */
export function selectPath(hops = 3) {
  const nodes = [..._mixnodes.values()].filter(n => !n.slashed && n.stakeGDC > 0)
  if (nodes.length < hops) return nodes.map(n => n.nodeId)

  // 스테이킹 비례 가중 선택 (간단 구현)
  const totalStake = nodes.reduce((s, n) => s + n.stakeGDC, 0)
  const selected = []

  for (let i = 0; i < hops; i++) {
    let rand = Math.random() * totalStake
    for (const node of nodes) {
      rand -= node.stakeGDC
      if (rand <= 0 && !selected.includes(node.nodeId)) {
        selected.push(node.nodeId)
        break
      }
    }
  }
  return selected
}

/** 중계 보상 지급 */
export function rewardRelay(nodeId, amountGDC) {
  const node = _mixnodes.get(nodeId)
  if (!node) return false
  node.relayCount++
  node.reward += amountGDC
  return true
}

/** 악의적 노드 슬래싱 */
export function slashNode(nodeId) {
  const node = _mixnodes.get(nodeId)
  if (!node) return false
  node.slashed = true
  node.stakeGDC = 0
  return true
}

export function getMixnode(nodeId) { return _mixnodes.get(nodeId) ?? null }
export function _resetMixnet() { _mixnodes.clear() }
