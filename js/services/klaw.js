// ══════════════════════════════════════════════════════════════════
// services/klaw.js — K-Law 백그라운드 법적 리스크 감시
// ══════════════════════════════════════════════════════════════════
import { KLAW_COOLDOWN_MS } from '../../config.js';

// 런타임에 init()에서 주입
let _getCFG       = () => ({});
let _appendBubble = () => {};
let _recordPDV    = () => {};

export function initKlaw({ getCFG, appendBubble, recordPDV }) {
  _getCFG       = getCFG;
  _appendBubble = appendBubble;
  _recordPDV    = recordPDV;
}

let _lastCheck = 0;
let _busy      = false;

// ── monitor_prompt.txt 로드 ──────────────────────────────────────
async function getMonitorPrompt() {
  try {
    const r = await fetch('/klaw/prompts/monitor_prompt.txt');
    if (r.ok) return await r.text();
  } catch {}
  // 폴백: 인라인 최소 프롬프트
  return '당신은 법적 리스크 감지 AI입니다. 아래 내용에서 법적 리스크를 JSON으로만 반환하세요: {"level":"NONE|LOW|MEDIUM|HIGH|CRITICAL","summary":"","basis":"","action":""}';
}

// ── 메인 감시 함수 ───────────────────────────────────────────────
// source: 'chat' | 'service'
// payload: { userText, aiText } | PDV record
export async function klawReview(source, payload) {
  if (_busy || Date.now() - _lastCheck < KLAW_COOLDOWN_MS) return;
  _busy = true;
  _lastCheck = Date.now();

  try {
    const cfg    = _getCFG();
    const prompt = await getMonitorPrompt();
    const text   = typeof payload === 'string' ? payload
      : (payload.userText || '') + '\n' + (payload.aiText || '') + '\n' + (payload.summary || '');

    if (!text.trim() || text.length < 20) return;

    const res = await fetch(cfg.endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      cfg.model,
        max_tokens: 300,
        system:     prompt,
        messages:   [{ role:'user', content:`[검토 대상]\n${text.slice(0, 2000)}` }],
        stream:     false,
      }),
    });

    const d      = await res.json();
    const raw    = d.choices?.[0]?.message?.content || d.content?.[0]?.text || '';
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const level  = result.level || 'NONE';

    // PDV 기록 (모든 레벨)
    _recordPDV({
      type:      'klaw_monitor',
      serviceId: 'klaw',
      summary:   `K-Law 감시: ${level} — ${result.summary || ''}`,
      how:       'auto',
      why:       '법적 리스크 자동 감시',
    });

    // HIGH/CRITICAL만 채팅창에 경고 버블 표시
    if (level === 'HIGH' || level === 'CRITICAL') {
      const icon = level === 'CRITICAL' ? '🔴' : '🟠';
      _appendBubble('ai',
        `${icon} <b>K-Law 자동 감지 — ${level}</b><br>` +
        `${result.summary || ''}<br>` +
        `<small style="color:#8E8E93">근거: ${result.basis || ''}</small><br>` +
        `💡 ${result.action || '법률 전문가 상담 권고'}`,
        true
      );
    }

  } catch(e) { console.warn('[K-Law]', e.message); }
  finally    { _busy = false; }
}

// ── K-Law webapp 실행 ────────────────────────────────────────────
// 고팡에서 법률 관련 메시지 감지 시 호출
// user: { guid, fp }  /  userText: 사용자 입력 원문
let _getUser = () => null;

export function initKlawLaunch({ getUser }) {
  _getUser = getUser;
}

const KLAW_URL = location.hostname === 'localhost'
  ? 'http://localhost:8080/webapp.html'
  : 'https://klaw.openhash.kr/webapp.html';

let _klawTab  = null;   // 이미 열린 탭 재사용
let _lastOpen = 0;
const OPEN_COOLDOWN = 10_000; // 10초 내 중복 방지

export function klawLaunch(userText = '') {
  // 쿨다운: 10초 내 중복 호출 방지
  if (Date.now() - _lastOpen < OPEN_COOLDOWN) return;
  _lastOpen = Date.now();

  const user = _getUser();
  const url  = new URL(KLAW_URL);

  // 고팡 사용자 정보 전달
  if (user?.guid) url.searchParams.set('guid', user.guid);
  if (user?.fp)   url.searchParams.set('fp',   user.fp);

  // 사건 초기 텍스트 전달 (있을 경우)
  if (userText)   url.searchParams.set('case', encodeURIComponent(userText));

  // 출처 표시
  url.searchParams.set('from', 'gopang');

  // 이미 열린 탭이 있으면 재사용, 아니면 새 탭
  if (_klawTab && !_klawTab.closed) {
    _klawTab.focus();
  } else {
    _klawTab = window.open(url.toString(), 'gopang_klaw');
  }

  console.info('[K-Law] 탭 실행:', url.toString());
}
