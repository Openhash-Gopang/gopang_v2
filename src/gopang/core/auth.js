/**
 * core/auth.js — 사용자 인증·등록
 * - _USER 초기화 (L0 자동로그인 / Guest)
 * - L1 PocketBase 아이디 등록 (upsert)
 * - 생체인증 UI (얼굴·지문·시드)
 * - gopangAuth (레벨별 인증 요구)
 */
import { setUser, _USER, USER_GUID, L1_URL } from './state.js';
import { appendBubble } from '../ui/bubble.js';

// ── SHA-256 헬퍼 ─────────────────────────────────────────
export async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── 사용자 초기화 (앱 시작 시 1회) ──────────────────────
export async function initAuth() {
  const STORE_KEY = 'gopang_user_v3';
  const stored    = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  const fpHex     = await _buildDeviceFingerprint();
  const ipv6      = await _buildIPv6Identity(fpHex);

  // L0 자동 로그인
  if (stored?.ipv6 && stored?.fpHex === fpHex) {
    console.info('[Auth] L0 자동 로그인 ✅', stored.ipv6);
    setUser(stored);

    // [7-A] 기존 등록 사용자 fpHex L1 동기화 (최초 1회)
    if (stored.handle && !stored.fpHexSynced) {
      _patchFpHexToL1(stored, fpHex).then(() => {
        stored.fpHexSynced = true;
        localStorage.setItem(STORE_KEY, JSON.stringify(stored));
      });
    }

    return stored;
  }

  // 기기 변경 감지
  if (stored?.ipv6 && stored?.fpHex !== fpHex) {
    console.warn('[Auth] 기기 변경 감지 — 복원 필요');
    _showRestoreUI(stored, fpHex, ipv6);
    const user = { ipv6, fpHex, isTemp: true, registeredAt: new Date().toISOString() };
    setUser(user);
    return user;
  }

  // [1-B] localStorage 없음 → L1에서 fpHex로 기존 등록 여부 조회
  try {
    const filter = encodeURIComponent(`fpHex='${fpHex}'`);
    const res = await fetch(`${L1_URL}?filter=${filter}&perPage=1`);
    if (res.ok) {
      const data = await res.json();
      const found = data.items?.[0];
      if (found?.handle) {
        // 동일 기기, 타 브라우저 → 기존 아이디 발견 → 복원 팝업
        return new Promise((resolve) => {
          const overlay = document.createElement('div');
          overlay.style.cssText = [
            'position:fixed;inset:0;background:rgba(0,0,0,0.6);',
            'display:flex;align-items:center;justify-content:center;z-index:9999'
          ].join('');
          overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:24px;width:300px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">이 기기의 고팡 아이디</p>
              <strong style="font-size:20px;color:#16a34a;">${found.handle}</strong>
              <p style="font-size:12px;color:#9ca3af;margin:8px 0 20px;">이 아이디로 로그인하시겠습니까?</p>
              <button id="_l1-confirm" style="width:100%;background:#16a34a;color:#fff;border:none;
                border-radius:10px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px;">
                로그인
              </button>
              <button id="_l1-cancel" style="width:100%;background:transparent;color:#9ca3af;
                border:1px solid #e5e7eb;border-radius:10px;padding:10px;font-size:13px;cursor:pointer;">
                Guest로 계속
              </button>
            </div>`;
          document.body.appendChild(overlay);

          document.getElementById('_l1-confirm').onclick = () => {
            overlay.remove();
            const restored = {
              ipv6, fpHex,
              handle: found.handle,
              name: found.handle.replace(/@(.+)#.+/, '$1'),
              isGuest: false, isTemp: false,
              registeredAt: found.created
            };
            setUser(restored);
            localStorage.setItem(STORE_KEY, JSON.stringify(restored));
            resolve(restored);
          };

          document.getElementById('_l1-cancel').onclick = () => {
            overlay.remove();
            const guest = { ipv6, fpHex, isTemp: true, isGuest: true,
                            registeredAt: new Date().toISOString() };
            setUser(guest);
            localStorage.setItem(STORE_KEY, JSON.stringify(guest));
            resolve(guest);
          };
        });
      }
    }
  } catch(e) {
    console.warn('[Auth] L1 fpHex 조회 실패 (오프라인?):', e.message);
  }

  // 신규 게스트
  console.info('[Auth] 신규 게스트 — 등록 없이 진입');
  const user = { ipv6, fpHex, isTemp: true, isGuest: true, registeredAt: new Date().toISOString() };
  setUser(user);
  localStorage.setItem(STORE_KEY, JSON.stringify(user));
  return user;
}

// ── 등록 여부 판별 ────────────────────────────────────────
export function _isRegistered() {
  try {
    const s = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
    return !!(s?.handle);
  } catch(e) { return false; }
}

export function _isTypeBorC() {
  try {
    const s = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
    if (!s) return false;
    return !!(s.seedHex || s.faceVec || s.webauthn?.credentialId || s.profileHandle || s.handle);
  } catch(e) { return false; }
}

// ── GDC 사용자 판별 [5-A] ────────────────────────────────
export function _isGDCUser() {
  try {
    const s = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
    return !!(s?.gdcEnabled && s?.walletPubKey);
  } catch { return false; }
}

// ── L1 PocketBase 등록 (upsert) ──────────────────────────
export async function _registerToL1(name) {
  const user = _USER;
  if (!user) return null;
  const guid          = user.ipv6 || USER_GUID;
  const nickname_hash = await _sha256('ko:' + name);
  const handle        = '@' + name + '#' + guid.slice(-4);

  // [2-B] fpHex 중복 검증
  if (user.fpHex) {
    try {
      const filter = encodeURIComponent(`fpHex='${user.fpHex}'`);
      const chkRes = await fetch(`${L1_URL}?filter=${filter}&perPage=1`);
      if (chkRes.ok) {
        const chkData = await chkRes.json();
        const existing = chkData.items?.[0];
        if (existing?.handle && existing.handle !== handle) {
          alert('이 기기는 이미 다른 사용자에게 등록된 기기입니다.\n고팡 아이디는 기기당 1개만 등록할 수 있습니다.');
          return null;
        }
      }
    } catch(e) {
      console.warn('[L1] fpHex 중복 검증 실패:', e.message);
    }
  }

  try {
    const postRes = await fetch(L1_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guid, nickname_hash, handle, fpHex: user.fpHex,
        native_lang: navigator.language?.slice(0,2) || 'ko',
        is_public: true }),
    });

    if (!postRes.ok) {
      // 중복 → GET + PATCH
      const safeGuid = guid.replace(/'/g, "\\'");
      const filter   = encodeURIComponent(`guid='${safeGuid}'`);
      const getRes   = await fetch(`${L1_URL}?filter=${filter}&perPage=1`);
      const getData  = await getRes.json();
      const existingId = getData.items?.[0]?.id;
      if (existingId) {
        await fetch(`${L1_URL}/${existingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname_hash, handle, fpHex: user.fpHex, is_public: true }),
        });
      } else {
        throw new Error('레코드 조회 실패: ' + getRes.status);
      }
    }

    // 성공 → _USER + localStorage 업데이트
    user.handle  = handle;
    user.name    = name;
    user.isGuest = false;
    user.isTemp  = false;
    localStorage.setItem('gopang_user_v3', JSON.stringify(user));
    console.info('[L1] 등록 완료:', handle);
    return handle;

  } catch(e) {
    console.warn('[L1] 등록 실패:', e.message);
    return null;
  }
}

