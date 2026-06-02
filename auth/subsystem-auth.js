/**
 * subsystem-auth.js  v1.0
 * 고팡 하위 시스템 공용 인증 모듈
 *
 * 배포 위치: https://gopang.net/auth/subsystem-auth.js
 *
 * 사용법 (각 하위 시스템 HTML에 단 한 줄):
 *   <script type="module"
 *     src="https://gopang.net/auth/subsystem-auth.js">
 *   </script>
 *
 * 또는 함수를 직접 import할 때:
 *   import { initAuth, requireLevel }
 *     from 'https://gopang.net/auth/subsystem-auth.js';
 *
 * 백서 §12: 하위 서비스 독자 인증 구현 금지
 */

// ── gopang-sso.js 로드 ────────────────────────────────────
let _gopangAuth = null;
let _user       = null;

async function _loadSSO() {
  if (_gopangAuth) return;
  try {
    const mod  = await import('./gopang-sso.js');
    _gopangAuth = mod.gopangAuth;
  } catch(e) {
    console.warn('[SubsystemAuth] gopang-sso.js 로드 실패, 로컬 폴백:', e.message);
    _gopangAuth = _localFallback();
  }
}

// ── 공개 API ─────────────────────────────────────────────

/**
 * initAuth()
 * 하위 시스템 초기화 시 호출. L0 인증 수행.
 * 반환: { ipv6, level, exp } | null
 */
export async function initAuth() {
  await _loadSSO();
  _user = await _gopangAuth.require('L0');
  if (!_user) return null;
  _renderAuthBadge();
  _autoHideLoading();
  // 페이지 인라인 스크립트에 인증 결과 전달
  if (typeof window._onGopangAuth === 'function') {
    window._onGopangAuth(_user);
  }
  return _user;
}

/**
 * requireLevel(level)
 * 중요 기능 호출 전 레벨 상향 요청.
 * 예) const ok = await requireLevel('L1');
 */
export async function requireLevel(level) {
  await _loadSSO();
  const result = await _gopangAuth.require(level);
  if (result) { _user = result; _renderAuthBadge(); }
  return result;
}

/**
 * getUser()
 * 현재 인증된 사용자 객체 반환 (인증 시도 없음).
 */
export function getUser() { return _user; }

/**
 * logout()
 */
export function logout() { _gopangAuth?.logout?.(); }

// ── 내부 유틸 ────────────────────────────────────────────

/** auth-badge 엘리먼트 업데이트 */
function _renderAuthBadge() {
  const el = document.getElementById('auth-badge');
  if (!el || !_user) return;
  const cfg = {
    L0: { label:'L0', color:'var(--txt3, #9ca3af)' },
    L1: { label:'L1', color:'#00bcd4'              },
    L2: { label:'L2', color:'var(--green, #3ecf8e)' },
    L3: { label:'L3', color:'#ff9800'              },
  };
  const c = cfg[_user.level] || cfg.L0;
  el.style.color = c.color;
  el.textContent = c.label;
  el.title       = _user.ipv6 || '';
  el.onclick     = showAuthPanel;
}

/** auth-loading 엘리먼트 자동 숨김 */
function _autoHideLoading() {
  const el = document.getElementById('auth-loading');
  if (el) el.style.display = 'none';
}