// ── L1 fpHex 동기화 (기존 사용자 마이그레이션) [7-A] ─────
async function _patchFpHexToL1(stored, fpHex) {
  try {
    const filter = encodeURIComponent(`guid='${stored.ipv6}'`);
    const res = await fetch(`${L1_URL}?filter=${filter}&perPage=1`);
    if (!res.ok) return;
    const data = await res.json();
    const id = data.items?.[0]?.id;
    if (!id) return;
    await fetch(`${L1_URL}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fpHex, guid: stored.ipv6 })
    });
    console.info('[Auth] L1 fpHex 동기화 완료');
  } catch(e) {
    console.warn('[Auth] L1 fpHex 동기화 실패:', e.message);
  }
}

// ── 기기 완전 초기화 [4-A] ───────────────────────────────
export async function _deviceFullReset() {
  if (!confirm('기기를 완전 초기화합니다.\n판매·양도 전 실행하세요.\n\n⚠️ 이 기기의 모든 고팡 데이터가 삭제됩니다.')) return;
  try {
    const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
    if (stored?.fpHex) {
      const filter = encodeURIComponent(`fpHex='${stored.fpHex}'`);
      const res = await fetch(`${L1_URL}?filter=${filter}&perPage=1`);
      if (res.ok) {
        const data = await res.json();
        const id = data.items?.[0]?.id;
        if (id) await fetch(`${L1_URL}/${id}`, { method: 'DELETE' });
      }
    }
  } catch(e) { console.warn('[Reset] L1 삭제 실패:', e.message); }

  localStorage.clear();
  sessionStorage.clear();

  const dbs = await indexedDB.databases?.() || [];
  for (const db of dbs) indexedDB.deleteDatabase(db.name);

  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));

  location.reload();
}

// ── gopangAuth — 레벨별 인증 요구 ────────────────────────
export const gopangAuth = {
  async require(level = 'L0') {
    const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
    if (!stored?.ipv6) return false;
    const levels  = ['L0','L1','L2','L3'];
    const current = levels.indexOf(stored.authLevel || 'L0');
    const needed  = levels.indexOf(level);
    if (current >= needed) return true;

    if (needed >= 1) {
      if (!stored.faceVec) {
        appendBubble('ai', '⚠️ 얼굴을 먼저 등록해 주세요. (설정 → 보안)', true);
        return false;
      }
      appendBubble('ai', '📷 얼굴 인증이 필요합니다.', true);
      const vec = await _captureFaceVector();
      if (!vec) return false;
      const sim = _cosineSim(vec, stored.faceVec);
      if (sim < 0.90) {
        appendBubble('ai', `❌ 얼굴 인증 실패 (유사도 ${(sim*100).toFixed(1)}%)`, true);
        return false;
      }
      if (needed === 1) return true;
    }

    if (needed >= 2) {
      const credId = stored.webauthn?.credentialId;
      if (!credId) {
        appendBubble('ai', '⚠️ 지문을 먼저 등록해 주세요. (설정 → 보안)', true);
        return false;
      }
      try {
        appendBubble('ai', '🔐 지문 인증이 필요합니다.', true);
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge, timeout: 30000, userVerification: 'required',
            allowCredentials: [{ id: Uint8Array.from(atob(credId.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)), type: 'public-key' }],
          },
        });
        if (!assertion) return false;
        if (needed === 2) { appendBubble('ai', '✅ 지문 인증 완료.', true); return true; }
      } catch(e) { appendBubble('ai', '지문 인증이 취소됐습니다.', true); return false; }
    }

    if (needed >= 3) {
      const words = prompt('4단어 시드를 입력하세요:');
      if (!words) return false;
      const inputBytes = await _seedToBytes(words);
      const inputHex   = Array.from(inputBytes).map(b=>b.toString(16).padStart(2,'0')).join('');
      if (inputHex !== stored.seedHex) {
        appendBubble('ai', '❌ 시드가 일치하지 않습니다.', true);
        return false;
      }
      appendBubble('ai', '✅ L3 전체 인증 완료.', true);
      return true;
    }
    return false;
  }
};

// ── 복원 UI (기기 변경 시) ───────────────────────────────
function _showRestoreUI(stored, newFpHex, newIpv6) {
  setTimeout(() => {
    appendBubble('ai',
      '📱 새 기기 또는 앱 갱신이 감지됐습니다.<br><br>' +
      '이전 정체성을 복원하려면 아래에 4단어 시드를 입력하세요.',
      true
    );
    _showRestoreInputUI(stored, newFpHex);
  }, 800);
}

function _showRestoreInputUI(stored, newFpHex) {
  const list = document.getElementById('message-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.innerHTML = `
    <div style="background:var(--bg-subtle);border-radius:12px;padding:16px;width:100%;max-width:320px;">
      <input id="_restore-seed" type="text" placeholder="등록 시 입력한 단어 4개"
        style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--sep-strong);
               font-size:14px;background:var(--bg);color:var(--label);box-sizing:border-box;margin-bottom:10px;"/>
      <button onclick="window._verifyRestore('${newFpHex}')"
        style="width:100%;background:var(--tint);color:#fff;border:none;border-radius:8px;
               padding:11px;font-size:14px;font-weight:600;cursor:pointer;">복원하기</button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

window._verifyRestore = async function(newFpHex) {
  const words  = document.getElementById('_restore-seed')?.value?.trim() || '';
  const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
  if (!stored?.seedHex) { appendBubble('ai', '⚠️ 이전 등록 정보가 없습니다.', true); return; }
  const inputBytes = await _seedToBytes(words);
  const inputHex   = Array.from(inputBytes).map(b=>b.toString(16).padStart(2,'0')).join('');
  if (inputHex !== stored.seedHex) { appendBubble('ai', '❌ 시드가 일치하지 않습니다.', true); return; }
  const updated = { ...stored, fpHex: newFpHex, ipv6: stored.ipv6, lastSeenAt: new Date().toISOString() };
  localStorage.setItem('gopang_user_v3', JSON.stringify(updated));
  setUser(updated);
  appendBubble('ai', `✅ 복원 완료!<br>🆔 <code style="font-size:11px;">${stored.ipv6}</code>`, true);
};

// ── 인증 확인 버튼 ───────────────────────────────────────
export function _injectAuthConfirmButton(level) {
  const list = document.getElementById('message-list');
  if (!list) return;
  const labels = { L1:'얼굴 인증', L2:'지문 인증', L3:'지문+얼굴+4단어 인증' };
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = '_auth-confirm-row';
  row.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;padding:4px 0;">
      <button onclick="window._executeAuthAndProceed('${level}')"
        style="background:var(--tint);color:#fff;border:none;border-radius:8px;
               padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">
        🔐 ${labels[level]||'추가 인증'} 후 진행
      </button>
      <button onclick="window._cancelAuthRequest()"
        style="background:var(--bg-subtle);color:var(--label-2);border:1px solid var(--sep);
               border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer;">취소</button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

window._executeAuthAndProceed = async function(level) {
  document.getElementById('_auth-confirm-row')?.remove();
  const { callAI } = await import('../ai/call-ai.js');
  const ok = await gopangAuth.require(level);
  if (!ok) { appendBubble('ai', '인증이 취소됐습니다.', true); return; }
  appendBubble('user', `[인증완료:${level}] 인증이 완료됐습니다.`, false);
  await callAI(`[AUTH_CONFIRMED:${level}] 사용자가 ${level} 인증을 완료했습니다. 이전 요청을 즉시 실행하세요.`);
};

window._cancelAuthRequest = function() {
  document.getElementById('_auth-confirm-row')?.remove();
  appendBubble('ai', '거래가 취소됐습니다.', true);
};