/** 인증 정보 패널 표시 */
export function showAuthPanel() {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) return;

  // 서비스명: hostname에서 자동 추출 (police.gopang.net → K-Police)
  const sub = location.hostname.replace(/\.gopang\.net$/, '');
  const svcLabel = sub !== location.hostname
    ? 'K-' + sub.charAt(0).toUpperCase() + sub.slice(1)
    : '고팡 서비스';

  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:28px;margin-bottom:10px">🔑</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:12px">고팡 인증</div>
      <div style="font-size:12px;color:#6b7280;line-height:1.8;margin-bottom:16px">
        ${svcLabel}은 고팡(gopang.net) 인증을 사용합니다.<br>
        현재 레벨:
        <strong style="color:#3ecf8e">${_user?.level || 'L0'}</strong>
        &nbsp;|&nbsp;
        IPv6: <code style="font-size:10px;color:#9ca3af">
          ${(_user?.ipv6 || '').slice(0, 24)}…
        </code>
      </div>
      <a href="https://gopang.net" target="_blank"
        style="display:flex;align-items:center;justify-content:center;
               width:100%;padding:12px;border-radius:8px;
               background:#3ecf8e;color:#fff;
               font-size:14px;font-weight:600;
               text-decoration:none;margin-bottom:8px">
        고팡 앱 열기
      </a>
      <button onclick="document.getElementById('auth-modal').classList.remove('open')"
        style="width:100%;padding:10px;border-radius:8px;
               border:1px solid #e5e7eb;background:transparent;
               color:#6b7280;font-size:13px;cursor:pointer">
        닫기
      </button>
    </div>`;
  modal.classList.add('open');
}

/** 로그인 안내 모달 표시 */
export function showLoginPrompt(level) {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) {
    // 모달 없는 환경 → silent-auth.html 리다이렉트
    const svc = location.hostname.replace(/\.gopang\.net$/, '') || 'dev';
    location.replace(
      `https://gopang.net/auth/silent-auth.html`
      + `?return=${encodeURIComponent(location.href)}&svc=${svc}&level=${level || 'L0'}`
    );
    return;
  }
  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:28px;margin-bottom:10px">🔒</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:12px">고팡 인증 필요</div>
      <div style="font-size:12px;color:#6b7280;line-height:1.8;margin-bottom:16px">
        고팡(gopang.net) 계정으로 로그인하면<br>
        모든 하위 서비스를 이용할 수 있습니다.
        ${level ? `<br><strong>${level}</strong> 인증이 필요합니다.` : ''}
      </div>
      <a href="https://gopang.net" target="_blank"
        style="display:flex;align-items:center;justify-content:center;
               width:100%;padding:12px;border-radius:8px;
               background:#3ecf8e;color:#fff;
               font-size:14px;font-weight:600;
               text-decoration:none;margin-bottom:8px">
        gopang.net 열기
      </a>
      <button onclick="location.reload()"
        style="width:100%;padding:10px;border-radius:8px;
               border:1px solid #e5e7eb;background:transparent;
               color:#374151;font-size:13px;cursor:pointer;margin-bottom:8px">
        인증 후 새로고침
      </button>
      <button onclick="document.getElementById('auth-modal').classList.remove('open')"
        style="width:100%;padding:10px;border-radius:8px;
               border:1px solid #e5e7eb;background:transparent;
               color:#9ca3af;font-size:13px;cursor:pointer">
        닫기
      </button>
    </div>`;
  modal.classList.add('open');
}

// ── 로컬 폴백 (gopang-sso.js 로드 실패 시) ───────────────
function _localFallback() {
  const STORE   = 'gopang_user_v3';
  const SESSION = 'gopang_sso_token';
  const LVL     = { L0:0, L1:1, L2:2, L3:3 };

  return {
    async require(level) {
      // 세션 캐시
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
        if (s?.exp && Date.now() / 1000 < s.exp && LVL[s.level] >= LVL[level])
          return { ...s, via: 'session' };
      } catch {}

      // 로컬스토어
      const stored = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!stored?.ipv6) { showLoginPrompt(); return null; }

      const exp   = Math.floor(Date.now() / 1000) + 3600;
      const token = { ipv6: stored.ipv6, level: stored.authLevel || 'L0', exp };
      sessionStorage.setItem(SESSION, JSON.stringify(token));

      if (LVL[token.level] < LVL[level]) { showLoginPrompt(level); return null; }
      return { ...token, via: 'local' };
    },
    async verify(level) { return this.require(level); },
    session() {
      try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); }
      catch { return null; }
    },
    logout() { sessionStorage.removeItem(SESSION); },
  };
}

// ── 자동 실행: <script src="..."> 방식으로 삽입 시 ───────
// type="module" 스크립트는 import 없이 삽입해도 initAuth()가
// DOMContentLoaded 이후 자동 실행되도록 처리
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initAuth());
} else {
  initAuth();
}
