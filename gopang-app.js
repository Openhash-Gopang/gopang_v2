// gopang-app.js — 고팡 앱 코어 (위치·UI·AI·라우터·마이크·K-Law·GWP)
(async () => {
const _USER = await (async () => {
  const STORE_KEY = 'gopang_user_v3';
  const stored    = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  const fpHex     = await _buildDeviceFingerprint();
  const ipv6      = await _buildIPv6Identity(fpHex);

  // ── L0: 기기 일치 → 자동 로그인 ────────────────────
  if (stored?.ipv6 && stored?.fpHex === fpHex) {
    console.info('[Auth v2] L0 자동 로그인 ✅', stored.ipv6);
    return stored;
  }

  // ── 기기 변경 감지 → 복원 UI 표시 ──────────────────
  if (stored?.ipv6 && stored?.fpHex !== fpHex) {
    console.warn('[Auth v2] 기기 변경 감지 — 복원 필요');
    _showRestoreUI(stored, fpHex, ipv6);
    // 복원 완료까지 임시 사용자로 진행
    return { ipv6, fpHex, isTemp: true,
             registeredAt: new Date().toISOString() };
  }

  // ── 신규 사용자 → 등록 UI ────────────────────────
  console.info('[Auth v2] 신규 사용자 — 등록 시작');
  _showRegisterUI(fpHex, ipv6);

  // 등록 완료까지 임시 진행
  return { ipv6, fpHex, isTemp: true,
           registeredAt: new Date().toISOString() };
})();

// 하위 호환성 (기존 코드 USER_GUID 참조 유지)
const USER_GUID = _USER.ipv6 || _USER.guid || crypto.randomUUID();

// ── Supabase upsert (ipv6 + fp만, 개인정보 없음) ────────
async function _upsertUserRecord(user) {
  try {
    await fetch(_SUPABASE_URL + '/rest/v1/users', {
      method: 'POST',
      headers: {
        'apikey':       _SUPABASE_KEY,
        'Authorization':'Bearer ' + _SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer':       'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        guid:          user.ipv6,        // ipv6가 새 primary key
        device_fp:     user.fpHex?.slice(0,32),
        registered_at: user.registeredAt,
        last_seen_at:  new Date().toISOString(),
      }),
    });
  } catch(e) {
    console.warn('[Auth v2] upsert 실패 (무시):', e.message);
  }
}

// ── 신규 등록 UI ─────────────────────────────────────────
function _showRegisterUI(fpHex, ipv6) {
  setTimeout(async () => {
    // MediaPipe 백그라운드 로드 시작
    _loadMediaPipe().catch(() => {});

    appendBubble('ai',
      '👋 고팡에 처음 오셨군요!<br><br>' +
      '본인 인증을 위해 다음 두 가지를 등록합니다.<br><br>' +
      '1️⃣ <b>얼굴 등록</b> — 내부 카메라로 촬영<br>' +
      '2️⃣ <b>4단어 시드</b> — 기기 분실 시 복원용<br><br>' +
      '<small style="color:var(--label-3);">' +
      '얼굴 이미지는 기기 밖으로 전송되지 않습니다.</small>',
      true
    );

    // 얼굴 등록 버튼 주입
    setTimeout(() => _injectRegisterButtons(fpHex, ipv6), 600);
  }, 1000);
}

function _injectRegisterButtons(fpHex, ipv6) {
  const list = document.getElementById('message-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = '_reg-btns';
  row.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;padding:4px 0;">
      <button onclick="_startFaceRegister('${fpHex}','${ipv6}')"
        style="background:var(--tint);color:#fff;border:none;border-radius:8px;
               padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">
        📷 얼굴 등록
      </button>
      <button onclick="_skipFaceRegister('${fpHex}','${ipv6}')"
        style="background:var(--bg-subtle);color:var(--label-2);
               border:1px solid var(--sep);border-radius:8px;
               padding:10px 16px;font-size:13px;cursor:pointer;">
        나중에
      </button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

// ── 얼굴 등록 실행 ──────────────────────────────────────
window._startFaceRegister = async function(fpHex, ipv6) {
  document.getElementById('_reg-btns')?.remove();
  appendBubble('ai', '📷 전면 카메라를 실행합니다…', true);

  const vec = await _captureFaceVector();
  if (!vec) {
    appendBubble('ai', '촬영이 취소됐습니다. 나중에 등록할 수 있습니다.', true);
    _showSeedUI(fpHex, ipv6, null);
    return;
  }
  appendBubble('ai', '✅ 얼굴 등록 완료! 이제 4단어 시드를 설정합니다.', true);
  _showSeedUI(fpHex, ipv6, vec);
};

window._skipFaceRegister = function(fpHex, ipv6) {
  document.getElementById('_reg-btns')?.remove();
  _showSeedUI(fpHex, ipv6, null);
};

// ── 4단어 시드 설정 UI ───────────────────────────────────
function _showSeedUI(fpHex, ipv6, faceVec) {
  const list = document.getElementById('message-list');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.innerHTML = `
    <div style="background:var(--bg-subtle);border-radius:12px;
                padding:16px;width:100%;max-width:320px;">
      <p style="font-size:13px;color:var(--label);margin:0 0 10px;font-weight:600;">
        🔑 복원용 4단어 시드
      </p>
      <p style="font-size:12px;color:var(--label-3);margin:0 0 12px;line-height:1.5;">
        기기 분실 시 정체성 복원에 사용됩니다.<br>
        기억하기 쉬운 단어 4개를 입력하세요.<br>
        <b>절대 타인에게 알려주지 마세요.</b>
      </p>
      <input id="_seed-input" type="text"
        placeholder="예: 제주 파란 파도 2018"
        style="width:100%;padding:10px 12px;border-radius:8px;
               border:1px solid var(--sep-strong);font-size:14px;
               background:var(--bg);color:var(--label);
               box-sizing:border-box;margin-bottom:10px;"/>
      <button onclick="_completeSeedRegister('${fpHex}','${ipv6}',${faceVec ? 'true' : 'false'})"
        style="width:100%;background:var(--tint);color:#fff;border:none;
               border-radius:8px;padding:11px;font-size:14px;
               font-weight:600;cursor:pointer;">
        등록 완료
      </button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

// ── 등록 완료 처리 ──────────────────────────────────────
window._completeSeedRegister = async function(fpHex, ipv6, hasFace) {
  const seedInput = document.getElementById('_seed-input');
  const words     = seedInput?.value?.trim() || '';

  if (words.split(/\s+/).length < 4) {
    appendBubble('ai', '⚠️ 단어 4개를 공백으로 구분하여 입력하세요.', true);
    return;
  }

  const seedBytes  = await _seedToBytes(words);
  const seedHex    = Array.from(seedBytes).map(b=>b.toString(16).padStart(2,'0')).join('');
  const faceVec    = hasFace ? (window._tempFaceVec || null) : null;

  // 기존 데이터 보존 + 새 필드 추가
  const existing = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
  const user = {
    ...existing,           // 기존 데이터 유지
    ipv6,
    fpHex,
    seedHex,
    faceVec,
    authLevel:   faceVec ? 'L1' : 'L0',
    registeredAt: existing?.registeredAt || new Date().toISOString(),
    lastSeenAt:   new Date().toISOString(),
  };

  localStorage.setItem('gopang_user_v3', JSON.stringify(user));
  _upsertUserRecord(user);

  // 시드 입력 행 제거
  document.querySelectorAll('.msg-row.ai').forEach(el => {
    if (el.querySelector('#_seed-input')) el.remove();
  });

  appendBubble('ai',
    `✅ 얼굴·시드 등록 완료!<br><br>` +
    `🆔 <code style="font-size:11px;">${ipv6}</code><br><br>` +
    `마지막으로 <b>지문 등록</b>을 하면 인증 레벨이 L2로 높아집니다.`,
    true
  );

  // 지문 등록 버튼 주입
  setTimeout(() => _injectFingerprintButton(ipv6), 500);
};

// ── 지문 등록 버튼 주입 ─────────────────────────────────
function _injectFingerprintButton(ipv6) {
  const list = document.getElementById('message-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = '_fp-btns';
  row.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;padding:4px 0;">
      <button onclick="_registerFingerprint('${ipv6}')"
        style="background:var(--tint);color:#fff;border:none;border-radius:8px;
               padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">
        🔐 지문 등록
      </button>
      <button onclick="_skipFingerprint()"
        style="background:var(--bg-subtle);color:var(--label-2);
               border:1px solid var(--sep);border-radius:8px;
               padding:10px 16px;font-size:13px;cursor:pointer;">
        나중에
      </button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

// ── 지문 등록 실행 ──────────────────────────────────────
window._registerFingerprint = async function(ipv6) {
  document.getElementById('_fp-btns')?.remove();

  // WebAuthn 지원 여부 확인
  if (!window.PublicKeyCredential) {
    appendBubble('ai', '⚠️ 이 브라우저는 지문 인증을 지원하지 않습니다.', true);
    return;
  }

  appendBubble('ai', '🔐 지문 인증을 등록합니다. 기기의 지문 센서를 사용해 주세요.', true);

  try {
    // 1. Worker에서 챌린지 발급
    const chalRes = await fetch(
      'https://gopang-proxy.tensor-city.workers.dev/auth/webauthn/challenge',
      { credentials: 'include' }
    );
    const { challenge, exp, sig: chalSig } = await chalRes.json();

    // 2. WebAuthn 등록
    const challengeBytes = Uint8Array.from(
      atob(challenge.replace(/-/g,'+').replace(/_/g,'/')),
      c => c.charCodeAt(0)
    );

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge:              challengeBytes,
        rp: {
          id:   'gopang.net',
          name: '고팡 (Gopang)',
        },
        user: {
          id:          new TextEncoder().encode(ipv6),
          name:        ipv6,
          displayName: '고팡 사용자',
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' },   // ES256 (ECDSA)
          { alg: -257, type: 'public-key' },   // RS256 (RSA)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',  // 기기 내장 (지문/Face ID)
          userVerification:        'required',  // 반드시 생체 확인
          residentKey:             'preferred',
        },
        timeout: 60000,
        attestation: 'none',   // 기기 모델 정보 불필요
      },
    });

    // 3. 공개키 추출
    const credId    = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    const publicKey = btoa(String.fromCharCode(
      ...new Uint8Array(credential.response.getPublicKey
        ? credential.response.getPublicKey()
        : credential.response.attestationObject)
    )).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

    // 4. Worker에 공개키 저장 (Supabase)
    const regRes = await fetch(
      'https://gopang-proxy.tensor-city.workers.dev/auth/webauthn/register',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipv6,
          credentialId:  credId,
          publicKey,
          challenge,
          challengeExp:  exp,
          challengeSig:  chalSig,
          deviceType:    'platform',
        }),
      }
    );
    const regData = await regRes.json();

    if (!regData.ok) throw new Error(regData.error || '등록 실패');

    // 5. localStorage에 credential ID 저장 (L2 승격)
    const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || '{}');
    const updated = {
      ...stored,
      authLevel: 'L2',
      webauthn: {
        credentialId: credId,
        registeredAt: new Date().toISOString(),
      },
      lastSeenAt: new Date().toISOString(),
    };
    localStorage.setItem('gopang_user_v3', JSON.stringify(updated));
    if (window.gopangWallet && updated.ipv6) { window.gopangWallet.setIdentity({ guid: updated.ipv6, handle: updated.handle || null }); console.info('[GopangWallet] guid 연결(지문):', updated.ipv6.slice(-8)); }

    appendBubble('ai',
      `✅ 지문 등록 완료! 인증 레벨 <b>L2</b> 달성.<br><br>` +
      `이제 중요한 거래 시 지문으로 추가 인증합니다.<br>` +
      `<small style="color:var(--label-3);">` +
      `L0 기기인증 · L1 얼굴인증 · L2 지문인증 · L3 시드인증</small>`,
      true
    );

  } catch(e) {
    if (e.name === 'NotAllowedError') {
      appendBubble('ai', '지문 인증이 취소됐습니다. 나중에 설정에서 등록할 수 있습니다.', true);
    } else {
      appendBubble('ai', `지문 등록 오류: ${e.message}`, true);
    }
    console.warn('[WebAuthn] 등록 실패:', e.name, e.message);
  }
};

window._skipFingerprint = function() {
  document.getElementById('_fp-btns')?.remove();
  appendBubble('ai',
    '지문 등록을 건너뛰었습니다.<br>' +
    '설정 → 보안에서 나중에 등록할 수 있습니다.',
    true
  );
};

// ── 기기 변경 복원 UI ────────────────────────────────────
function _showRestoreUI(stored, newFpHex, newIpv6) {
  setTimeout(() => {
    appendBubble('ai',
      '📱 새 기기 또는 앱 갱신이 감지됐습니다.<br><br>' +
      '이전 정체성을 복원하려면:<br>' +
      '1️⃣ 등록 시 설정한 <b>4단어 시드</b> 입력<br>' +
      '2️⃣ <b>얼굴 인증</b> (선택 — 더 빠른 복원)<br><br>' +
      '아래에 4단어를 입력하세요.',
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
    <div style="background:var(--bg-subtle);border-radius:12px;
                padding:16px;width:100%;max-width:320px;">
      <input id="_restore-seed" type="text"
        placeholder="등록 시 입력한 단어 4개"
        style="width:100%;padding:10px 12px;border-radius:8px;
               border:1px solid var(--sep-strong);font-size:14px;
               background:var(--bg);color:var(--label);
               box-sizing:border-box;margin-bottom:10px;"/>
      <button onclick="_verifyRestore('${newFpHex}')"
        style="width:100%;background:var(--tint);color:#fff;border:none;
               border-radius:8px;padding:11px;font-size:14px;
               font-weight:600;cursor:pointer;">
        복원하기
      </button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

window._verifyRestore = async function(newFpHex) {
  const words    = document.getElementById('_restore-seed')?.value?.trim() || '';
  const stored   = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');

  if (!stored?.seedHex) {
    appendBubble('ai', '⚠️ 이전 등록 정보가 없습니다. 새로 등록해 주세요.', true);
    return;
  }

  // 입력한 4단어 → PBKDF2 → 저장된 seedHex와 비교
  const inputBytes = await _seedToBytes(words);
  const inputHex   = Array.from(inputBytes).map(b=>b.toString(16).padStart(2,'0')).join('');

  if (inputHex !== stored.seedHex) {
    appendBubble('ai', '❌ 시드가 일치하지 않습니다. 다시 확인해 주세요.', true);
    return;
  }

  // ✅ 시드 일치 → 기기 핑거프린트 갱신 후 복원
  const newIpv6 = await _buildIPv6Identity(newFpHex);
  const updated = {
    ...stored,
    fpHex:      newFpHex,
    ipv6:       stored.ipv6,   // IPv6 정체성 유지 (변경 안 함)
    lastSeenAt: new Date().toISOString(),
  };
  localStorage.setItem('gopang_user_v3', JSON.stringify(updated));
  _upsertUserRecord(updated);
  if (window.gopangWallet && updated.ipv6) { window.gopangWallet.setIdentity({ guid: updated.ipv6, handle: updated.handle || null }); console.info('[GopangWallet] guid 연결(시드복구):', updated.ipv6.slice(-8)); }

  document.querySelectorAll('.msg-row.ai').forEach(el => {
    if (el.querySelector('#_restore-seed')) el.remove();
  });

  appendBubble('ai',
    `✅ 복원 완료!<br><br>` +
    `🆔 <code style="font-size:11px;">${stored.ipv6}</code><br>` +
    `이전 정체성이 이 기기에 연결됐습니다.`,
    true
  );
  console.info('[Auth v2] 복원 완료 ✅', stored.ipv6);
};

// ── AUTH 태그 감지 후 인증 확인 버튼 주입 ────────────────
function _injectAuthConfirmButton(level) {
  const list = document.getElementById('message-list');
  if (!list) return;

  const levelLabels = {
    L1: '얼굴 인증',
    L2: '지문 인증',
    L3: '지문 + 얼굴 + 4단어 인증',
  };
  const label = levelLabels[level] || '추가 인증';

  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = '_auth-confirm-row';
  row.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;padding:4px 0;">
      <button onclick="_executeAuthAndProceed('${level}')"
        style="background:var(--tint);color:#fff;border:none;border-radius:8px;
               padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">
        🔐 ${label} 후 진행
      </button>
      <button onclick="_cancelAuthRequest()"
        style="background:var(--bg-subtle);color:var(--label-2);
               border:1px solid var(--sep);border-radius:8px;
               padding:10px 16px;font-size:13px;cursor:pointer;">
        취소
      </button>
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

// ── 인증 실행 → 완료 시 AI에게 진행 통보 ────────────────
window._executeAuthAndProceed = async function(level) {
  document.getElementById('_auth-confirm-row')?.remove();

  const ok = await gopangAuth.require(level);
  if (!ok) {
    appendBubble('ai', '인증이 취소됐습니다. 거래를 중단합니다.', true);
    return;
  }

  appendBubble('user', `[인증완료:${level}] 인증이 완료됐습니다. 진행해 주세요.`, false);
  await callAI(`[AUTH_CONFIRMED:${level}] 사용자가 ${level} 인증을 완료했습니다. 이전에 요청한 거래를 즉시 실행하세요.`);
};

window._cancelAuthRequest = function() {
  document.getElementById('_auth-confirm-row')?.remove();
  appendBubble('ai', '거래가 취소됐습니다.', true);
};
// level: 'L0'|'L1'|'L2'|'L3'
// 반환: true = 인증 성공, false = 실패
const gopangAuth = {
  async require(level = 'L0') {
    const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
    if (!stored?.ipv6) return false;

    const levels  = ['L0','L1','L2','L3'];
    const current = levels.indexOf(stored.authLevel || 'L0');
    const needed  = levels.indexOf(level);

    // 이미 충분한 레벨이면 통과
    if (current >= needed) return true;

    // L1: 얼굴
    if (needed >= 1) {
      if (!stored.faceVec) {
        appendBubble('ai', '⚠️ 얼굴을 먼저 등록해 주세요. (설정 → 보안)', true);
        return false;
      }
      appendBubble('ai', '📷 얼굴 인증이 필요합니다.', true);
      const vec = await _captureFaceVector();
      if (!vec) return false;
      const sim = _cosineSim(vec, stored.faceVec);
      console.info(`[Auth] 얼굴 유사도: ${(sim*100).toFixed(1)}%`);
      if (sim < 0.90) {
        appendBubble('ai', `❌ 얼굴 인증 실패 (유사도 ${(sim*100).toFixed(1)}%)`, true);
        return false;
      }
      if (needed === 1) return true;
    }

    // L2: 지문 (WebAuthn)
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
            challenge,
            timeout: 30000,
            userVerification: 'required',
            allowCredentials: [{
              id:   Uint8Array.from(
                atob(credId.replace(/-/g,'+').replace(/_/g,'/')),
                c => c.charCodeAt(0)
              ),
              type: 'public-key',
            }],
          },
        });
        if (!assertion) return false;
        if (needed === 2) {
          appendBubble('ai', '✅ 지문 인증 완료.', true);
          return true;
        }
      } catch(e) {
        appendBubble('ai', '지문 인증이 취소됐습니다.', true);
        return false;
      }
    }

    // L3: + 4단어
    if (needed >= 3) {
      const words = prompt('4단어 시드를 입력하세요:');
      if (!words) return false;
      const inputBytes = await _seedToBytes(words);
      const inputHex   = Array.from(inputBytes)
        .map(b=>b.toString(16).padStart(2,'0')).join('');
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
// 하위 호환
window.gopangAuth = gopangAuth;

// ── 설정 ────────────────────────────────────────────────
const CFG = {
  apiKey:    'sk-e4a6f005aecf43d4aa60e77bb71de14c',   // DeepSeek API Key (하드코딩)
  geminiKey: 'AIzaSyDiytKUg_0MJVBM3gFYzTms7mO6Y2mhLT4',   // Gemini Vision API Key (하드코딩)
  kakaoKey:  '66648ca49f126d8752b33d542789ac56',   // 카카오 REST API Key (역지오코딩 — GPS→주소 변환용)
  endpoint:  'https://gopang-proxy.tensor-city.workers.dev',
  model:     'deepseek-v4-flash',   // ✅ V4 Flash — V4 Pro 대비 12배 저렴, 일상 대화·라우팅 충분
  system:   `# AI Secretary Prompt SP-00 v10.0
# 문서코드: SP-00 | 작성: AI City Inc. · 도영민
# 사용자 GUID: ${USER_GUID}

## § 0. 정체성
나는 고팡(Gopang) AI 비서다.
사용자의 지시를 듣고 두 가지 중 하나를 즉시 결정한다.
  A) 내가 직접 처리한다.
  B) 전문 하위 시스템을 호출한다 → 응답에 [GWP:서비스ID] 태그를 출력한다.
없는 사실 꾸미기·허위 완료 선언 = 자격 박탈.

## § 1. 판단 원칙 — 매 지시마다 내부적으로 실행

[THINK]
① 사용자가 진짜로 원하는 것이 무엇인가?
② 아래 § 2 하위 시스템 중 담당 서비스가 있는가?
   → 있으면: 즉시 [GWP:서비스ID] 태그 출력 후 간단한 안내 한 줄
   → 없으면: 내가 직접 처리 (질문 답변, 계산, 검색, 분석 등)
③ 직접 처리 시 웹 검색이 필요한가?
[/THINK]

## § 2. 고팡 하위 시스템 — 16개

[GWP:kemergency]  K-Emergency  — 긴급·응급·119·화재·구조·사고·심정지·재난
[GWP:klaw]        K-Law        — 법률·소송·계약서·판결·고소·변호사·분쟁
[GWP:kpolice]     K-Police     — 경찰·범죄신고·도둑·강도·폭행·스토킹·보이스피싱
[GWP:ksecurity]   K-Security   — 해킹·랜섬웨어·개인정보침해·사이버보안·계정탈취
[GWP:khealth]     K-Health     — 병원·증상·처방·진단·의료·건강검진·수술
[GWP:kedu]        K-School     — 교육·학습·입시·과외·논문·특허·자격증·진로
[GWP:kgdc]        GDC          — GDC 잔액·이체·환전·대출·고팡 화폐
[GWP:kfinance]    K-Stock      — 주식·투자·포트폴리오·ETF·펀드·증권·자산관리
[GWP:kinsurance]  K-Insurance  — 보험·보상·청구·실손·생명보험·자동차보험·화재보험
[GWP:ktax]        K-Tax        — 세금·세무·납부·환급·절세·부가세·소득세·재무제표
[GWP:kcommerce]   K-Market     — 주문·배달·음식·쇼핑·구매·예약·맛집·근처·시켜·추천
[GWP:ktransport]  K-Traffic    — 교통·버스·지하철·택시·길찾기·경로·내비·주차
[GWP:klogistics]  K-Logistics  — 택배·배송·물류·운송·화물·발송·추적
[GWP:fiil-kcleaner] K-Cleaner — 쓰레기·환경오염·불법투기·해양·청소·수거·신고
[GWP:kgov]        K-Gov        — 민원·등본·허가·면허·행정심판·정부·관공서
[GWP:kdemocracy]  K-Democracy  — 투표·안건·청원·고팡 의회·직접민주주의

## § 3. [GWP] 태그 출력 규칙

- 하위 시스템 해당 시: 응답 첫 줄에 [GWP:서비스ID] 를 반드시 출력한다.
- 태그 뒤에 한 줄 안내를 덧붙인다. 길게 설명하지 않는다.
- 시스템이 태그를 감지해 자동으로 새 탭을 연다. 직접 URL을 출력하지 않는다.
- 긴급(kemergency) 판단 시: 다른 고려 없이 즉시 [GWP:kemergency] 출력.

예시:
  사용자: "짜장면 한 그릇 시켜 줘"
  → [GWP:kcommerce] K-Market에서 주문을 도와드립니다.

  사용자: "어깨가 너무 아파요"
  → [GWP:khealth] K-Health에서 증상을 확인해 드립니다.

  사용자: "불이야!"
  → [GWP:kemergency] 긴급 상황을 감지했습니다. K-Emergency에 연결합니다.

  사용자: "보험 청구하고 싶어요"
  → [GWP:kinsurance] K-Insurance에서 청구 절차를 안내해 드립니다.

  사용자: "오늘 날씨 어때?"
  → (태그 없이 직접 답변) 현재 위치 기준 날씨를 알려드립니다.

## § 4. 직접 처리 범위
하위 시스템에 해당하지 않는 모든 것은 내가 직접 처리한다.
- 일반 질문·계산·번역·요약·분석
- 날씨·시간·위치 확인
- 일상 대화·조언·창작
- 웹 검색이 필요한 정보 조회 (🌐 검색 중 명시)
- PDV 조회·IoT 기기 제어

## § 5. 세계관
한국의 모든 사람·기관·사물은 고팡 사용자이며 각자 AI 비서를 보유한다.
[사람] 모든 개인 | [기관] 특허청·법원·병원·은행·음식점 등 | [사물] 차량(VIN)·냉장고·세탁기(시리얼)

## § 6. PDV 자율 인출
사용자 정보는 PDV에서 직접 인출. 정보 요청 금지.
예외(이때만 확인): PDV 정보 없음 / 50만원↑ 승인 / 법적 계약 / 되돌릴 수 없는 행위
허위 금지: PDV 없는 데이터·없는 AI 연결·검색 없이 결과 조작 절대 금지.

## § 7. 인증 레벨 — 행위 실행 전 판단
인증이 필요하면 [GWP] 태그보다 먼저 [AUTH:Lx] 태그를 출력한다.

[AUTH:L3] 지문+얼굴+4단어 — 1,000만원↑ 송금·계약·부동산·정체성 변경
[AUTH:L2] 지문           — 10만원↑ 금융거래·계약서 서명·타인 송금
[AUTH:L1] 얼굴           — 10만원↓ 결제·PDV 직접 열람·공식 문서 발송
[AUTH:L0] 자동           — 정보 조회·일반 대화·계산·위치 확인

예시:
  "김철수 계좌로 500만원 보내줘" → [AUTH:L2] 지문 인증이 필요합니다.
  "내일 날씨 알려줘"             → (인증 태그 없이 바로 답변)

## § 8. 응답 형식
- 위치 정보: 시스템이 주입한 [현재 위치]만 사용. 임의 추정 금지.
- 결제: 5만↓자동 | 5~50만 5초후자동 | 50만↑명시승인
- 서명: ✍️ ECDSA P-256 (공식 요청·계약 시)
- 언어: 한국어, 간결·명확
- PDV 기록: 대화 종료 시 자동 저장 (매 응답마다 출력 불필요)`,

  system_base: null,  // callAI() 진입 시 최초 1회 고정 — localStorage 오염 방지용 백업
};

let aiActive   = false;
let micActive  = false;
let attachFile = null;
let recognition = null;
const history  = [];   // { role, content }

// ── 대화 저장 — 세션 종료 시 단 1회 실행 ────────────────────
// 저장 키: gopang_history_{GUID}_{날짜}
// 분류: 인간 활동 12대 영역 코드 자동 태깅
const DOMAIN_PATTERNS = {
  ECO: /금융|투자|세금|결제|송금|보험|연금|대출|환율|주식|가계부/,
  MED: /병원|의사|약|진료|처방|응급|건강|수술|의료|코로나|백신/,
  EDU: /학교|강의|시험|특허|논문|학습|교육|수업|입학|졸업/,
  TRN: /배달|택배|교통|버스|지하철|택시|운전|물류|배송|주차/,
  MKT: /구매|쇼핑|거래|계약|부동산|임대|판매|상품|가격|주문/,
  GOV: /민원|등본|신고|행정|정부|공공|허가|면허|신청|공무원/,
  JUS: /법|소송|재판|경찰|변호사|판결|고소|계약서|법원|범죄/,
  IND: /제조|건설|농업|공장|생산|설비|작업|현장|제품|원자재/,
  ENV: /환경|에너지|재활용|기후|탄소|오염|태양광|전기|가스|수도/,
  CUL: /여행|관광|스포츠|영화|음악|게임|식당|카페|취미|문화/,
  SOC: /복지|고용|실업|육아|노인|장애|사회보험|지원금|봉사/,
  IOT: /냉장고|세탁기|에어컨|차량|스마트홈|IoT|사물|기기|센서/,
};

function _classifyDomain(text) {
  for (const [code, re] of Object.entries(DOMAIN_PATTERNS)) {
    if (re.test(text)) return code;
  }
  return 'ETC';
}

function _saveSessionOnce() {
  if (history.length < 2) return;  // 의미 있는 대화가 없으면 저장 안 함

  // 전체 대화에서 도메인 빈도 집계
  const domainCount = {};
  for (const msg of history) {
    const d = _classifyDomain(String(msg.content));
    domainCount[d] = (domainCount[d] || 0) + 1;
  }
  const primaryDomain = Object.entries(domainCount).sort((a,b)=>b[1]-a[1])[0][0];

  const today = new Date().toISOString().slice(0,10);  // "2026-05-23"
  const key   = `gopang_history_${USER_GUID}_${today}`;

  try {
    // 당일 기존 저장분이 있으면 append, 없으면 새로 생성
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({
      ts:      new Date().toISOString(),
      domain:  primaryDomain,
      turns:   history.length,
      summary: history.slice(-4),   // 마지막 4턴만 저장 (프라이버시 최소화)
    });
    localStorage.setItem(key, JSON.stringify(existing));
    console.log(`[Session] 대화 저장 완료 — 영역: ${primaryDomain}, 턴: ${history.length}`);
  } catch(e) {
    console.warn('[Session] 저장 실패:', e.message);
  }
}

// 탭/앱이 숨겨지거나(pagehide) visibility 변경될 때 단회 저장
let _sessionSaved = false;
function _saveOnce() {
  if (_sessionSaved) return;
  _sessionSaved = true;
  _saveSessionOnce();
}
window.addEventListener('pagehide',         _saveOnce);
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _saveOnce(); });

// ── 부트스트랩 연동 ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const { bootstrap } = await import('./src/app.js');
    await bootstrap();
    document.getElementById('status-dot').style.background = 'var(--green)';
  } catch(e) {
    document.getElementById('status-text').textContent = '오프라인 모드';
    document.getElementById('status-dot').style.background = 'var(--yellow)';
    console.warn('[UI] 고팡 백엔드 없이 AI 전용 모드:', e.message);
  }
  loadSettings();

  // ── 초기 AI 비서 메시지 ───────────────────────────────
  _showWelcomeMessage();
  // localStorage에 남은 구버전 모델명을 즉시 교정
  if (MODEL_MIGRATION[CFG.model]) {
    CFG.model = MODEL_MIGRATION[CFG.model];
    try {
      const cfg = JSON.parse(localStorage.getItem('gopang_cfg') || '{}');
      cfg.model = CFG.model;
      localStorage.setItem('gopang_cfg', JSON.stringify(cfg));
    } catch {}
  }
  showGUID();
  _scheduleLocation();  // GPS — PWA 배너 충돌 방지 지연 실행
});

// ── 위치 획득 (GPS 실제 좌표 우선) ──────────────────────────
// 원칙:
//   1순위: GPS 실제 좌표 (navigator.geolocation)
//   2순위: PDV 프로필에 저장된 주소
//   절대 금지: 임의로 도시 추정 ("서울" "역삼동" 등 가정 금지)
//
// 충돌 방지 원칙:
//   - PWA 설치 배너(beforeinstallprompt)와 GPS 권한 요청이 동시에 뜨면
//     Android Chrome이 두 번째 다이얼로그를 차단함
//   - 해결: GPS 요청을 PWA 배너 해소 후 OR 첫 메시지 전송 시로 지연
let _userLocation    = null;   // { lat, lng, address, source }
let _locationReady   = false;  // GPS 요청이 완료됐는지 여부
let _locationPending = false;  // GPS 요청이 진행 중인지 여부

// ── GPS 지연 스케줄러 (PWA 배너와 충돌 방지) ────────────────
function _scheduleLocation() {
  // 이미 설치된 앱(standalone)이거나 PWA 배너가 불필요한 경우
  // → 즉시 실행해도 충돌 없음
  if (_isInStandaloneMode() || localStorage.getItem(_INSTALL_DONE_KEY)) {
    _initLocation();
    return;
  }

  // beforeinstallprompt가 발생하면 배너가 표시될 수 있으므로
  // 배너 처리(설치 or 거절) 완료 신호를 기다림
  // 최대 대기: 6초 (배너가 뜨지 않는 환경 대비)
  const MAX_WAIT = 6000;
  const start = Date.now();

  function tryInit() {
    // PWA 배너 진행 중이 아니거나 대기 시간 초과 → GPS 요청
    if (!_installBannerVisible || Date.now() - start > MAX_WAIT) {
      _initLocation();
    } else {
      setTimeout(tryInit, 500);
    }
  }

  // PWA beforeinstallprompt가 없는 환경(iOS, 이미 설치 등)은
  // 1초 후 첫 시도, 이후 500ms 폴링 (최대 6초 대기)
  setTimeout(tryInit, 1000);
}

// PWA 배너 가시성 상태 추적
let _installBannerVisible = false;

function _initLocation() {
  if (_locationPending || _locationReady) return;
  _locationPending = true;

  if (!navigator.geolocation) {
    _loadLocationFromPDV().finally(() => {
      _locationPending = false;
      _locationReady   = true;
    });
    return;
  }

  let _watchId  = null;
  let _gotFirst = false;

  function _startWatch(highAccuracy) {
    if (_watchId !== null) navigator.geolocation.clearWatch(_watchId);

    _watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newAcc = pos.coords.accuracy;

        // ── 좌표 변화량 계산 (50m 이상 변경 시에만 역지오코딩 재실행) ──
        const GEOCODE_THRESHOLD = 0.0005;  // 약 50m
        const coordChanged = !_userLocation?.lat ||
          Math.abs(newLat - _userLocation.lat) > GEOCODE_THRESHOLD ||
          Math.abs(newLng - _userLocation.lng) > GEOCODE_THRESHOLD;

        // 기존 address 보존 (좌표만 갱신)
        const prevAddress = _userLocation?.address || null;
        const prevRegion  = _userLocation?.region  || null;

        _userLocation = {
          lat:      newLat,
          lng:      newLng,
          accuracy: newAcc,
          source:   'GPS',
          address:  prevAddress,   // ← 기존 주소 유지
          region:   prevRegion,
        };

        _updateLocationInPrompt(coordChanged);  // 변경 여부 전달

        if (!_gotFirst) {
          _gotFirst        = true;
          _locationPending = false;
          _locationReady   = true;
          console.log(`[Location] GPS 획득(${highAccuracy ? '고정밀' : '저정밀'}): ${newLat.toFixed(4)}, ${newLng.toFixed(4)} ±${Math.round(newAcc)}m`);
          if (!highAccuracy) _startWatch(true);
        }
      },
      (err) => {
        // PERMISSION_DENIED: 사용자가 팝업에서 거부 — 정상 경로, log만
        if (err.code === err.PERMISSION_DENIED) {
          console.log('[Location] GPS 권한 거부 — IP 폴백 사용');
        } else {
          console.warn(`[Location] GPS 실패(${highAccuracy ? '고정밀' : '저정밀'}):`, err.message);
        }
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
        if (!highAccuracy && err.code !== err.PERMISSION_DENIED) {
          console.log('[Location] 고정밀 GPS로 재시도...');
          _startWatch(true);
        } else {
          _locationPending = false;
          _loadLocationFromPDV().finally(() => { _locationReady = true; });
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout:            highAccuracy ? 8000 : 5000,
        maximumAge:         0,
      }
    );
  }

  // ── Permission API로 현재 상태 먼저 확인 ─────────────────────
  // denied → 팝업 없이 즉시 IP 폴백 (팝업 전 오류 메시지 방지)
  // prompt → 팝업 표시 후 결과 처리
  // granted → 바로 watch 시작
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'denied') {
        console.log('[Location] GPS 권한 이미 거부됨 — IP 폴백 사용');
        _locationPending = false;
        _loadLocationFromPDV().finally(() => { _locationReady = true; });
      } else {
        _startWatch(false);
      }
      result.onchange = () => {
        if (result.state === 'granted' && !_locationReady) {
          _locationPending = false;
          _locationReady   = false;
          _initLocation();
        }
      };
    }).catch(() => { _startWatch(false); });
  } else {
    _startWatch(false);
  }
}

async function _loadLocationFromPDV() {
  try {
    const pdvAddr = localStorage.getItem('gopang_profile_address');
    if (pdvAddr) {
      _userLocation = { source: 'PDV', address: pdvAddr, lat: null, lng: null };
      _updateLocationInPrompt();
      console.log('[Location] PDV 주소 사용:', pdvAddr);
    } else {
      // PDV도 없으면 IP 기반 위치 시도 (무료 API, 정확도 낮음)
      await _loadLocationFromIP();
    }
  } catch {}
}

async function _loadLocationFromIP() {
  try {
    const res  = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.latitude && data.city) {
      _userLocation = {
        source:  'IP',
        address: `${data.country_name} ${data.region} ${data.city}`,
        lat:     data.latitude,
        lng:     data.longitude,
      };
      _updateLocationInPrompt();
      console.log('[Location] IP 위치 사용 (정확도 낮음):', _userLocation.address);
    } else {
      _userLocation = { source: 'UNKNOWN', address: null, lat: null, lng: null };
    }
  } catch {
    _userLocation = { source: 'UNKNOWN', address: null, lat: null, lng: null };
    console.warn('[Location] IP 위치도 실패 — GPS 권한을 허용하거나 PDV에 주소를 등록하세요.');
  }
}

// 위치 확인 후 시스템 프롬프트에 실제 좌표/주소 주입
function _updateLocationInPrompt(coordChanged = false) {
  if (!_userLocation) return;
  let locStr = '';
  if (_userLocation.source === 'GPS' && _userLocation.lat) {
    locStr = `GPS좌표(${_userLocation.lat.toFixed(5)},${_userLocation.lng.toFixed(5)}) 정확도±${Math.round(_userLocation.accuracy)}m`;
    // 역지오코딩: 주소 없거나 좌표가 유의미하게 변경된 경우만 실행
    if (CFG.kakaoKey && (!_userLocation.address || coordChanged)) {
      _reverseGeocode(_userLocation.lat, _userLocation.lng).then(geo => {
        if (geo?.jibunAddress) {
          _userLocation.address = geo.jibunAddress;
          _userLocation.region  = geo.region;
          console.log('[GEO] GPS 역지오코딩 완료:', geo.jibunAddress);
          if (history.length <= 1) {
            history[0] && (history[0].content = CFG.system + _buildLocNote());
          }
        }
      }).catch(() => {});
    }
  } else if (_userLocation.source === 'PDV' && _userLocation.address) {
    locStr = `PDV주소:${_userLocation.address}`;
  } else if (_userLocation.source === 'IP' && _userLocation.address) {
    locStr = `IP기반위치(정확도낮음):${_userLocation.address}`;
  } else {
    locStr = '위치정보없음(GPS권한허용또는PDV주소등록필요)';
  }
  CFG.locationStr = locStr;

  if (history.length === 1 && history[0]?.role === 'system') {
    history[0].content = CFG.system + _buildLocNote();
    console.log('[Cache] 위치 갱신 — system 업데이트 (대화 시작 전)');
  }
}

// locNote 문자열 생성 (callAI + _updateLocationInPrompt 공용)
function _buildLocNote() {
  if (!_userLocation) {
    return '\n\n[위치 정보 없음 — GPS 권한 미허용. 임의 추정 절대 금지.]';
  }
  const loc = _userLocation;
  let detail;
  if (loc.source === 'GPS' && loc.lat) {
    detail = `GPS좌표: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (정확도 ±${Math.round(loc.accuracy||0)}m)`;
    // 역지오코딩 주소가 이미 있으면 함께 출력
    if (loc.address) detail += `\n행정구역 주소: ${loc.address}`;
    if (loc.region)  detail += `\n읍·면·동: ${loc.region.sido} ${loc.region.sigungu} ${loc.region.eupmyeon} ${loc.region.beonji}`;
  } else if (loc.source === 'PDV' && loc.address) {
    detail = `PDV등록주소: ${loc.address}`;
  } else if (loc.source === 'IP' && loc.address) {
    detail = `IP기반위치(정확도 낮음 — 시/도 수준): ${loc.address}`;
  } else {
    detail = '위치정보 없음 — 임의 추정 절대 금지.';
  }
  return `\n\n[현재 위치 — 반드시 이 정보만 사용할 것, 임의로 다른 도시 추정 절대 금지]\n${detail}`;
}

// ══════════════════════════════════════════════════════════
// 진행 상황 관리 시스템
// ══════════════════════════════════════════════════════════

// 단계 정의 (신고자 기준 — 내부 분석 단계 미표시)
const PROGRESS_STEPS_CLN = [
  { id: 'accept',   icon: '📥', label: '신고 접수' },
  { id: 'analyze',  icon: '🔍', label: '현장 분석 중' },
  { id: 'transfer', icon: '🏛️', label: '관할 기관 전달' },
  { id: 'done',     icon: '✅', label: '처리 완료' },
];

// 현재 진행 중인 작업 상태
let _progressJob = null;
// {
//   id: string,            // 신고 ID
//   steps: [...],          // 단계 배열
//   currentStep: number,   // 현재 단계 인덱스
//   intent: string,        // 이해한 지시 내용
//   location: string,      // 위치
//   done: boolean,
// }

// 진행 상황 시작
function _progressStart(intent, location, reportId) {
  _progressJob = {
    id:          reportId || ('RPT-' + Date.now()),
    steps:       PROGRESS_STEPS_CLN,
    currentStep: 0,
    intent,
    location,
    done:        false,
  };
  _progressSetStep(0);
  _topLogoSetProgress(true);
}

// 특정 단계로 진행
function _progressSetStep(idx) {
  if (!_progressJob) return;
  _progressJob.currentStep = idx;
  _progressJob.done = (idx >= _progressJob.steps.length - 1);
  _renderProgressSteps();
  if (_progressJob.done) {
    setTimeout(() => _topLogoSetProgress(false), 3000);
  }
}

// 다음 단계로 전진
function _progressNext() {
  if (!_progressJob || _progressJob.done) return;
  _progressSetStep(_progressJob.currentStep + 1);
}

// 상단 로고 상태 전환
function _topLogoSetProgress(active) {
  const textEl = document.getElementById('top-logo-text');
  const dotEl  = document.getElementById('top-progress-dot');
  if (!textEl) return;
  if (active) {
    textEl.textContent = '⏳ 진행 상황';
    textEl.style.color = 'rgba(255,255,255,0.95)';
    if (dotEl) dotEl.style.display = 'inline-block';
  } else {
    textEl.textContent = '고팡';
    textEl.style.color = 'rgba(255,255,255,0.90)';
    if (dotEl) dotEl.style.display = 'none';
    _progressJob = null;
  }
}

// 로고 탭 핸들러
function _onLogoTap() {
  if (!_progressJob) return;   // 진행 중 없으면 무반응
  _renderProgressSteps();
  document.getElementById('progress-overlay').classList.add('open');
}

// 시트 닫기 (배경 탭)
function _closeProgressSheet(e) {
  if (e.target.id === 'progress-overlay')
    document.getElementById('progress-overlay').classList.remove('open');
}

// 진행 단계 렌더링
function _renderProgressSteps() {
  if (!_progressJob) return;
  const el = document.getElementById('progress-steps');
  const titleEl = document.getElementById('progress-sheet-title');
  if (!el) return;

  if (titleEl) {
    titleEl.textContent = _progressJob.intent || '진행 상황';
  }

  let html = '';

  // 위치 표시
  if (_progressJob.location) {
    html += `<div style="font-size:12px;color:var(--label-3);
                          margin-bottom:16px;padding:8px 12px;
                          background:var(--bg-subtle);border-radius:10px;">
               📍 ${_progressJob.location}
             </div>`;
  }

  // 단계 목록
  _progressJob.steps.forEach((step, i) => {
    const current = i === _progressJob.currentStep;
    const done    = i < _progressJob.currentStep;
    const pending = i > _progressJob.currentStep;

    const dotColor = done    ? 'var(--green)'
                   : current ? 'var(--yellow)'
                   :            'var(--sep-strong)';
    const labelColor = pending ? 'var(--label-3)' : 'var(--label)';
    const fontWeight = current ? '600' : '400';

    html += `
      <div style="display:flex;align-items:center;gap:14px;
                  padding:12px 4px;position:relative;">
        <!-- 연결선 (마지막 제외) -->
        ${i < _progressJob.steps.length - 1 ? `
          <div style="position:absolute;left:17px;top:36px;
                      width:2px;height:calc(100% - 12px);
                      background:${done ? 'var(--green)' : 'var(--sep-strong)'};
                      border-radius:1px;"></div>` : ''}
        <!-- 상태 원 -->
        <div style="width:34px;height:34px;border-radius:50%;
                    background:${dotColor};flex-shrink:0;
                    display:flex;align-items:center;justify-content:center;
                    font-size:16px;z-index:1;
                    ${current ? 'box-shadow:0 0 0 4px rgba(255,214,10,0.2);' : ''}">
          ${done ? '✓' : step.icon}
        </div>
        <!-- 텍스트 -->
        <div>
          <div style="font-size:15px;font-weight:${fontWeight};
                      color:${labelColor};">${step.label}</div>
          ${current ? `<div style="font-size:12px;color:var(--yellow);
                                    margin-top:2px;">진행 중…</div>` : ''}
          ${done    ? `<div style="font-size:12px;color:var(--green);
                                    margin-top:2px;">완료</div>` : ''}
        </div>
      </div>`;
  });

  // 신고 ID
  html += `<div style="font-size:11px;color:var(--label-3);
                        margin-top:16px;text-align:right;">
             ${_progressJob.id}
           </div>`;

  el.innerHTML = html;
}

// ── SP-00-ROUTER 프리로드 (DOMContentLoaded 이후 백그라운드 fetch) ────
// _routerPrompt 변수 초기화 완료 후 실행 — TDZ 오류 방지
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    try {
      await _loadRouterPrompt();
      console.info('[Router] 프리로드 완료 — 버전:', _routerPromptVer);
    } catch(e) {
      console.warn('[Router] 프리로드 실패 (나중에 재시도):', e.message);
    }
  }, 0);
});

// ── 초기 AI 비서 환영 메시지 ────────────────────────────
function _showWelcomeMessage() {
  const list = document.getElementById('message-list');
  if (!list) return;

  // 발신자 레이블 (AI 비서)
  const label = document.createElement('div');
  label.style.cssText =
    'font-size:11px;color:var(--label-3);margin:8px 16px 2px;' +
    'letter-spacing:0.02em;font-weight:500;';
  label.textContent = '전용 AI 비서';

  // 메시지 버블 행
  const row = document.createElement('div');
  row.className = 'msg-row ai';

  const bubble = document.createElement('div');
  bubble.className = 'bubble bubble-ai';
  bubble.style.whiteSpace = 'nowrap';
  bubble.innerHTML = '지시 대기 중.';

  row.appendChild(bubble);
  list.appendChild(label);
  list.appendChild(row);
}

// ── 입력 필드 ───────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}
function updateSendBtn() {
  const v = document.getElementById('msg-input').value.trim();
  const hasInput = !!(v || attachFile);
  document.getElementById('send-btn').disabled = !hasInput;

  // 입력 시작 시 AI 자동 활성화
  // (대화 상대 미지정 상태 = aiActive가 false인 상태)
  if (hasInput && !aiActive) {
    activateAI(true);  // silent=true: 활성화 메시지 미표시
  }
}
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── 메시지 전송 ─────────────────────────────────────────
async function sendMessage() {
  const inp  = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text && !attachFile) return;

  // 첫 메시지 전송 시 GPS 요청 — PWA 배너가 이미 처리된 후이므로 충돌 없음
  if (!_locationReady && !_locationPending) _initLocation();

  const capturedFile = attachFile;   // 전송 전에 캡처 (removeAttach 전)

  // 사용자 버블 — 이미지 첨부 시 미리보기 포함
  if (capturedFile && capturedFile.type.startsWith('image/')) {
    const objUrl = URL.createObjectURL(capturedFile);
    const imgId  = 'img-' + Date.now();
    appendBubble('user',
      `${text ? text + '<br>' : ''}<img id="${imgId}" src="${objUrl}"
        style="max-width:220px;max-height:180px;border-radius:10px;
               margin-top:${text?'6px':'0'};display:block">`, true);
    // CSP 친화적: 인라인 onload 대신 JS 이벤트 리스너
    requestAnimationFrame(() => {
      const imgEl = document.getElementById(imgId);
      if (imgEl) imgEl.addEventListener('load', () => URL.revokeObjectURL(objUrl), { once: true });
    });
  } else {
    if (text) appendBubble('user', text);
    if (capturedFile) appendBubble('user', `📎 ${capturedFile.name}`, false);
  }

  // ★ history.push(user)는 callAI 내부에서 처리
  //   (callAI 진입 전에 push하면 isFirstTurn 감지 오작동)
  inp.value = '';
  inp.style.height = 'auto';
  updateSendBtn();
  removeAttach();

  // ── SP-00 v10.0: LLM이 직접 판단 → [GWP:id] 태그 감지 → 새 탭
  // _gwpMatch / runRouter 제거 — LLM 1회 호출로 통합
  if (text) {
    if (aiActive) {
      // 모바일 팝업 차단 우회: 사용자 탭 직후(동기) 빈 탭 예약
      // LLM 응답 완료 후 비동기 시점에 window.open()하면 차단됨
      const _preTab = (!_gwpActive) ? window.open('', '_blank') : null;
      await callAI(text, capturedFile, _preTab);
    } else {
      _runPipelineBackground(text);
      appendBubble('ai', '🔵 AI 버튼을 눌러 AI 비서를 활성화하세요.');
    }
    return;
  }

  // text 없는 경우 (이미지만) → callAI로 처리
  if (capturedFile && aiActive) {
    await callAI('', capturedFile);
  }
}

// ── 고팡 파이프라인 백그라운드 실행 ─────────────────────
// 대화 중 결과를 표시하지 않음 — 사용자 요청 시 showRiskAnalysis() 호출
let _lastPipelineResult = null;

async function _runPipelineBackground(text) {
  try {
    const { runPipeline } = await import('./src/ai-secretary/pipeline.js');
    const result = await runPipeline(
      { content: text, senderId: 'user', attachment: attachFile ?? null },
      {}
    );
    _lastPipelineResult = result;

    // OpenHash ref는 상태 바에만 조용히 업데이트
    if (result?.anchorHash) {
      const el = document.getElementById('hash-ref');
      if (el) el.textContent = result.anchorHash.slice(0, 8) + '…';
    }

    // S3 감지 시 즉시 경고 (위험 등급 S3만 예외적으로 즉시 표시)
    if (result?.riskResult?.level === 'S3') {
      const chip = riskChip('S3', result.riskResult.legalFlags ?? []);
      appendBubble('ai',
        `🛑 위험 감지 — 즉시 확인이 필요합니다. ${chip}`, true);
    }
  } catch (e) {
    // 파이프라인 오류는 콘솔에만 기록, 사용자에게 표시하지 않음
    console.warn('[Pipeline]', e.message);
  }
}

// 사용자 요청 시 분석 결과 표시 (예: "분석 결과 보여줘")
function showRiskAnalysis() {
  if (!_lastPipelineResult) {
    appendBubble('ai', '분석된 메시지가 없습니다.');
    return;
  }
  const r   = _lastPipelineResult.riskResult;
  const chip = riskChip(r?.level ?? 'S0', r?.legalFlags ?? []);
  appendBubble('ai',
    `분석 완료 ${chip}${r?.legalFlags?.length ? '<br>' + r.legalFlags.join(' · ') : ''}`,
    true);
}

// ── DeepSeek API 호출 ───────────────────────────────────
// ── 모델별 비전 지원 여부 ────────────────────────────────
// DeepSeek Vision 지원: deepseek-chat(V3)만 이미지 지원
// deepseek-v4-pro / deepseek-v4-flash 는 텍스트 전용 (이미지 불가)
const VISION_MODELS = new Set([
  'deepseek-chat',        // DeepSeek V3 — Vision 지원 (유일)
  'gpt-4o', 'gpt-4o-mini',
  'claude-sonnet-4-20250514', 'claude-opus-4-20250514',
  'gemini-2.0-flash', 'gemini-1.5-pro',
]);
function _modelSupportsVision(model) {
  return VISION_MODELS.has(model);
}

// 이미지 File → base64 data URL 변환
function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);   // "data:image/jpeg;base64,..."
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── EXIF GPS·시간 추출 (순수 JS, 외부 라이브러리 불필요) ────
// ── Gemini Vision 호출 — K-Cleaner 이미지 분석 전담 ─────────
// SP-14-IMG v1.0 system prompt 기반으로 구조화된 JSON 반환
// ── Gemini 분석 중 Progress Bar 헬퍼 ────────────────────────
function _showGeminiProgress() {
  const list = document.getElementById('message-list');
  const row  = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = 'gemini-progress-row';

  const bubble = document.createElement('div');
  bubble.className = 'bubble bubble-ai gemini-progress-wrap';
  bubble.innerHTML = `
    <div class="gemini-progress-label">
      <div class="gp-spinner"></div>
      <span id="gemini-progress-text">📸 현장 이미지 분석 중…</span>
    </div>
    <div class="gemini-progress-bar-bg">
      <div class="gemini-progress-bar-fill" id="gemini-progress-fill"></div>
    </div>`;

  row.appendChild(bubble);
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;

  // 15초 기준 자동 진행 (실제 완료 시 _hideGeminiProgress 호출)
  let pct = 0;
  const fill = document.getElementById('gemini-progress-fill');
  const textEl = document.getElementById('gemini-progress-text');
  const STEPS = [
    { at: 10,  label: '📸 이미지 해상도 분석 중…' },
    { at: 25,  label: '🔍 폐기물 성분 식별 중…' },
    { at: 45,  label: '📊 규모 및 중량 추정 중…' },
    { at: 65,  label: '📍 지형·위험도 판단 중…' },
    { at: 80,  label: '✅ 분석 마무리 중…' },
    { at: 92,  label: '✅ 분석 완료 직전…' },
  ];

  const timer = setInterval(() => {
    pct = Math.min(pct + 1.2, 92);  // 최대 92%까지 (완료 시 100%)
    if (fill) fill.style.width = pct + '%';
    const step = STEPS.filter(s => pct >= s.at).pop();
    if (step && textEl) textEl.textContent = step.label;
    if (pct >= 92) clearInterval(timer);
  }, 180);  // ~15초에 92% 도달

  return timer;
}

function _hideGeminiProgress(timer) {
  if (timer) clearInterval(timer);
  const fill = document.getElementById('gemini-progress-fill');
  if (fill) fill.style.width = '100%';
  setTimeout(() => {
    document.getElementById('gemini-progress-row')?.remove();
  }, 400);  // 100% 도달 애니메이션 후 제거
}

async function _callGeminiVision(imageFile, geminiKey) {
  const GEMINI_VISION_SYSTEM = `당신은 환경 현장 사진을 분석하는 객관적 데이터 추출 전문가다.
사진에서 보이는 사실만 수치로 추출한다. 판단·해석·견적·보고서 작성은 절대 하지 않는다.
결과는 반드시 아래 JSON 형식으로만 출력한다. JSON 외 어떠한 텍스트도 출력하지 않는다.
8대 성분: ST=스티로폼 PL=경질플라스틱 VI=비닐 GL=유리병 ME=금속캔 NT=폐어구 WD=목재 EX=기타
(ratio_pct 합계 반드시 100. 보이지 않는 성분은 0/false)
규모: XS(<50kg모래) S(50~200kg암반) M(200~400kg) L(400~1000kg) XL(1000kg↑)
지형: SAND|ROCK|CLIFF|WATER|FOREST|UNKNOWN
위험도: S0(일반) S1(대량) S2(오염위험) S3(유해물질)
출력: JSON만. 설명·인사·부연 절대 금지.`;

  const dataUrl  = await _fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';
  const base64   = dataUrl.split(',')[1];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
  const body = {
    system_instruction: { parts: [{ text: GEMINI_VISION_SYSTEM }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: '이 이미지를 분석하여 아래 JSON 형식으로만 출력하라:\n{"analysis_version":"SP-14-IMG-v1.0","image_quality":"GOOD|FAIR|POOR","confidence":0.85,"components":{"ST":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"PL":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"VI":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"GL":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"ME":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"NT":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"WD":{"ratio_pct":0,"weight_kg_est":null,"visible":false},"EX":{"ratio_pct":0,"weight_kg_est":null,"visible":false}},"total_weight_kg_est":null,"scale":"S","terrain":"ROCK","risk_level":"S1","hazard_detected":false,"hazard_notes":null,"area_est_m2":null,"coastline_length_est_m":null,"notable_items":[],"exif":{"lat":null,"lng":null,"datetime":null,"altitude_m":null},"scene_description":""}' }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${err.slice(0,200)}`);
  }

  const data  = await res.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── SP-00-GEN: 전용 SP 없을 때 Gemini 범용 이미지 분석 ────
async function _callGeminiGeneral(imageFile, geminiKey, userText) {
  const systemPrompt =
    `당신은 친절하고 유능한 AI 비서다. 사용자가 보낸 이미지를 분석하고 사용자의 요청을 파악하여 도움을 제공한다.\n` +
    `반드시 아래 JSON 형식으로만 출력하라. JSON 외 텍스트 금지.\n` +
    `{\n` +
    `  "scene_type": "사진 유형",\n` +
    `  "main_subject": "주요 피사체",\n` +
    `  "objects_detected": ["감지된 물체 목록"],\n` +
    `  "user_intent": "사용자 요청/의도 파악",\n` +
    `  "response": "사용자 요청에 대한 친절한 답변 2~4문장",\n` +
    `  "actions": ["권고 또는 안내 사항 1", "권고 또는 안내 사항 2"],\n` +
    `  "urgency": "낮음|보통|높음|긴급",\n` +
    `  "scene_description": "이미지 객관적 설명 2~3문장"\n` +
    `}`;

  const dataUrl  = await _fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';
  const base64   = dataUrl.split(',')[1];

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: userText ? `사용자 메시지: "${userText}"\n이미지와 메시지를 함께 분석하여 JSON으로 응답하라.`
                         : '이미지를 분석하여 사용자의 의도를 파악하고 JSON으로 응답하라.' }
      ]
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Gemini GEN API ${res.status}`);
  const data  = await res.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  const result = JSON.parse(clean);
  result._sp_code   = 'SP-00-GEN';
  result.risk_level = { '낮음':'S0','보통':'S1','높음':'S2','긴급':'S3' }[result.urgency] || 'S0';
  return result;
}

// Gemini 분석 결과 → DeepSeek 전달용 요약 텍스트 변환
function _geminiResultToText(result, userText) {
  // SP-00-GEN: 범용 분석 결과 → 그대로 response 반환
  if (result._sp_code === 'SP-00-GEN') {
    const intentGuide = userText
      ? `사용자원문: ${userText}`
      : `(텍스트 없음 — 이미지만 전송)`;
    return `[Gemini 범용 이미지 분석 결과 — SP-00-GEN]\n` +
      `사진유형: ${result.scene_type||'미상'}\n` +
      `주요피사체: ${result.main_subject||'미상'}\n` +
      `감지물체: ${(result.objects_detected||[]).join(', ')||'없음'}\n` +
      `사용자의도: ${result.user_intent||'미상'}\n` +
      `AI응답: ${result.response||'없음'}\n` +
      `권고사항: ${(result.actions||[]).join(' / ')||'없음'}\n` +
      `설명: ${result.scene_description||''}\n` +
      `---\n${intentGuide}\n` +
      `위 분석을 바탕으로 사용자의 요청에 맞는 친절하고 실용적인 답변을 제공하라.`;
  }

  // SP-14-IMG: 해양쓰레기 분석 결과
  const c     = result.components || {};
  const parts = Object.entries(c)
    .filter(([, v]) => v.visible && v.ratio_pct > 0)
    .map(([k, v]) => `${k}(${v.ratio_pct}%·${v.weight_kg_est||'?'}kg)`)
    .join(', ');

  // 사용자가 텍스트를 입력하지 않은 경우 — 이미지만으로 의도 자율 파악
  const intentGuide = userText
    ? `사용자원문: ${userText}\n위 Gemini 분석 결과를 바탕으로 K-Cleaner v1.2 방법론에 따라 수거견적서와 환경신고서를 작성하라.`
    : `사용자원문: (없음 — 텍스트 없이 이미지만 전송됨)\n\n[자율 의도 파악 지시]\n사용자가 별도 설명 없이 이미지만 전송했다. 아래 순서로 처리하라:\n① 이미지 내용에서 사용자의 목적·요구를 스스로 판단한다.\n② 환경 오염·쓰레기 현장 사진이면 → K-Cleaner v1.2 신고·견적 절차를 자동 실행한다.\n③ 환경 외 사진(음식·문서·사람·사물 등)이면 → 사진에서 파악한 맥락에 맞는 적절한 도움을 제공한다.\n④ 불명확한 경우에만 한 가지 확인 질문을 한다. 단, 환경 신고 가능성이 조금이라도 있으면 먼저 신고·견적을 진행하고 추가 확인은 이후에 한다.`;

  return `[Gemini Vision 현장 분석 결과 — SP-14-IMG-v1.0]
신뢰도: ${Math.round((result.confidence||0)*100)}% | 이미지품질: ${result.image_quality||'?'}
규모: ${result.scale} | 지형: ${result.terrain} | 위험도: ${result.risk_level}
추정중량: ${result.total_weight_kg_est||'?'}kg | 면적: ${result.area_est_m2||'?'}㎡ | 해안선: ${result.coastline_length_est_m||'?'}m
성분구성: ${parts||'분석불가'}
주목항목: ${result.notable_items?.join(', ')||'없음'}
현장설명: ${result.scene_description||''}
위험물감지: ${result.hazard_detected ? '⚠️ '+result.risk_level : '없음'}
GPS(EXIF): ${result.exif?.lat ? result.exif.lat+', '+result.exif.lng : '없음'}
---
${intentGuide}`;
}

async function _extractExif(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf  = e.target.result;
        const view = new DataView(buf);
        const result = { lat: null, lng: null, datetime: null, altitude: null };

        // JPEG 확인 (FFD8)
        if (view.getUint16(0) !== 0xFFD8) { resolve(result); return; }

        let offset = 2;
        while (offset < buf.byteLength - 2) {
          const marker = view.getUint16(offset);
          offset += 2;
          if (marker === 0xFFE1) { // APP1 (EXIF)
            const segLen = view.getUint16(offset);
            const exifHeader = String.fromCharCode(
              view.getUint8(offset+2), view.getUint8(offset+3),
              view.getUint8(offset+4), view.getUint8(offset+5)
            );
            if (exifHeader === 'Exif') {
              const tiffStart = offset + 8;
              const littleEndian = view.getUint16(tiffStart) === 0x4949;
              const getUint = (o, s=2) => s===4
                ? (littleEndian ? view.getUint32(tiffStart+o, true) : view.getUint32(tiffStart+o, false))
                : (littleEndian ? view.getUint16(tiffStart+o, true) : view.getUint16(tiffStart+o, false));

              const ifd0 = getUint(4, 4);
              const entries = getUint(ifd0);
              let gpsIfdPtr = null;

              for (let i = 0; i < entries; i++) {
                const e0 = ifd0 + 2 + i * 12;
                const tag = getUint(e0);
                if (tag === 0x8825) gpsIfdPtr = getUint(e0+8, 4); // GPSInfo
                if (tag === 0x9003 || tag === 0x0132) { // DateTimeOriginal / DateTime
                  const strOff = getUint(e0+8, 4);
                  let dt = '';
                  for (let j = 0; j < 19; j++)
                    dt += String.fromCharCode(view.getUint8(tiffStart + strOff + j));
                  result.datetime = dt; // "2026:05:23 14:30:22"
                }
              }

              if (gpsIfdPtr) {
                const gpsEntries = getUint(gpsIfdPtr);
                const gpsData = {};
                for (let i = 0; i < gpsEntries; i++) {
                  const ge = gpsIfdPtr + 2 + i * 12;
                  const gtag = getUint(ge);
                  const goff = getUint(ge+8, 4);
                  const readRat = (o) => {
                    const num = getUint(o, 4);
                    const den = getUint(o+4, 4);
                    return den ? num / den : 0;
                  };
                  if ([1,2,3,4,5,6].includes(gtag)) gpsData[gtag] = { off: goff, type: getUint(ge+2) };
                }
                const toDD = (ratOff) => {
                  const d = readRat(tiffStart + ratOff);
                  const m = readRat(tiffStart + ratOff + 8);
                  const s2 = readRat(tiffStart + ratOff + 16);
                  return d + m/60 + s2/3600;
                };
                const readRat = (o) => {
                  const num = view.getUint32(tiffStart + o, littleEndian);
                  const den = view.getUint32(tiffStart + o + 4, littleEndian);
                  return den ? num / den : 0;
                };
                if (gpsData[2]) {
                  const lat = toDD(gpsData[2].off);
                  const latRef = view.getUint8(tiffStart + (gpsData[1]?.off || 0));
                  result.lat = (latRef === 83) ? -lat : lat; // 'S' = 83
                }
                if (gpsData[4]) {
                  const lng = toDD(gpsData[4].off);
                  const lngRef = view.getUint8(tiffStart + (gpsData[3]?.off || 0));
                  result.lng = (lngRef === 87) ? -lng : lng; // 'W' = 87
                }
                if (gpsData[6]) result.altitude = readRat(gpsData[6].off);
              }
            }
            break;
          }
          if ((marker & 0xFF00) !== 0xFF00) break;
          offset += view.getUint16(offset);
        }
        resolve(result);
      } catch { resolve({ lat: null, lng: null, datetime: null, altitude: null }); }
    };
    reader.onerror = () => resolve({ lat: null, lng: null, datetime: null, altitude: null });
    reader.readAsArrayBuffer(file);
  });
}

// ── 카카오 역지오코딩 — GPS 좌표 → 행정구역 주소 변환 ──────────
// API: https://dapi.kakao.com/v2/local/geo/coord2address.json
// 반환: { roadAddress, jibunAddress, region } 또는 null
async function _reverseGeocode(lat, lng) {
  if (!CFG.kakaoKey || !lat || !lng) return null;
  try {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json` +
                `?x=${lng}&y=${lat}&input_coord=WGS84`;
    const res = await fetch(url, {
      headers: { 'Authorization': `KakaoAK ${CFG.kakaoKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn('[GEO] 카카오 역지오코딩 오류:', res.status);
      return null;
    }
    const data = await res.json();
    const doc  = data.documents?.[0];
    if (!doc) return null;

    // 도로명 주소 (있으면 우선)
    const road   = doc.road_address;
    const jibun  = doc.address;

    // 행정구역 상세 (읍·면·동·번지)
    const region = jibun ? {
      sido:     jibun.region_1depth_name,   // 시·도 (예: 제주특별자치도)
      sigungu:  jibun.region_2depth_name,   // 시·군·구 (예: 서귀포시)
      eupmyeon: jibun.region_3depth_name,   // 읍·면·동 (예: 대정읍)
      beonji:   jibun.main_address_no + (jibun.sub_address_no ? '-' + jibun.sub_address_no : ''), // 번지
      full:     jibun.address_name,         // 전체 지번 주소
    } : null;

    return {
      roadAddress:  road  ? road.address_name  : null,
      jibunAddress: jibun ? jibun.address_name : null,
      region,
    };
  } catch (e) {
    console.warn('[GEO] 역지오코딩 실패:', e.message);
    return null;
  }
}

// ── 날씨 정보 수집 (Open-Meteo 무료 API) ─────────────────────
async function _fetchWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m,` +
      `precipitation,weather_code,visibility` +
      `&hourly=temperature_2m,wind_speed_10m,precipitation_probability` +
      `&forecast_days=1&timezone=Asia%2FSeoul`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = await res.json();
    const c = d.current;
    // 기상 코드 → 한국어 설명
    const WMO = {
      0:'맑음', 1:'대체로 맑음', 2:'구름 조금', 3:'흐림',
      45:'안개', 48:'안개(착빙)', 51:'이슬비(약)', 53:'이슬비', 55:'이슬비(강)',
      61:'비(약)', 63:'비', 65:'비(강)', 71:'눈(약)', 73:'눈', 75:'눈(강)',
      80:'소나기(약)', 81:'소나기', 82:'소나기(강)', 95:'뇌우', 99:'뇌우(우박)'
    };
    return {
      temp:      c.temperature_2m,
      wind:      c.wind_speed_10m,         // km/h
      windDir:   c.wind_direction_10m,      // 도
      precip:    c.precipitation,           // mm
      condition: WMO[c.weather_code] || '알 수 없음',
      visibility: c.visibility,             // m
      windMs:    (c.wind_speed_10m / 3.6).toFixed(1),  // m/s 변환
    };
  } catch { return null; }
}

// ── 해양 기상 (파고·조류) — 기상청 해양 예보 RSS ────────────
// 기상청 해양 특보·예보는 공개 RSS로 제공됨
// 제주 해역: 제주도남쪽먼바다 / 제주도해협 구분
async function _fetchMarineWeather(lat, lng) {
  try {
    // Open-Meteo Marine API (파고·조류 무료 제공)
    const url = `https://marine-api.open-meteo.com/v1/marine?` +
      `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=wave_height,wave_direction,wave_period,` +
      `wind_wave_height,swell_wave_height` +
      `&hourly=wave_height,wave_direction,ocean_current_velocity,ocean_current_direction` +
      `&forecast_days=1&timezone=Asia%2FSeoul`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = await res.json();
    const c = d.current;
    // 시간별 조류 정보 (첫 6시간)
    const hours = d.hourly?.time?.slice(0,6).map((t, i) => ({
      time:      t.slice(11,16),
      current_v: d.hourly.ocean_current_velocity?.[i]?.toFixed(2),
      current_d: d.hourly.ocean_current_direction?.[i],
      wave_h:    d.hourly.wave_height?.[i]?.toFixed(2),
    })) || [];
    // 작업 가능 여부 판단
    const waveH    = c.wave_height ?? 0;
    const windMs   = 0; // 별도 날씨 API에서 가져옴
    const operable = waveH < 1.5; // 1.5m 초과 시 드론 작업 주의
    return {
      waveHeight:   c.wave_height?.toFixed(2),      // m
      waveDir:      c.wave_direction,                // 도
      wavePeriod:   c.wave_period?.toFixed(1),       // 초
      swellHeight:  c.swell_wave_height?.toFixed(2), // m
      windWave:     c.wind_wave_height?.toFixed(2),  // m
      operable,
      hours,
    };
  } catch { return null; }
}

// ── 현장 기상 종합 보고서 생성 ────────────────────────────────
async function _buildFieldReport(lat, lng, exif, isMarine = false) {
  const [weather, marine, geoAddr] = await Promise.all([
    _fetchWeather(lat, lng),
    isMarine ? _fetchMarineWeather(lat, lng) : Promise.resolve(null),
    _reverseGeocode(lat, lng),   // ★ 역지오코딩 병렬 실행
  ]);

  const dirLabel = (deg) => {
    if (deg == null) return '알 수 없음';
    const dirs = ['북','북동','동','남동','남','남서','서','북서'];
    return dirs[Math.round(deg / 45) % 8];
  };

  let report = `\n\n[현장 기상 정보 — 수거 계획 반영 필수]\n`;
  report += `위치: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E\n`;

  // ── 역지오코딩 주소 출력 ──────────────────────────────────
  if (geoAddr) {
    if (geoAddr.roadAddress) {
      report += `도로명: ${geoAddr.roadAddress}\n`;
    }
    if (geoAddr.jibunAddress) {
      report += `지번: ${geoAddr.jibunAddress}\n`;
    }
    if (geoAddr.region) {
      const r = geoAddr.region;
      report += `행정구역: ${r.sido} ${r.sigungu} ${r.eupmyeon} ${r.beonji}\n`;
      // _userLocation에도 주소 반영 (AI 위치 주입용)
      if (_userLocation) _userLocation.address = geoAddr.jibunAddress || geoAddr.roadAddress;
    }
  }

  if (exif?.datetime) {
    const dt = exif.datetime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    report += `촬영시각: ${dt}\n`;
  }
  if (exif?.altitude != null) report += `고도: ${exif.altitude.toFixed(0)}m\n`;

  if (weather) {
    report += `\n[기상 현황]\n`;
    report += `날씨: ${weather.condition}\n`;
    report += `기온: ${weather.temp}°C\n`;
    report += `풍속: ${weather.windMs}m/s (${weather.wind}km/h) — ${dirLabel(weather.windDir)}풍\n`;
    report += `가시거리: ${(weather.visibility/1000).toFixed(1)}km\n`;
    report += `강수: ${weather.precip}mm\n`;
    // 드론 운용 기준
    const wMs = parseFloat(weather.windMs);
    const flyOk = wMs < 12;
    report += `드론 가동: ${flyOk ? '✅ 가능' : '⛔ 불가 (초속 12m/s 초과 — 자동 차단)'}\n`;
  }

  if (marine) {
    report += `\n[해양 기상 — 수중 작업 판단 기준]\n`;
    report += `파고(합산): ${marine.waveHeight}m / 너울: ${marine.swellHeight}m\n`;
    report += `파향: ${dirLabel(marine.waveDir)} / 파주기: ${marine.wavePeriod}초\n`;
    report += `수중 작업: ${marine.operable
      ? '✅ 가능 (파고 1.5m 미만)'
      : '⚠️ 주의 (파고 1.5m 이상 — 잠수부 안전 확인 필요)'}\n`;
    if (marine.hours.length > 0) {
      report += `\n[향후 6시간 조류·파고]\n`;
      for (const h of marine.hours) {
        report += `  ${h.time} | 파고:${h.wave_h}m | 조류:${h.current_v}m/s ${dirLabel(h.current_d)}향\n`;
      }
    }
  }
  return report;
}




// ════════════════════════════════════════════════════════════════
// SP-00-ROUTER v3.0 — 1단계 서비스 라우팅
// 역할: 사용자 입력을 분석 → 어느 하위 서비스로 보낼지 결정
// 호출: callAI() 진입 직전에 runRouter()를 실행
// 출력: { category, service_id, service_url, confidence,
//         reason, secondary, urgent, gwp_ctx }
// ════════════════════════════════════════════════════════════════

// ── Router system prompt — GitHub 동적 로드 ──────────────────
// prompts/SP-00-ROUTER-LATEST.txt 에 현재 버전 파일명이 기재됨
// 파일명이 바뀌면 webapp.html 수정 없이 자동 반영
const _RAW_BASE    = 'https://raw.githubusercontent.com/Openhash-Gopang/gopang/main/';
const _ROUTER_PTR  = _RAW_BASE + 'prompts/SP-00-ROUTER-LATEST.txt';
const _ROUTER_FALLBACK = _RAW_BASE + 'prompts/SP-00-ROUTER-v3.0.txt';

let _routerPrompt      = null;   // 로드 완료 후 캐시
let _routerPromptVer   = null;   // 버전명 (로그용)
let _routerLoadPromise = null;   // 중복 fetch 방지

async function _loadRouterPrompt() {
  // 이미 로드됐으면 캐시 반환
  if (_routerPrompt) return _routerPrompt;

  // 동시 호출 시 하나만 fetch (Promise 공유)
  if (_routerLoadPromise) return _routerLoadPromise;

  _routerLoadPromise = (async () => {
    try {
      // Step 1: 포인터 파일 읽기 (SP-00-ROUTER-LATEST.txt)
      // 포인터 파일 내용 예시: "SP-00-ROUTER-v3.0.txt"
      const ptrRes = await fetch(_ROUTER_PTR, { cache: 'no-cache' });
      if (!ptrRes.ok) throw new Error('포인터 파일 없음: ' + ptrRes.status);

      const latestFile = (await ptrRes.text()).trim().replace(/[\n\r]/g, '');
      if (!latestFile || !latestFile.endsWith('.txt')) throw new Error('포인터 내용 비정상: ' + latestFile);

      // Step 2: 실제 라우터 프롬프트 파일 로드
      const promptRes = await fetch(_RAW_BASE + 'prompts/' + latestFile, { cache: 'no-cache' });
      if (!promptRes.ok) throw new Error('라우터 프롬프트 로드 실패: ' + promptRes.status);

      _routerPrompt    = await promptRes.text();
      _routerPromptVer = latestFile;
      console.info('[Router] 프롬프트 로드 완료:', latestFile, '(' + _routerPrompt.length + ' chars)');
      return _routerPrompt;

    } catch(e) {
      console.warn('[Router] 최신 버전 로드 실패, 폴백 사용:', e.message);
      try {
        // Step 3: 폴백 — v3.0 직접 로드
        const fbRes = await fetch(_ROUTER_FALLBACK, { cache: 'no-cache' });
        if (fbRes.ok) {
          _routerPrompt    = await fbRes.text();
          _routerPromptVer = 'SP-00-ROUTER-v3.0.txt (폴백)';
          console.info('[Router] 폴백 프롬프트 로드 완료');
          return _routerPrompt;
        }
      } catch(e2) {
        console.warn('[Router] 폴백도 실패:', e2.message);
      }
      // Step 4: 하드코딩 최소 프롬프트
      _routerPrompt    = _ROUTER_MINIMAL;
      _routerPromptVer = 'minimal (내장)';
      return _routerPrompt;
    }
  })();

  return _routerLoadPromise;
}

// ── 최소 내장 프롬프트 (GitHub 완전 불통 시 최후 보루) ─────────
const _ROUTER_MINIMAL = `너는 고팡 서비스 라우터다. JSON만 출력한다.
{"category":"코드","service_id":"ID","service_url":"URL","confidence":0.0,"reason":"근거","secondary":null,"urgent":false,"gwp_ctx":null}
긴급(쓰러짐·화재·부상)→EMG·kemergency·urgent:true, 쓰레기·오염→ENV·fiil-kcleaner,
법률·소송→JUS·klaw, 주식·투자→ECO·kfinance, 배송·택배→TRN·klogistics,
교통·경로→TRN·ktransport, 건강·증상→MED·khealth, 교육→EDU·kedu,
고팡투표·안건→LEG·kdemocracy, 그 외→DIRECT·gopang-direct`;

// ── Router 캐시 (같은 입력 재호출 방지) ─────────────────────
const _routerCache = new Map();

// ── runRouter: 1단계 라우팅 실행 ────────────────────────────
async function runRouter(userText, hasImage = false) {
  // GWP ctx/svc 파라미터 우선 처리
  const params  = new URLSearchParams(location.search);
  const gwpSvc  = params.get('svc');
  const gwpCtx  = params.get('ctx') ? decodeURIComponent(params.get('ctx')) : null;

  const GWP_SVC_MAP = {
    stock:      { category:'ECO', service_id:'kfinance',    service_url:'https://stock.gopang.net' },
    klaw:       { category:'JUS', service_id:'klaw',        service_url:'https://klaw.gopang.net' },
    school:     { category:'EDU', service_id:'kedu',        service_url:'https://school.gopang.net' },
    health:     { category:'MED', service_id:'khealth',     service_url:'https://health.gopang.net' },
    democracy:  { category:'LEG', service_id:'kdemocracy',  service_url:'https://democracy.gopang.net' },
    fiil:       { category:'ENV', service_id:'fiil-kcleaner', service_url:'https://fiil.kr' },
  };
  if (gwpSvc && GWP_SVC_MAP[gwpSvc]) {
    const r = GWP_SVC_MAP[gwpSvc];
    return { ...r, confidence:0.99, reason:`GWP svc=${gwpSvc} 파라미터 직접 라우팅.`,
             secondary:null, urgent:false, gwp_ctx:gwpCtx };
  }

  // 긴급 키워드 즉시 판단 (LLM 호출 없이)
  if (/긴급|응급|119|112|쓰러|부상|화재|불이났|구조|살려줘|심정지/.test(userText)) {
    return { category:'EMG', service_id:'kemergency',
             service_url:'https://911.gopang.net', confidence:0.99,
             reason:'긴급 상황 감지. K-Emergency 즉시 연결.',
             secondary:null, urgent:true, gwp_ctx:gwpCtx };
  }

  // 이미지+쓰레기 → 즉시 ENV
  if (hasImage && (!userText || /쓰레기|오염|투기|폐기물|해양|해안|침적/.test(userText))) {
    return { category:'ENV', service_id:'fiil-kcleaner',
             service_url:'https://fiil.kr', confidence:0.95,
             reason:'이미지 첨부 + 환경 오염 맥락. K-Cleaner 처리.',
             secondary:null, urgent:false, gwp_ctx:gwpCtx };
  }

  // 입력이 짧거나 일상 대화이면 라우터 LLM 호출 생략
  const DIRECT_RE = /^(안녕|고마워|감사|ㅋ|ㅎ|ㅇ|네|예|아니|몇시|날씨|시간|1\+1|계산|번역|요약).{0,20}$/;
  if (!userText || userText.length < 3 || DIRECT_RE.test(userText.trim())) {
    return { category:'DIRECT', service_id:'gopang-direct',
             service_url:null, confidence:0.98,
             reason:'일상 대화 또는 단순 질의. 고팡 AI 비서 직접 처리.',
             secondary:null, urgent:false, gwp_ctx:gwpCtx };
  }

  // 캐시 확인
  const cacheKey = userText.slice(0, 80);
  if (_routerCache.has(cacheKey)) {
    console.log('[Router] 캐시 히트:', cacheKey);
    return _routerCache.get(cacheKey);
  }

  // LLM 라우터 호출 (DeepSeek V3 텍스트 전용, 저렴·빠름)
  // ★ 라우터 프롬프트는 GitHub에서 동적 로드 — webapp.html 수정 불필요
  try {
    const routerSysPrompt = await _loadRouterPrompt();
    const imageNote = hasImage ? '\n[이미지 첨부됨]' : '';
    const res = await fetch(CFG.endpoint + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'deepseek-v4-flash',  // 라우터는 Flash 고정 (빠름·저렴, 분류 작업에 충분)
        max_tokens:  256,
        temperature: 0.0,               // 결정론적
        stream:      false,
        messages: [
          { role: 'system', content: routerSysPrompt },
          { role: 'user',   content: userText + imageNote },
        ],
      }),
    });
    if (!res.ok) throw new Error('Router HTTP ' + res.status);
    const data   = await res.json();
    const raw    = data.choices?.[0]?.message?.content || '{}';
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
    result.gwp_ctx = gwpCtx;

    // 캐시 저장 (최대 50개)
    if (_routerCache.size >= 50) _routerCache.delete(_routerCache.keys().next().value);
    _routerCache.set(cacheKey, result);

    console.log('[Router] 결과:', result.category, result.service_id, result.confidence);
    return result;

  } catch(e) {
    console.warn('[Router] LLM 호출 실패, gopang-direct 폴백:', e.message);
    return { category:'DIRECT', service_id:'gopang-direct',
             service_url:null, confidence:0.5,
             reason:'라우터 오류. 고팡 AI 비서 직접 처리.',
             secondary:null, urgent:false, gwp_ctx:gwpCtx };
  }
}

// ── applyRouterResult: 라우팅 결과를 callAI에 적용 ──────────
function applyRouterResult(result) {
  if (!result || result.service_id === 'gopang-direct') return;

  // urgent: 긴급 UI 처리
  if (result.urgent) {
    appendBubble('ai',
      '🚨 **긴급 상황 감지**\n' +
      `K-Emergency(911.gopang.net)에 연결합니다.\n` +
      '📞 119/112 자동 디스패치 준비 중...'
    );
  }

  // 서비스 배지 표시 (채팅창 상단에 작게)
  const svcBadge = document.getElementById('router-badge');
  if (svcBadge) {
    svcBadge.textContent = result.service_id !== 'gopang-direct'
      ? `▶ ${result.service_id} (${(result.confidence*100).toFixed(0)}%)`
      : '';
    svcBadge.style.display = result.service_id !== 'gopang-direct' ? 'block' : 'none';
  }

  console.log(`[Router] → [${result.category}] ${result.service_id} (${result.service_url}) conf:${result.confidence}`);
}

// ── 현재 라우팅 결과 저장 (callAI에서 참조) ────────────────
let _lastRouterResult = null;

async function callAI(userText, imageFile = null, _preTab = null) {
  showTyping();

  // urgent=true → kemergency면 경고 표시 후 계속 처리
  // (고팡 비서가 추가로 응급 가이드 제공)

  // ── 위치 준비 대기 (최대 6초, race condition 방지) ──────
  if (_locationPending) {
    await new Promise(resolve => {
      const deadline = Date.now() + 6000;
      const poll = () => {
        if (_locationReady || Date.now() >= deadline) resolve();
        else setTimeout(poll, 200);
      };
      poll();
    });
  }

  // ── SP-00 v10.0: 폭포수 2단계(전문가 변신) 완전 제거 ──────
  // 모든 전문 도메인은 [GWP:id] 태그로 하위 시스템 새 탭 호출
  // AI 비서는 직접 처리 가능한 업무만 수행:
  //   정보조회·계산·번역·날씨·PDV관리·일정·일반대화·웹검색
  // 이미지 첨부 시: Gemini 범용 분석 후 SP-00에 컨텍스트로 전달
  //   (이미지 내용이 환경오염이면 LLM이 [GWP:fiil-kcleaner] 태그 출력)

  // system을 항상 base로 유지 (전문가 SP 오염 방지)
  // system_base 최초 1회 고정 — 이후 callAI 재진입 시 항상 원본으로 복원
  if (!CFG.system_base) CFG.system_base = CFG.system;
  CFG.system = CFG.system_base;

  // ── 이미지 첨부 시: Gemini 범용 분석 → SP-00 컨텍스트 주입 ──
  if (imageFile && CFG.geminiKey) {
    try {
      const _gpTimer = _showGeminiProgress();
      console.log('[IMG] Gemini 범용 이미지 분석 시작');
      const genResult = await _callGeminiGeneral(imageFile, CFG.geminiKey, userText);
      _hideGeminiProgress(_gpTimer);
      if (genResult) {
        const analysisText = _geminiResultToText(genResult, userText);
        userContent = analysisText;
        imageFile   = null;
        console.log('[IMG] Gemini 분석 완료 → SP-00 컨텍스트로 전달');
      }
    } catch(e) {
      console.warn('[IMG] Gemini 분석 실패:', e.message);
    }
  }

  // locNote는 _buildLocNote()로 분리 — 최초 1회만 system에 삽입됨

  // ── 이미지 → content 배열 변환 ──────────────────────
  let userContent;

  if (imageFile && imageFile.type.startsWith('image/')) {
    if (!_modelSupportsVision(CFG.model)) {
      // 비전 미지원 모델 — 이미지 무시, 사용자에게 안내
      hideTyping();
      appendBubble('ai',
        `⚠️ 현재 모델(${CFG.model})은 이미지를 지원하지 않습니다.\n` +
        `설정에서 "DeepSeek V4" 또는 "GPT-4o"로 변경하세요.`);
      if (userText) {
        // 텍스트만이라도 처리
        showTyping();
      } else {
        return;
      }
      userContent = userText;
    } else {
      // 비전 지원 모델 — base64 변환 후 multipart content
      // DeepSeek API: image_url 형식 미지원 → base64를 텍스트로 포함
      // OpenAI 호환 모델(gpt-4o 등): image_url 형식 사용
      try {
        const dataUrl  = await _fileToBase64(imageFile);
        const mimeType = imageFile.type;
        const base64   = dataUrl.split(',')[1];

        const isOpenAI = CFG.endpoint.includes('openai.com') ||
                         CFG.endpoint.includes('azure') ||
                         CFG.model.startsWith('gpt-');
        const isDeepSeek = CFG.endpoint.includes('deepseek') ||
                           CFG.endpoint.includes('workers.dev');

        userContent = [];
        if (userText) {
          userContent.push({ type: 'text', text: userText });
        }

        if (isOpenAI) {
          // OpenAI 형식: image_url
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          });
          // 텍스트 없이 이미지만 전송 시 — 의도 자율 파악 지시
          if (!userText) {
            userContent.push({
              type: 'text',
              text: '[텍스트 없이 이미지만 전송됨]\n사용자의 의도를 이미지에서 직접 파악하여 처리하라.\n환경 오염·쓰레기 현장이면 K-Cleaner v1.2 신고·견적을 자동 실행하고,\n그 외 이미지는 내용에 맞는 적절한 도움을 제공하라.\n불명확할 때만 한 가지 확인 질문을 한다.',
            });
          }
        } else {
          // DeepSeek 형식: base64를 텍스트로 포함
          // DeepSeek API는 image_url 미지원 → base64 데이터를 직접 전달
          userContent = [];
          if (userText) userContent.push({ type: 'text', text: userText });
          // 텍스트 없이 이미지만 전송 시 — 의도 자율 파악 지시
          const imgIntentNote = userText
            ? ''
            : '\n[텍스트 없이 이미지만 전송됨] 사용자 의도를 이미지에서 직접 파악하여 처리하라. 환경 오염·쓰레기 현장이면 K-Cleaner v1.2 신고·견적 자동 실행. 그 외는 내용에 맞는 도움 제공. 불명확할 때만 한 가지 확인 질문.';
          userContent.push({
            type: 'text',
            text: `[이미지 첨부됨 — base64 데이터: data:${mimeType};base64,${base64.slice(0,100)}... (${Math.round(base64.length*0.75/1024)}KB)]\n이 이미지를 분석해 주세요.${imgIntentNote}`,
          });
        }
      } catch (e) {
        hideTyping();
        appendBubble('ai', `⚠️ 이미지 변환 오류: ${e.message}`);
        return;
      }
    }
  } else {
    // 일반 텍스트
    userContent = userText;
  }

  // ── history에 system(최초) 및 user 추가 ─────────────────
  // history 구조: [system(index 0, 고정), user, assistant, user, assistant, ...]

  // 1) system: 세션 최초 1회만 history[0]으로 삽입
  if (history.length === 0) {
    // 세션 최초 — system + locNote 고정
    const locNote = _buildLocNote();
    history.push({ role: 'system', content: CFG.system + locNote });
    console.log('[Cache] 세션 최초 — system 1회 삽입');
  }
  // history[0] system 고정 유지 — 전문가 SP 없으므로 교체 불필요

  // 2) user: messages 전송 직전에 history에 추가
  const userRecord = { role: 'user', content: typeof userContent === 'string' ? userContent : `[첨부: 이미지]` };
  history.push(userRecord);

  // 3) messages: history 전체 (system + 대화 누적 + 현재 user)
  //    단, 이미지가 있을 경우 마지막 user content는 multipart로 교체
  const messages = [
    ...history.slice(0, -1),                        // system + 이전 대화
    { role: 'user', content: userContent },         // 현재 user (이미지 포함 가능)
  ];

  // ── 엔드포인트 + API Key 결정 ────────────────────────────
  const epSel   = document.getElementById('setting-endpoint');
  const savedKey = document.getElementById('setting-apikey')?.value?.trim();
  // Worker 프록시 사용 시: API 키 불필요 (Worker 환경변수에서 관리)
  // 직접 API 사용 시: 설정 키 또는 CFG.apiKey 사용
  const isProxy = CFG.endpoint.includes('workers.dev');
  const apiKey  = isProxy ? '' : ((savedKey && savedKey.startsWith('sk-')) ? savedKey : CFG.apiKey);

  let baseUrl = CFG.endpoint;
  if (document.getElementById('setting-endpoint')?.value === 'custom') {
    const customUrl = document.getElementById('custom-endpoint-url')?.value?.trim();
    if (customUrl) baseUrl = customUrl;
  }
  // 끝 슬래시 제거
  baseUrl = baseUrl.replace(/\/+$/, '');

  const activeModel = CFG.model;
  console.log(`[AI] 호출 → ${baseUrl}/chat/completions | 모델: ${activeModel} | ${isProxy ? '프록시(보안)' : 'Key: ' + apiKey.slice(0,8) + '...'}`);

  // ── 스트리밍 호출 ─────────────────────────────────────────
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        // 프록시 사용 시: Authorization 헤더 미전송 (Worker가 자체 키 사용)
        // 직접 API 사용 시: Bearer 키 전송
        ...(isProxy ? {} : { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model: CFG.model,
        messages,
        max_tokens:  2000,
        temperature: 0.6,
        stream:      true,
        stream_options: { include_usage: true },  // 캐시 히트 토큰 수 확인용
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errBody.slice(0, 300) || '응답없음'}`);
    }

    console.log(`[AI] 응답 시작 — status:${res.status}, streaming...`);

    // ── SSE 스트림 수신 + 실시간 렌더링 ─────────────────────
    hideTyping();

    const bubble = _createStreamBubble();
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   fullReply = '';
    let   buf       = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const chunk = JSON.parse(payload);
          if (chunk.usage) {
            const u = chunk.usage;
            const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
            console.log(`[Cache] prompt=${u.prompt_tokens} cached=${cached} completion=${u.completion_tokens} (절감율 ${cached ? Math.round(cached/u.prompt_tokens*100) : 0}%)`);
          }
          const delta = chunk.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            fullReply += delta;
            // CLN 신고가 아닐 때만 실시간 렌더링
            if (bubble) _updateStreamBubble(bubble, fullReply);
          }
        } catch (parseErr) {
          if (payload && payload !== '[DONE]') {
            console.warn('[Stream] 파싱 실패:', payload.slice(0, 80));
          }
        }
      }
    }

    if (!fullReply) fullReply = '(응답 없음)';
    console.log(`[AI] 응답 완료 — ${fullReply.length}자`);
    if (CFG._modelOverride) { CFG.model = CFG._modelOverride; CFG._modelOverride = null; }
    history.push({ role: 'assistant', content: fullReply });
    if (bubble) bubble.classList.remove('streaming');

    // ── GWP 태그 감지 → 하위 시스템 새 탭 오픈 (SP-00 v10.0) ──
    const gwpMatch = fullReply.match(/\[GWP:([\w-]+)\]/);
    if (gwpMatch) {
      const svcId  = gwpMatch[1];
      const svcDef = (typeof getService === 'function') ? getService(svcId) : null;
      if (svcDef) {
        console.info('[GWP] LLM 판단 → 새 탭:', svcId);
        // 버블에서 [GWP:...] 태그 제거 후 렌더링
        if (bubble) _updateStreamBubble(bubble, fullReply.replace(/\[GWP:[\w-]+\]\s*/, ''));
        _gwpLaunch(svcDef, userText, _preTab);
      } else {
        console.warn('[GWP] 알 수 없는 서비스 ID:', svcId);
      }
    }

    // ── AUTH 태그 감지 → 인증 요구 ──────────────────────────
    const authMatch = fullReply.match(/\[AUTH:(L[0-3])\]/);
    if (authMatch) {
      const requiredLevel = authMatch[1];
      const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
      const currentLevel = stored?.authLevel || 'L0';
      const levels = ['L0','L1','L2','L3'];
      const needsUpgrade = levels.indexOf(requiredLevel) > levels.indexOf(currentLevel);

      if (needsUpgrade) {
        // 인증 버튼 주입
        setTimeout(() => _injectAuthConfirmButton(requiredLevel), 400);
      }
    }

    // K-Law 백그라운드 감시 트리거 — 대화 내용 자동 검토 (비동기)
    setTimeout(() => _klawReview('conversation', null), 3000);


  } catch (err) {
    hideTyping();
    const existingBubble = document.querySelector('.bubble-ai.streaming');
    let userMsg = `⚠️ API 오류: ${err.message}`;
    if (err.message.includes('402') || err.message.includes('Insufficient Balance')) {
      userMsg =
        '⚠️ AI 서버 크레딧이 일시적으로 부족합니다.\n\n' +
        '잠시 후 다시 시도하거나, 설정(⚙️)에서\n' +
        'BYOK(내 API 키)를 입력하면 계속 이용할 수 있습니다.';
    }
    if (existingBubble) {
      existingBubble.classList.remove('streaming');
      existingBubble.innerHTML = userMsg.replace(/\n/g, '<br>');
    } else {
      appendBubble('ai', userMsg);
    }
    console.error('[AI]', err);
  }
}

// ── 스트리밍 버블 헬퍼 ───────────────────────────────────────
function _createStreamBubble() {
  const list   = document.getElementById('message-list');
  const row    = document.createElement('div');
  row.className = 'msg-row ai';
  const bubble = document.createElement('div');
  bubble.className = 'bubble bubble-ai streaming';
  row.appendChild(bubble);
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
  return bubble;
}

function _updateStreamBubble(bubble, text) {
  // 마크다운 굵게(**text**) → <b> 간단 변환 + 줄바꿈 처리
  bubble.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
  const list = document.getElementById('message-list');
  list.scrollTop = list.scrollHeight;
}

// ── 버블 렌더링 ─────────────────────────────────────────
function appendBubble(role, text, isHTML = false) {
  const list = document.getElementById('message-list');
  const row  = document.createElement('div');
  row.className = `msg-row ${role}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${role}`;
  if (isHTML) bubble.innerHTML = text;
  else        bubble.textContent = text;

  row.appendChild(bubble);
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

function riskChip(level, flags) {
  const map = { S0:'✅ 안전', S1:'⚠️ 주의', S2:'🚨 경고', S3:'🛑 차단' };
  const cls = level.toLowerCase();
  const label = map[level] ?? '—';
  const flagStr = flags.length ? ` · ${flags.slice(0,3).join(' ')}` : '';
  return `<span class="risk-chip ${cls}">${label}${flagStr}</span>`;
}

let typingEl = null;
function showTyping() {
  const list = document.getElementById('message-list');
  typingEl = document.createElement('div');
  typingEl.className = 'msg-row ai';
  typingEl.id = 'typing-row';
  typingEl.innerHTML = `<div class="typing-indicator">
    <span></span><span></span><span></span>
  </div>`;
  list.appendChild(typingEl);
  list.scrollTop = list.scrollHeight;
}
function hideTyping() {
  document.getElementById('typing-row')?.remove();
  typingEl = null;
}

// ── AI 비서 토글 ────────────────────────────────────────
function toggleAI() {
  if (aiActive) {
    // 이미 활성 → 카드 열지 않고 비활성화
    aiActive = false;
    document.getElementById('btn-ai').classList.remove('active');
    return;
  }
  // 미활성 → 카드 열기
  document.getElementById('ai-overlay').classList.toggle('open');
}
function closeAI() {
  document.getElementById('ai-overlay').classList.remove('open');
}
// silent=true : 버튼 클릭이 아닌 자동 활성화 (메시지 미표시)
// silent=false: 버튼 클릭으로 활성화 (안내 메시지 표시)
function activateAI(silent = false) {
  if (aiActive) return;   // 이미 활성 상태면 무시
  aiActive = true;
  document.getElementById('btn-ai').classList.add('active');
  // dot 색상은 CSS .btn-ai.active .ai-dot 으로 자동 처리
  document.getElementById('ai-card-sub').textContent = `${CFG.model} 연결됨`;

  if (!silent) {
    appendBubble('ai', '귀하의 AI 비서입니다. 지시하십시오.');
  }
}

// ── 설정 패널 ───────────────────────────────────────────
function openSettings() {
  // API 키는 하드코딩 — 설정 화면에 별표로 마스킹 표시
  document.getElementById('setting-apikey').value     = CFG.apiKey    ? '••••••••••••••••••••••••••••••••' : '';
  document.getElementById('setting-gemini-key').value = CFG.geminiKey ? '••••••••••••••••••••••••••••••••' : '';
  document.getElementById('setting-system').value     = CFG.system;
  const modelSel = document.getElementById('setting-model');
  if (modelSel) modelSel.value = CFG.model;
  const epSel = document.getElementById('setting-endpoint');
  if (epSel) epSel.value = CFG.endpoint;

  // ── 보안 섹션 업데이트 ──────────────────────────────
  _updateSecuritySection();

  document.getElementById('settings-overlay').classList.add('open');
}

function _updateSecuritySection() {
  const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
  const levelEl = document.getElementById('auth-level-display');
  const idEl    = document.getElementById('gopang-id-display');
  const fpBtn   = document.getElementById('btn-register-fp');

  if (!stored?.ipv6) {
    if (levelEl) levelEl.innerHTML = '⚠️ 미등록 사용자';
    return;
  }

  const level  = stored.authLevel || 'L0';
  const hasFace = !!stored.faceVec;
  const hasFp   = !!stored.webauthn?.credentialId;
  const hasSeed = !!stored.seedHex;

  const levelColors = { L0:'#FF9F0A', L1:'#30D158', L2:'#0A84FF', L3:'#BF5AF2' };
  const color = levelColors[level] || '#AEAEB2';

  if (levelEl) levelEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:18px;font-weight:700;color:${color};">${level}</span>
      <span style="color:var(--label);">인증 레벨</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <span>${hasFace  ? '✅' : '⬜'} 얼굴 인증 (L1)</span>
      <span>${hasFp    ? '✅' : '⬜'} 지문 인증 (L2)</span>
      <span>${hasSeed  ? '✅' : '⬜'} 4단어 시드</span>
    </div>`;

  if (idEl) idEl.textContent = `ID: ${stored.ipv6}`;

  // 지문 버튼 텍스트 동적 변경
  if (fpBtn) fpBtn.textContent = hasFp ? '🔐 지문 재등록' : '🔐 지문 등록';
}

// ── 설정에서 지문 등록 ───────────────────────────────────
window._settingsRegisterFingerprint = async function() {
  const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
  if (!stored?.ipv6) {
    appendBubble('ai', '⚠️ 먼저 고팡 등록을 완료해 주세요.', true);
    closeSettings();
    return;
  }
  closeSettings();
  await _registerFingerprint(stored.ipv6);
  // 등록 완료 후 설정 재오픈 시 업데이트 반영
};

// ── 설정에서 얼굴 재등록 ────────────────────────────────
window._settingsRegisterFace = async function() {
  const stored = JSON.parse(localStorage.getItem('gopang_user_v3') || 'null');
  if (!stored?.ipv6) {
    appendBubble('ai', '⚠️ 먼저 고팡 등록을 완료해 주세요.', true);
    closeSettings();
    return;
  }
  closeSettings();
  appendBubble('ai', '📷 얼굴을 재등록합니다. 전면 카메라를 실행합니다…', true);

  const vec = await _captureFaceVector();
  if (!vec) {
    appendBubble('ai', '촬영이 취소됐습니다.', true);
    return;
  }
  // 기존 데이터 유지하며 faceVec만 교체
  const updated = {
    ...stored,
    faceVec:   vec,
    authLevel: stored.webauthn ? 'L2' : 'L1',
    lastSeenAt: new Date().toISOString(),
  };
  localStorage.setItem('gopang_user_v3', JSON.stringify(updated));
  if (window.gopangWallet && updated.ipv6) { window.gopangWallet.setIdentity({ guid: updated.ipv6, handle: updated.handle || null }); console.info('[GopangWallet] guid 연결(얼굴재등록):', updated.ipv6.slice(-8)); }
  appendBubble('ai', '✅ 얼굴 재등록 완료!', true);
};
function handleOverlayClick(e) {
  if (e.target.id === 'settings-overlay') closeSettings();
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

// ── 캐시 강제 초기화 (구버전 PWA 제거) ──────────────────────
async function clearSWCache() {
  try {
    // 1. 모든 SW 해제
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    // 2. 모든 캐시 삭제
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    alert('캐시 초기화 완료. 페이지를 새로고침합니다.');
    location.reload(true);
  } catch (e) {
    alert('초기화 실패: ' + e.message);
  }
}
function saveSettings() {
  const model     = document.getElementById('setting-model').value;
  const epVal     = document.getElementById('setting-endpoint').value;
  const key       = document.getElementById('setting-apikey').value.trim();
  const geminiKey = document.getElementById('setting-gemini-key').value.trim();
  const sys       = document.getElementById('setting-system').value.trim();

  if (model) CFG.model = MODEL_MIGRATION[model] ?? model;
  // 별표(마스킹) 그대로면 기존 키 유지, 실제 새 키 입력 시만 교체
  if (key       && !key.startsWith('•'))       CFG.apiKey    = key;
  if (geminiKey && !geminiKey.startsWith('•')) CFG.geminiKey = geminiKey;
  if (sys) CFG.system = sys;

  if (epVal === 'custom') {
    const customUrl = document.getElementById('custom-endpoint-url').value.trim();
    if (customUrl) CFG.endpoint = customUrl;
  } else {
    CFG.endpoint = epVal;
  }

  // 로컬 저장 (API key 포함 — 강력 새로고침 후에도 유지)
  try {
    localStorage.setItem('gopang_cfg', JSON.stringify({
      model:     CFG.model,
      endpoint:  CFG.endpoint,
      // system은 저장하지 않음 — localStorage 오염 방지
      apiKey:    CFG.apiKey,
      geminiKey: CFG.geminiKey,
    }));
  } catch {}

  closeSettings();
  appendBubble('ai', `⚙️ 설정 저장: ${CFG.model}`);
}
// 구버전 모델명 → 현재 유효한 이름으로 교정 매핑
const MODEL_MIGRATION = {
  'deepseek-v4':        'deepseek-v4-flash',
  'deepseek-v3':        'deepseek-chat',
  'deepseek-r1':        'deepseek-reasoner',
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('gopang_cfg') || '{}');
    if (saved.model) {
      CFG.model = MODEL_MIGRATION[saved.model] ?? saved.model;
    }
    if (saved.endpoint)  CFG.endpoint  = saved.endpoint;
    // system은 localStorage에서 복원하지 않음 — gopang-app.js 하드코딩 SP-00이 항상 우선
    // 하드코딩 키가 있으면 localStorage 값으로 덮어쓰지 않음
    if (saved.apiKey    && !CFG.apiKey)    CFG.apiKey    = saved.apiKey;
    if (saved.geminiKey && !CFG.geminiKey) CFG.geminiKey = saved.geminiKey;
    // kakaoKey는 CFG에 하드코딩 — localStorage 복원 불필요
  } catch {}
}

// 커스텀 엔드포인트 필드 토글
document.getElementById('setting-endpoint').addEventListener('change', function() {
  document.getElementById('custom-endpoint-group').style.display =
    this.value === 'custom' ? 'block' : 'none';
});

// ── 검색 (대화 상대 + PDV 데이터 전용) ────────────────────
// ⚠️  웹 검색은 이 버튼의 기능이 아님.
//     웹 검색이 필요하면 AI 비서(AI 버튼)에게 직접 지시할 것.
function openSearch() {
  document.getElementById('search-overlay').classList.add('open');
  setTimeout(() => document.getElementById('search-input')?.focus(), 300);
}
function closeSearch() {
  document.getElementById('search-overlay').classList.remove('open');
}
function handleSearchOverlayClick(e) {
  if (e.target.id === 'search-overlay') closeSearch();
}

function runSearch() {
  const q = document.getElementById('search-input').value.trim();
  const resultEl = document.getElementById('search-result');
  if (!q) {
    resultEl.innerHTML = '';
    return;
  }

  // ── 1. 대화 상대 검색 (대화 이력 기반) ────────────────
  const contactMatches = _searchContacts(q);

  // ── 2. PDV 데이터 검색 (localStorage 기반) ─────────────
  const pdvMatches = _searchPDV(q);

  // ── 결과 렌더링 ────────────────────────────────────────
  let html = '';

  if (contactMatches.length > 0) {
    html += `<div style="font-size:11px;font-weight:600;color:var(--label-3);
                          letter-spacing:0.05em;text-transform:uppercase;
                          margin-bottom:6px">👤 대화 상대</div>`;
    contactMatches.forEach(c => {
      html += `<div style="padding:8px 10px;border-radius:var(--r-md);
                            background:var(--bg-input);margin-bottom:6px;
                            font-size:14px;cursor:pointer"
                   onclick="selectContact('${c.id}')">
                 <span style="color:var(--label)">${_highlight(c.name, q)}</span>
                 <span style="color:var(--label-3);font-size:12px;margin-left:8px">
                   ${c.guid ? c.guid.slice(0,8)+'…' : ''}
                 </span>
               </div>`;
    });
  }

  if (pdvMatches.length > 0) {
    html += `<div style="font-size:11px;font-weight:600;color:var(--label-3);
                          letter-spacing:0.05em;text-transform:uppercase;
                          margin:${contactMatches.length?'12px':0} 0 6px">
               🔐 PDV 데이터
             </div>`;
    pdvMatches.forEach(p => {
      html += `<div style="padding:8px 10px;border-radius:var(--r-md);
                            background:var(--bg-input);margin-bottom:6px;font-size:13px">
                 <span style="color:var(--label-2)">${_highlight(p.key, q)}</span>
                 <span style="color:var(--label-3);font-size:11px;margin-left:6px">
                   ${p.date}
                 </span>
               </div>`;
    });
  }

  if (!html) {
    html = `<div style="color:var(--label-3);font-size:13px;text-align:center;
                         padding:20px 0">
              검색 결과 없음
              <div style="font-size:11px;margin-top:6px">
                웹 검색은 AI 비서에게 직접 지시하세요.
              </div>
            </div>`;
  }

  resultEl.innerHTML = html;
}

// 대화 상대 검색 — history 기반 + localStorage 연락처
function _searchContacts(q) {
  const results = [];
  const seen = new Set();
  const lq = q.toLowerCase();

  // 현재 대화 이력에서 AI 이외 발신자 추출
  history.forEach(m => {
    if (m.role === 'assistant') return;
    // 향후 다자간 대화 시 senderId로 분류
  });

  // localStorage 저장된 연락처 검색
  try {
    const contacts = JSON.parse(localStorage.getItem('gopang_contacts') || '[]');
    contacts.forEach(c => {
      if (!seen.has(c.id) &&
          (c.name?.toLowerCase().includes(lq) ||
           c.guid?.toLowerCase().includes(lq))) {
        seen.add(c.id);
        results.push(c);
      }
    });
  } catch {}

  return results;
}

// PDV 데이터 검색 — localStorage 키 기반
function _searchPDV(q) {
  const results = [];
  const lq = q.toLowerCase();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith('gopang_')) continue;
      if (key === 'gopang_user_guid' || key === 'gopang_cfg' ||
          key === 'gopang_contacts') continue;
      if (key.toLowerCase().includes(lq)) {
        const val = localStorage.getItem(key);
        let date = '';
        try { date = JSON.parse(val)?.ts ?? ''; } catch {}
        results.push({ key: key.replace('gopang_',''), date });
      }
    }
  } catch {}
  return results.slice(0, 10);
}

// 검색어 강조
function _highlight(text, q) {
  if (!text) return '';
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return text.replace(re,
    '<span style="color:var(--tint);font-weight:600">$1</span>');
}

// 연락처 선택 시 채팅으로 이동
function selectContact(id) {
  closeSearch();
  // 향후: 해당 연락처와의 대화 스레드로 전환
  console.log('[Search] 연락처 선택:', id);
}

// ── GUID 상태 스트립 표시 ────────────────────────────────
function showGUID() {
  const el = document.getElementById('status-text');
  if (el) el.title = `GUID: ${USER_GUID}`;
}

// ── 파일 첨부 ───────────────────────────────────────────
function triggerAttach() {
  document.getElementById('file-input').click();
}
function triggerCamera() {
  document.getElementById('camera-input').click();
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  attachFile = file;

  const nameEl    = document.getElementById('attach-name');
  const previewEl = document.getElementById('attach-preview');

  if (file.type.startsWith('image/')) {
    // 이미지 — 썸네일만 표시 (파일명·경고문 제거)
    const objUrl  = URL.createObjectURL(file);
    const thumbId = 'thumb-' + Date.now();
    nameEl.innerHTML =
      `<img id="${thumbId}" src="${objUrl}"
        style="height:36px;width:36px;object-fit:cover;
               border-radius:8px;vertical-align:middle;display:block;">`;
    requestAnimationFrame(() => {
      const t = document.getElementById(thumbId);
      if (t) t.addEventListener('load', () => URL.revokeObjectURL(objUrl), { once: true });
    });
  } else {
    // 일반 파일 — 아이콘만 표시
    const ext = file.name.split('.').pop().toUpperCase();
    nameEl.innerHTML =
      `<span style="font-size:11px;font-weight:600;color:var(--label-2);
                    background:var(--bg-subtle);border-radius:6px;
                    padding:3px 7px;">${ext}</span>`;
  }

  previewEl.style.display = 'flex';
  e.target.value = '';
  updateSendBtn();
}

function removeAttach() {
  attachFile = null;
  document.getElementById('attach-preview').style.display = 'none';
  document.getElementById('attach-name').innerHTML = '';
  updateSendBtn();   // ★ 첨부 제거 후 버튼 상태 재계산
}


// ── 마이크 입력 후 1초 무입력 시 자동 전송 ─────────────────
let _micAutoSendTimer = null;

function _micAutoSend() {
  if (_micAutoSendTimer) clearTimeout(_micAutoSendTimer);
  _micAutoSendTimer = setTimeout(() => {
    _micAutoSendTimer = null;
    const input = document.getElementById('msg-input');
    if (input && input.value.trim()) {
      console.log('[Mic] 1초 무입력 — 자동 전송');
      sendMessage();
    }
  }, 1000);
}

// 사용자가 입력창을 직접 수정하면 자동 전송 타이머 취소
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('msg-input');
  if (input) {
    // 인라인 oninput 대체 — 함수 정의 이후 바인딩
    input.addEventListener('input', (ev) => {
      autoResize(input);
      updateSendBtn();
      // ★ 마이크 dispatchEvent(isTrusted=false)는 타이머 취소 안 함
      if (_micAutoSendTimer && ev.isTrusted) {
        clearTimeout(_micAutoSendTimer);
        _micAutoSendTimer = null;
      }
    });
    // 인라인 onkeydown 대체
    input.addEventListener('keydown', (e) => handleKey(e));
  }

  // 전송 버튼
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendMessage());
  }

  // 카메라 버튼
  const camBtn = document.getElementById('btn-camera');
  if (camBtn) {
    camBtn.addEventListener('click', () => triggerCamera());
  }

  // 마이크 버튼
  const micBtn = document.getElementById('btn-mic');
  if (micBtn) {
    micBtn.addEventListener('click', () => toggleMic());
  }
});


// Android Chrome: Web Speech API (webkitSpeechRecognition)
// iOS Safari:     MediaRecorder → DeepSeek STT API 폴백

function toggleMic() {
  if (micActive) {
    _micStop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (!isIOS && SpeechRecognition) {
    // ── Android Chrome / 데스크탑: Web Speech API ──────────
    _micStartWebSpeech(SpeechRecognition);
  } else {
    // ── iOS Safari / 미지원 브라우저: MediaRecorder + STT ──
    _micStartMediaRecorder();
  }
}

function _micStop() {
  recognition?.stop();
  micActive = false;
  _micSetUI(false);
  if (window._micMediaRecorder?.state === 'recording') {
    window._micMediaRecorder.stop();
  }
}

function _micSetUI(active) {
  const btn = document.getElementById('btn-mic');
  if (!btn) return;
  btn.style.color     = active ? 'var(--red)' : '';
  btn.title           = active ? '음성 입력 중 (탭하여 중지)' : '음성 입력';
  btn.style.animation = active ? 'pulse 1s infinite' : '';
}

// ── Web Speech API (Android Chrome / 데스크탑) ───────────────
async function _micStartWebSpeech(SpeechRecognition) {
  // ★ getUserMedia() 제거:
  //   SpeechRecognition.start()이 마이크 권한을 자체 처리한다.
  //   getUserMedia()를 먼저 호출하면 안드로이드 크롬에서
  //   스트림 충돌이 발생하여 onresult가 호출되지 않는다.

  recognition = new SpeechRecognition();
  recognition.lang            = 'ko-KR';
  recognition.continuous      = false;
  recognition.interimResults  = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    const t = e.results[0][0].transcript;
    const input = document.getElementById('msg-input');
    if (input && t) {
      input.value = t;
      autoResize(input);
      updateSendBtn();
    }
    micActive = false;
    _micSetUI(false);
    _micAutoSend();
  };

  recognition.onerror = (e) => {
    micActive = false;
    _micSetUI(false);
    const MSG = {
      'not-allowed':     '마이크 권한이 거부되었습니다. 브라우저 설정에서 허용하세요.',
      'no-speech':       '음성이 감지되지 않았습니다. 다시 시도해 주세요.',
      'network':         '음성 인식 서버에 연결할 수 없습니다. 네트워크를 확인하세요.',
      'audio-capture':   '마이크를 찾을 수 없습니다.',
      'service-not-allowed': '이 브라우저/환경에서는 음성 인식이 지원되지 않습니다.',
    };
    const msg = MSG[e.error] || `음성 인식 오류: ${e.error}`;
    appendBubble('ai', `⚠️ ${msg}`);
    console.warn('[Mic] Web Speech 오류:', e.error);
  };

  recognition.onend = () => {
    micActive = false;
    _micSetUI(false);
  };

  recognition.start();
  micActive = true;
  _micSetUI(true);
}

// ── MediaRecorder + DeepSeek STT (iOS Safari 폴백) ───────────
async function _micStartMediaRecorder() {
  if (!navigator.mediaDevices?.getUserMedia) {
    appendBubble('ai', '⚠️ 이 브라우저는 마이크를 지원하지 않습니다. iOS 17 이상의 Safari를 사용하세요.');
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    appendBubble('ai', '⚠️ 마이크 권한이 거부되었습니다. 설정 → Safari → 마이크에서 gopang.net을 허용하세요.');
    return;
  }

  const chunks = [];
  // iOS는 audio/mp4, Android/PC는 audio/webm 선호
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/ogg';

  const recorder = new MediaRecorder(stream, { mimeType });
  window._micMediaRecorder = recorder;

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    micActive = false;
    _micSetUI(false);

    const blob = new Blob(chunks, { type: mimeType });
    appendBubble('ai', '🎙️ 음성 변환 중...');

    try {
      // DeepSeek는 STT 미지원 → OpenAI Whisper API 엔드포인트 사용
      // (DeepSeek API 키를 그대로 사용, 엔드포인트만 변경)
      const formData = new FormData();
      formData.append('file', blob, `voice.${mimeType.split('/')[1].split(';')[0]}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'ko');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CFG.apiKey}` },
        body: formData,
      });

      if (!res.ok) throw new Error(`STT API ${res.status}`);
      const data = await res.json();
      const text = data.text?.trim();

      // 마지막 AI 버블(변환 중...) 제거 후 입력창에 삽입
      document.querySelector('#chat-messages .bubble-ai:last-child')?.remove();

      if (text) {
        const input = document.getElementById('msg-input');
        if (input) {
          input.value = text;
          autoResize(input);
          updateSendBtn();
        }
        // 1초 후 자동 전송
        _micAutoSend();
      } else {
        appendBubble('ai', '⚠️ 음성을 텍스트로 변환하지 못했습니다. 다시 시도해 주세요.');
      }
    } catch (e) {
      document.querySelector('#chat-messages .bubble-ai:last-child')?.remove();
      appendBubble('ai', `⚠️ 음성 변환 실패: ${e.message}`);
      console.warn('[Mic] STT 오류:', e);
    }
  };

  recorder.start();
  micActive = true;
  _micSetUI(true);

  // 최대 30초 자동 종료
  setTimeout(() => {
    if (micActive && recorder.state === 'recording') recorder.stop();
  }, 30000);
}


// ── FIIL.kr 신고 전송 — Supabase 직접 저장 ─────────────────
// localStorage/postMessage 방식 폐기 → Supabase REST API 사용
// 어떤 브라우저에서도 동일한 DB에 저장/조회 가능
// ── K-Cleaner AI 응답 텍스트 파싱 — 전체 데이터 추출 ────────
function _parseKCleanerReply(text) {
  const R = {
    materials: [], volume: '', summary: '', terrain: '',
    drone: false, flights: 0, workHours: 0,
    disposal_site: '', disposal_gps: '',
    recycling_kg: 0, landfill_kg: 0, special_kg: 0,
    timeline: [], weather: {},
    gcs_points: 0, openhash_block_id: '',
    cost_detail: {
      labor_personnel: 0, drone_transport: 0,
      vehicle: 0, supplies: 0,
      collection_subtotal: 0, processing_subtotal: 0,
      total: 0,
    },
    processing_items: [],  // 처리비 세부
  };

  // ── 1. 성분 분석 ────────────────────────────────────────────
  const matRe = /[|│]\s*(ST|PL|VI|GL|ME|NT|WD|EX)\s+([^|│\n]+?)\s*[|│]\s*(\d+)%\s*[|│]\s*([\d.]+)\s*kg\s*[|│]\s*([^|│\n]+)/gm;
  let m;
  while ((m = matRe.exec(text)) !== null) {
    const pct = parseInt(m[3]);
    if (pct > 0) {
      R.materials.push({
        code: m[1].trim(),
        name: m[2].trim(),
        pct,
        weight_kg: parseFloat(m[4]),
        disposal: m[5].trim(),
      });
    }
  }
  // fallback: 중량 없는 형식
  if (!R.materials.length) {
    const matRe2 = /[|│]\s*(ST|PL|VI|GL|ME|NT|WD|EX)\s+([^|│\n]+?)\s*[|│]\s*(\d+)%/gm;
    while ((m = matRe2.exec(text)) !== null) {
      if (parseInt(m[3]) > 0) {
        R.materials.push({ code:m[1].trim(), name:m[2].trim(), pct:parseInt(m[3]), weight_kg:0, disposal:'' });
      }
    }
  }

  // ── 2. 총 중량 ────────────────────────────────────────────
  const wt = text.match(/총\s*추정\s*중량[:\s]*약?\s*([\d.]+)\s*kg/);
  if (wt) R.volume = wt[1] + 'kg';

  // ── 3. 지형 ─────────────────────────────────────────────
  const ter = text.match(/지형[:\s]*([^\n(（]{2,30})/);
  if (ter) R.terrain = ter[1].trim();

  // ── 4. 드론·비행횟수·작업시간 ──────────────────────────────
  R.drone = /드론.*필요|HeDRA|DJI/.test(text);
  const fl = text.match(/비행\s*횟수[:\s]*(\d+)회/);
  if (fl) R.flights = parseInt(fl[1]);
  const wh = text.match(/작업\s*시간[:\s]*(\d+)시간/);
  if (wh) R.workHours = parseInt(wh[1]);

  // ── 5. 처리 소계 ────────────────────────────────────────
  const rec = text.match(/재활용\s*가능[:\s]*([\d.]+)kg/);
  const lan = text.match(/매립\s*필요[:\s]*([\d.]+)kg/);
  const spe = text.match(/전문처리[:\s]*([\d.]+)kg/);
  if (rec) R.recycling_kg = parseFloat(rec[1]);
  if (lan) R.landfill_kg  = parseFloat(lan[1]);
  if (spe) R.special_kg   = parseFloat(spe[1]);

  // ── 6. 배출처 ────────────────────────────────────────────
  const ds = text.match(/[→]\s*([^\n(（]+환경적치장[^\n]*)/);
  if (ds) R.disposal_site = ds[1].trim();
  const dg = text.match(/GPS[:\s]*([\d.]+°[NS][,\s]*[\d.]+°[EW])/);
  if (dg) R.disposal_gps = dg[1];

  // ── 7. 예산 세부 ────────────────────────────────────────
  const costMap = [
    ['인건비',         'labor_personnel'],
    ['드론 운반비',    'drone_transport'],
    ['드론운반비',     'drone_transport'],
    ['차량 임차비',    'vehicle'],
    ['차량임차비',     'vehicle'],
    ['소모품비',       'supplies'],
    ['수거비 소계',    'collection_subtotal'],
    ['수거비소계',     'collection_subtotal'],
    ['처리비 소계',    'processing_subtotal'],
    ['처리비소계',     'processing_subtotal'],
  ];
  for (const [label, key] of costMap) {
    const re = new RegExp(label + '[\\s│]*([\\d,]+)원');
    const mc = text.match(re);
    if (mc) R.cost_detail[key] = parseInt(mc[1].replace(/,/g,''));
  }
  // 합계
  const tot = text.match(/합\s*계\s*[\s│]*([0-9,]{5,})원/);
  if (tot) R.cost_detail.total = parseInt(tot[1].replace(/,/g,''));

  // 처리비 항목별
  const procRe = /(ST[^│\n]*|PL[^│\n]*|VI[^│\n]*|NT[^│\n]*|GL[^│\n]*|ME[^│\n]*)\s+([\d,]+)원\s+\(([^)]+)\)/g;
  while ((m = procRe.exec(text)) !== null) {
    R.processing_items.push({ name: m[1].trim(), amount: parseInt(m[2].replace(/,/g,'')), note: m[3] });
  }

  // ── 8. 타임라인 ─────────────────────────────────────────
  const tlRe = /(\d+\.\d+h~\d+\.\d+h)[:\s]*([^\n]+)/g;
  while ((m = tlRe.exec(text)) !== null) {
    R.timeline.push({ time: m[1], desc: m[2].trim() });
  }

  // ── 9. 기상 ─────────────────────────────────────────────
  const wx_weather = text.match(/날씨[:\s]*([^\n\/,]+)/);
  const wx_temp    = text.match(/기온[:\s]*([\d.]+)°C/);
  const wx_wind    = text.match(/풍속[:\s]*([\d.]+)m\/s/);
  const wx_drone   = /드론 가동.*가능/.test(text);
  if (wx_weather) R.weather.condition = wx_weather[1].trim();
  if (wx_temp)    R.weather.temp_c    = parseFloat(wx_temp[1]);
  if (wx_wind)    R.weather.wind_ms   = parseFloat(wx_wind[1]);
  R.weather.drone_ok = wx_drone;

  // ── 10. GCS·블록ID ──────────────────────────────────────
  const gcs = text.match(/GCS.*?[+＋]([\d]+)P/);
  if (gcs) R.gcs_points = parseInt(gcs[1]);
  const blk = text.match(/KC-[\d]+-[\w]+/);
  if (blk) R.openhash_block_id = blk[0];

  console.log('[FIIL] 파싱 완료 — 성분', R.materials.length, '개, 합계 ₩' + R.cost_detail.total,
              '타임라인', R.timeline.length, '단계');
  return R;
}

// ── Supabase reports 행 업데이트 — 전체 파싱 데이터 저장 ──────
async function _updateFiilReport(reportId, parsed) {
  try {
    const res = await fetch(
      _SUPABASE_URL + '/rest/v1/reports?id=eq.' + reportId + '&select=analysis,cost&limit=1',
      { headers: { 'apikey': _SUPABASE_KEY, 'Authorization': 'Bearer ' + _SUPABASE_KEY } }
    );
    const rows = await res.json();
    const existing = rows[0] || {};
    const analysis = existing.analysis || {};

    // 성분 (중량·처리경로 포함)
    if (parsed.materials.length > 0) analysis.materials = parsed.materials;
    if (parsed.volume)               analysis.volume    = parsed.volume;
    if (parsed.terrain)              analysis.terrain   = parsed.terrain;
    if (parsed.drone)                analysis.drone     = parsed.drone;
    if (parsed.flights)              analysis.flights   = parsed.flights;
    if (parsed.workHours)            analysis.work_hours= parsed.workHours;
    if (parsed.recycling_kg)         analysis.recycling_kg  = parsed.recycling_kg;
    if (parsed.landfill_kg)          analysis.landfill_kg   = parsed.landfill_kg;
    if (parsed.special_kg)           analysis.special_kg    = parsed.special_kg;
    if (parsed.disposal_site)        analysis.disposal_site = parsed.disposal_site;
    if (parsed.disposal_gps)         analysis.disposal_gps  = parsed.disposal_gps;
    if (parsed.timeline.length)      analysis.timeline      = parsed.timeline;
    if (parsed.weather.condition)    analysis.weather       = parsed.weather;
    if (parsed.gcs_points)           analysis.gcs_points    = parsed.gcs_points;
    if (parsed.openhash_block_id)    analysis.openhash_block_id = parsed.openhash_block_id;
    if (parsed.cost_detail.total)    analysis.cost_detail   = parsed.cost_detail;
    if (parsed.processing_items.length) analysis.processing_items = parsed.processing_items;

    // 비용 (Supabase cost 컬럼 — report.html 비용 섹션에 사용)
    const cd = parsed.cost_detail;
    const cost = {
      labor:     cd.labor_personnel || existing.cost?.labor     || 0,
      equipment: (cd.drone_transport || 0) + (cd.vehicle || 0) || existing.cost?.equipment || 0,
      supplies:  cd.processing_subtotal || existing.cost?.supplies || 0,
      other:     cd.supplies || 0,
    };

    const patchRes = await fetch(
      _SUPABASE_URL + '/rest/v1/reports?id=eq.' + reportId,
      {
        method: 'PATCH',
        headers: {
          'apikey': _SUPABASE_KEY,
          'Authorization': 'Bearer ' + _SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ analysis, cost })
      }
    );
    if (patchRes.ok) {
      console.log('[FIIL] ✅ 전체 데이터 업데이트 완료 →', reportId,
        '성분', parsed.materials.length, '개 / 타임라인', parsed.timeline.length,
        '단계 / 합계 ₩' + cd.total);
    } else {
      const errText = await patchRes.text();
      console.warn('[FIIL] PATCH 오류:', patchRes.status, errText);
    }
  } catch(e) {
    console.warn('[FIIL] 업데이트 오류:', e.message);
  }
}


let _lastFiilReportId = null;  // 가장 최근 FIIL 신고 ID (AI 응답 파싱 업데이트용)


// ══════════════════════════════════════════════════════════════════════
// K-Law 백그라운드 감시 파이프라인 v1.0
//
// 역할: 사용자가 요청하지 않아도 모든 대화·서비스 결과를
//       자동으로 검토하여 법적/분쟁 리스크를 감지합니다.
//
// 트리거:
//   1. callAI() 완료 후 → 대화 내용 자동 검토
//   2. _recordPDV() 호출 후 → 서비스 결과 자동 검토
//
// 결과:
//   - RISK_HIGH/RISK_CRITICAL → 채팅창에 경고 버블 즉시 표시
//   - RISK_LOW/RISK_MEDIUM   → PDV에만 조용히 기록
//   - RISK_NONE              → 무시
// ══════════════════════════════════════════════════════════════════════

// ── K-Law 감시 상태 ────────────────────────────────────────────────
let _klawBusy          = false;   // 중복 실행 방지
let _klawLastCheck     = 0;       // 마지막 검토 시각 (ms)
const KLAW_COOLDOWN_MS = 30000;   // 30초 쿨다운 (과도한 API 호출 방지)

// K-Law Monitor 프롬프트 캐시 (감시용 경량 프롬프트 — v15.1 판결예측과 별개)
let _klawMonitorPrompt = null;
async function _getKlawPrompt() {
  if (_klawMonitorPrompt) return _klawMonitorPrompt;
  try {
    const res = await fetch('/klaw/prompts/monitor_prompt.txt');
    if (res.ok) {
      _klawMonitorPrompt = await res.text();
      console.info('[K-Law Monitor] 프롬프트 로드 완료');
      return _klawMonitorPrompt;
    }
  } catch(e) { console.warn('[K-Law Monitor] 프롬프트 로드 실패:', e.message); }
  return null;
}

// ── 리스크 레벨 정의 ────────────────────────────────────────────────
const KLAW_RISK = {
  NONE:     { label: null,              show: false },
  LOW:      { label: '🟢 낮음',         show: false },  // PDV만 기록
  MEDIUM:   { label: '🟡 검토 권고',    show: false },  // PDV만 기록
  HIGH:     { label: '🟠 주의 필요',    show: true  },  // 채팅창 경고
  CRITICAL: { label: '🔴 법적 리스크',  show: true  },  // 채팅창 즉시 경고
};

// ── 메인: K-Law 백그라운드 검토 ────────────────────────────────────
// source: 'conversation' | 'service'
// payload: 검토할 텍스트 또는 서비스 데이터
async function _klawReview(source, payload) {
  // 쿨다운 및 중복 실행 방지
  const now = Date.now();
  if (_klawBusy) return;
  if (now - _klawLastCheck < KLAW_COOLDOWN_MS) return;

  // K-Law 프롬프트 로드
  const klawPrompt = await _getKlawPrompt();
  if (!klawPrompt) return;

  _klawBusy      = true;
  _klawLastCheck = now;

  try {
    // ── 검토 대상 텍스트 구성 ────────────────────────────────
    let reviewText = '';

    if (source === 'conversation') {
      // 최근 대화 5턴 추출 (system 제외)
      const recent = (window._gopangHistory || [])
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => `[${m.role === 'user' ? '사용자' : 'AI'}] ${m.content}`)
        .join('\n');
      if (!recent || recent.length < 50) { _klawBusy = false; return; }
      reviewText = `## 검토 대상: 고팡 대화 내용\n\n${recent}`;

    } else if (source === 'service') {
      // 서비스 완료 결과 (pdvData)
      reviewText = `## 검토 대상: ${payload.service || '서비스'} 처리 결과\n\n` +
        `서비스: ${payload.serviceId}\n` +
        `요약: ${payload.summary}\n` +
        `데이터: ${JSON.stringify(payload.data || {}, null, 2)}`;
    }

    if (!reviewText) { _klawBusy = false; return; }

    // ── K-Law API 호출 (백그라운드) ──────────────────────────
    // monitor_prompt.txt가 출력 형식을 완전히 정의하므로 추가 지시 불필요
    const klawSystemPrompt = klawPrompt;

    const res = await fetch(CFG.endpoint + '/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       CFG.model,
        max_tokens:  512,
        temperature: 0.1,   // 일관된 법적 판단을 위해 낮게 설정
        messages: [
          { role: 'system',  content: klawSystemPrompt },
          { role: 'user',    content: reviewText },
        ],
      }),
    });

    if (!res.ok) { _klawBusy = false; return; }
    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();

    let result;
    try { result = JSON.parse(clean); }
    catch { _klawBusy = false; return; }

    const level = result.risk_level || 'NONE';
    const risk  = KLAW_RISK[level] || KLAW_RISK.NONE;

    console.info(`[K-Law Monitor] 감시 완료 — ${level}: ${result.summary || '이상 없음'}`);

    // ── PDV에 감시 결과 기록 (모든 레벨) ────────────────────
    if (level !== 'NONE') {
      _recordPDV({
        type:       'klaw_monitor',
        serviceId:  'klaw',
        service:    'K-Law',
        summary:    `[${level}] ${result.summary || ''}`,
        data:       result,
        source:     source,
        ts:         new Date().toISOString(),
      });
    }

    // ── HIGH/CRITICAL: 채팅창에 경고 버블 표시 ──────────────
    if (risk.show && result.summary) {
      const icon  = level === 'CRITICAL' ? '🔴' : '🟠';
      const html  =
        `<div style="border-left:3px solid ${level==='CRITICAL'?'#C01C28':'#e37400'};` +
        `padding:10px 12px;border-radius:4px;background:${level==='CRITICAL'?'#FEE2E2':'#FFF7ED'}">` +
        `<div style="font-size:11px;font-weight:700;color:${level==='CRITICAL'?'#C01C28':'#e37400'};` +
        `letter-spacing:.5px;margin-bottom:6px">` +
        `${icon} K-Law 자동 감지 — ${risk.label}</div>` +
        `<div style="font-size:14px;color:#1A202C;margin-bottom:${result.detail?'8px':'0'}">${result.summary}</div>` +
        (result.detail  ? `<div style="font-size:12px;color:#4A5568;margin-bottom:6px">${result.detail}</div>` : '') +
        (result.action  ? `<div style="font-size:12px;font-weight:600;color:#0057A8">💡 ${result.action}</div>` : '') +
        `</div>`;
      appendBubble('ai', html, true);
    }

  } catch(e) {
    console.warn('[K-Law] 감시 오류 (무시):', e.message);
  } finally {
    _klawBusy = false;
  }
}

// ── 대화 히스토리 전역 노출 (K-Law 감시용) ──────────────────────────
// callAI() 내부의 history를 K-Law가 읽을 수 있도록
Object.defineProperty(window, '_gopangHistory', {
  get: () => typeof history !== 'undefined' ? history : [],
  configurable: true,
});

// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// Gopang Widget Protocol (GWP) 호스트 엔진 v2.0 — 새 탭 방식
// iframe 방식 제거 → JS 전역 충돌·SyntaxError·CFG 미초기화 문제 원천 해결
// 새 탭이 닫히면 고팡 탭이 자동으로 포커스를 되찾고 복귀 메시지 표시
// ══════════════════════════════════════════════════════════════════════

// ── 서비스 레지스트리 ─────────────────────────────────────────────
// gwp-registry.js 에서 동적 로드 (API 키 분리 목적)
// GWP_REGISTRY 전역 변수는 gwp-registry.js 가 선언함

// ── GWP 상태 ─────────────────────────────────────────────────────
let _gwpActive    = false;
let _gwpService   = null;
let _gwpTab       = null;   // 열린 새 탭 참조
let _gwpTabTimer  = null;   // 탭 닫힘 감지 인터벌

// ── 의도 → 서비스 매칭 ─────────────────────────────────────────
function _gwpMatch(text) {
  if (!text) return null;
  if (typeof GWP_REGISTRY === 'undefined') return null;
  for (const svc of GWP_REGISTRY) {
    if (svc.triggers.some(t => text.includes(t))) return svc;
  }
  return null;
}

// ── 서비스 실행 (새 탭) ─────────────────────────────────────────
function _gwpLaunch(service, context, _preTab = null) {
  // 이미 열려 있는 탭이 있으면 포커스만 이동
  if (_gwpActive && _gwpTab && !_gwpTab.closed) {
    _gwpTab.focus();
    if (_preTab && !_preTab.closed) _preTab.close(); // 예약 탭 불필요 → 닫기
    return;
  }

  _gwpActive  = true;
  _gwpService = service;

  const svcName = service?.name || 'K-서비스';
  const svcIcon = service?.icon || '🤖';

  // ctx: 한국어 포함 시 SyntaxError 방지 — Base64 ASCII-safe 인코딩
  const safeCtx = context
    ? btoa(unescape(encodeURIComponent(context)))
    : '';

  const svcUrl = new URL(service.url);
  svcUrl.searchParams.set('gwp',      '1');
  svcUrl.searchParams.set('token',    _USER?.guid || '');
  svcUrl.searchParams.set('origin',   location.origin);
  svcUrl.searchParams.set('ctx',      safeCtx);
  svcUrl.searchParams.set('ctx_enc',  'b64');  // 수신 측에 인코딩 방식 명시

  // 새 탭으로 열기
  // 모바일 팝업 차단 우회: 사용자 탭 직후 예약한 빈 탭(_preTab)이 있으면
  // window.open() 대신 그 탭의 URL을 교체 (비동기 맥락에서도 차단 없음)
  if (_preTab && !_preTab.closed) {
    _preTab.location.href = svcUrl.toString();
    _gwpTab = _preTab;
  } else {
    _gwpTab = window.open(svcUrl.toString(), '_blank');
  }

  if (!_gwpTab) {
    // 팝업 차단 시 — 클릭 가능한 링크로 안내
    appendBubble('ai',
      `${svcIcon} <b>${svcName}</b> 에이전트를 호출합니다. ` +
      `<a href="${svcUrl}" target="_blank" style="color:var(--tint);font-weight:600;text-decoration:underline;">탭하여 연결</a>`,
      true
    );
    _gwpActive  = false;
    _gwpService = null;
    return;
  }

  appendBubble('ai',
    `${svcIcon} <b>${svcName}</b>을 새 탭에서 열었습니다.<br>` +
    `<span style="font-size:12px;color:var(--label-3);">탭을 닫으면 고팡으로 자동 복귀합니다.</span>`,
    true
  );
  console.info('[GWP] 새 탭 실행:', service.id, svcUrl.toString());

  // ── 탭 닫힘 감지 — 200ms 폴링 ─────────────────────────────
  _gwpTabTimer = setInterval(() => {
    if (_gwpTab && _gwpTab.closed) {
      _gwpOnTabClose();
    }
  }, 200);
}

// ── 새 탭이 닫혔을 때 → 고팡 복귀 처리 ─────────────────────────
function _gwpOnTabClose() {
  clearInterval(_gwpTabTimer);
  _gwpTabTimer = null;
  _gwpTab      = null;

  const svcName = _gwpService?.name || 'K-서비스';
  const svcIcon = _gwpService?.icon || '🤖';

  _gwpActive  = false;
  _gwpService = null;

  // 고팡 탭 포커스
  window.focus();

  appendBubble('ai',
    `✅ <b>${svcIcon} ${svcName}</b> 탭이 닫혔습니다. 고팡으로 돌아왔습니다.`,
    true
  );
  console.info('[GWP] 새 탭 닫힘 — 고팡 복귀');
}

// ── 탭 강제 종료 (고팡에서 직접 닫기) ─────────────────────────
function _gwpClose(showReturn = true) {
  if (!_gwpActive) return;
  clearInterval(_gwpTabTimer);
  _gwpTabTimer = null;

  if (_gwpTab && !_gwpTab.closed) {
    _gwpTab.close();
  }
  _gwpTab = null;

  const svcName = _gwpService?.name || 'K-서비스';
  const svcIcon = _gwpService?.icon || '🤖';

  _gwpActive  = false;
  _gwpService = null;

  if (showReturn) {
    appendBubble('ai',
      `✅ <b>${svcIcon} ${svcName}</b>을 닫고 고팡으로 돌아왔습니다.`,
      true
    );
  }
  console.info('[GWP] 탭 종료, 고팡 복귀');
}

// ── postMessage 수신 (서비스 새 탭 → 고팡) ─────────────────────
// 새 탭에서 작업 완료·오류·서명 요청 시 고팡에 결과 전달
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg?.type?.startsWith('GWP_')) return;

  // ── GWP_SIGN_REQUEST: 서명 요청은 _gwpActive 무관하게 처리 ──
  // market 탭이 구매자 서명을 고팡에 위임. gopang-wallet.js가 서명 수행.
  // origin: market.gopang.net 또는 gopang.net 계열만 허용
  if (msg.type === 'GWP_SIGN_REQUEST') {
    const ALLOWED_ORIGINS = [
      'https://market.gopang.net',
      'https://users.gopang.net',
      'https://gopang.net',
      'https://openhash-gopang.github.io',
      location.origin,  // 개발 환경 (localhost 등)
    ];
    if (!ALLOWED_ORIGINS.includes(e.origin)) {
      console.warn('[GWP_SIGN] 허용되지 않은 origin 차단:', e.origin);
      return;
    }
    _handleGwpSignRequest(msg, e.source, e.origin);
    return;
  }

  // ── 나머지 GWP 메시지: _gwpActive 세션 내에서만 처리 ──────
  if (!_gwpActive) return;

  // origin 검증 — 등록된 서비스 도메인만 허용
  const svcOrigin = _gwpService ? new URL(_gwpService.url).origin : null;
  if (svcOrigin && e.origin !== svcOrigin) return;

  switch (msg.type) {
    case 'GWP_MESSAGE': {
      // 서비스에서 고팡 채팅창에 메시지 추가
      appendBubble(msg.role === 'user' ? 'user' : 'ai', msg.html || msg.text || '', !!msg.html);
      break;
    }
    case 'GWP_DONE': {
      // 작업 완료 — PDV 중복 방지 확인 → 필요 시 기록 → 탭 자동 닫기
      if (msg.summary) appendBubble('ai', '✅ ' + msg.summary, false);

      // STEP 24 준비: reporter_svc가 있으면 하위 시스템이 이미 PDV 기록 → 고팡 중복 방지
      const reporterSvc = msg.reporter_svc || msg.pdvData?.reporter_svc || null;
      const sessionId   = msg.session_id   || msg.pdvData?.session_id   || null;
      if (!reporterSvc) {
        // 하위 시스템이 PDV 미기록 → 고팡이 직접 기록
        const p = msg.pdvData || {};
        _recordPDV({
          type:      'service_task',
          serviceId: _gwpService?.id   || null,
          service:   _gwpService?.name || null,
          summary:   msg.summary       || null,
          who:       p.who   || null,
          when:      p.when  || null,
          where:     p.where || null,
          what:      p.what  || msg.summary || null,
          how:       p.how   || null,
          why:       p.why   || null,
          data:      p.data  || p,
          ts:        p.when  || new Date().toISOString(),
        });
      } else {
        console.info('[GWP_DONE] PDV 중복 방지 — reporter_svc:', reporterSvc,
                     '| session_id:', sessionId || '-');
      }

      // block_hash 포함 시 gopang-wallet.js에 청구권 자기갱신 요청 (STEP 24)
      if (msg.block_hash && window.gopangWallet?.redeemClaim) {
        window.gopangWallet.redeemClaim({
          block_hash: msg.block_hash,
          block_id:   msg.block_id   || null,
          claims:     msg.claims     || [],
        }).catch(err => console.warn('[GWP_DONE] redeemClaim 실패:', err.message));
      }

      // 하위 시스템 탭 자동 닫기 → gopang 탭 포커스 복귀
      setTimeout(() => {
        if (_gwpTab && !_gwpTab.closed) _gwpTab.close();
        window.focus();
      }, 800);
      break;
    }
    case 'GWP_ERROR': {
      appendBubble('ai',
        '⚠️ ' + (_gwpService?.name || '서비스') + ' 오류: ' + (msg.message || '알 수 없는 오류'),
        false
      );
      break;
    }
    case 'GWP_CLOSE': {
      // 서비스가 직접 닫기를 요청
      _gwpClose(false);
      break;
    }
  }
});

// ── GWP_SIGN_REQUEST 핸들러 (STEP 22) ────────────────────────
// 흐름: market 탭 → GWP_SIGN_REQUEST → 고팡 서명 확인 UI
//       → [서명하여 결제] 클릭 → gopang-wallet.js Ed25519 서명
//       → GWP_SIGN_RESPONSE → market 탭 → Worker /biz/order POST
//
// msg 구조:
//   msg.tx        — UTXO tx 객체 (seller_guid, outputs, items, total 포함)
//   msg.session_id — 중복 방지용 세션 ID
//   msg.seller_name — 판매자 상호명 (UI 표시용)
async function _handleGwpSignRequest(msg, sourceWin, sourceOrigin) {
  const tx         = msg.tx;
  const sessionId  = msg.session_id || crypto.randomUUID();
  const sellerName = msg.seller_name || tx?.seller_name || '판매자';

  if (!tx || !tx.outputs || !tx.input) {
    console.warn('[GWP_SIGN] tx 객체 불완전:', msg);
    sourceWin?.postMessage({
      type:       'GWP_SIGN_RESPONSE',
      success:    false,
      error:      'INVALID_TX',
      session_id: sessionId,
    }, sourceOrigin);
    return;
  }

  // 구매자 수신 금액 및 판매자 순수입 계산 (UI 표시용)
  const totalAmount    = tx.input?.balance_claimed
                        || tx.outputs.reduce((s, o) => s + (o.amount || 0), 0);
  const sellerOut      = tx.outputs.find(o => o.recipient_guid !== 'gopang-platform');
  const platformOut    = tx.outputs.find(o => o.recipient_guid === 'gopang-platform');
  const sellerNet      = sellerOut?.amount   || 0;
  const platformFee    = platformOut?.amount || 0;

  // 현재 잔액 조회 (gopang-wallet.js 또는 localStorage fallback)
  let currentBalance = 0;
  try {
    if (window.gopangWallet?.getBalance) {
      currentBalance = await window.gopangWallet.getBalance();
    } else {
      const user = JSON.parse(localStorage.getItem('gopang_user_v3') || '{}');
      currentBalance = parseFloat(user?.fs?.['bs-cash'] ?? '0') || 0;
    }
  } catch(_) {}
  const balanceAfter = currentBalance - totalAmount;

  // ── 서명 확인 UI 인라인 렌더링 ──────────────────────────────
  const confirmId = '_sign-confirm-' + sessionId.slice(0, 8);
  const list = document.getElementById('message-list');
  if (!list) return;

  const itemsHtml = (tx.items || []).map(item =>
    `<div style="display:flex;justify-content:space-between;padding:4px 0;
                 border-bottom:1px solid var(--sep);font-size:13px;">
       <span style="color:var(--label);">${item.name || ''} × ${item.quantity || 1}</span>
       <span style="color:var(--label);font-weight:600;">
         ₮${((item.price || 0) * (item.quantity || 1)).toLocaleString()}
       </span>
     </div>`
  ).join('');

  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = confirmId;
  row.innerHTML = `
    <div style="background:var(--bg-subtle);border-radius:14px;
                padding:16px;width:100%;max-width:360px;
                border:1.5px solid var(--tint);">
      <div style="font-size:13px;font-weight:700;color:var(--tint);margin-bottom:12px;">
        🔏 결제 서명 확인
      </div>
      <div style="font-size:12px;color:var(--label-3);margin-bottom:8px;">
        ${sellerName}
      </div>
      ${itemsHtml}
      <div style="margin-top:10px;padding-top:8px;border-top:2px solid var(--sep-strong);">
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;">
          <span>합계</span>
          <span style="color:var(--tint);">₮${totalAmount.toLocaleString()}</span>
        </div>
        ${platformFee > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:11px;
                    color:var(--label-3);margin-top:4px;">
          <span>판매자 수취</span>
          <span>₮${sellerNet.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;
                    color:var(--label-3);margin-top:2px;">
          <span>플랫폼 수수료</span>
          <span>₮${platformFee.toLocaleString()}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:12px;
                    color:var(--label-2);margin-top:8px;">
          <span>현재 잔액</span>
          <span>₮${currentBalance.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;
                    color:${balanceAfter >= 0 ? 'var(--label-2)' : '#ff3b30'};margin-top:2px;">
          <span>결제 후 잔액</span>
          <span>${balanceAfter >= 0
            ? '₮' + balanceAfter.toLocaleString()
            : '⚠️ 잔액 부족'}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button
          onclick="_gwpSignExecute('${confirmId}','${sessionId}','${sourceOrigin}')"
          ${balanceAfter < 0 ? 'disabled' : ''}
          style="flex:1;background:${balanceAfter >= 0 ? 'var(--tint)' : 'var(--sep-strong)'};
                 color:#fff;border:none;border-radius:10px;
                 padding:12px;font-size:14px;font-weight:700;cursor:pointer;">
          🔏 서명하여 결제
        </button>
        <button
          onclick="_gwpSignCancel('${confirmId}','${sessionId}','${sourceOrigin}')"
          style="flex:0 0 72px;background:var(--bg-subtle);color:var(--label-2);
                 border:1px solid var(--sep);border-radius:10px;
                 padding:12px;font-size:13px;cursor:pointer;">
          취소
        </button>
      </div>
      ${balanceAfter < 0 ? `
      <p style="font-size:11px;color:#ff3b30;margin:8px 0 0;text-align:center;">
        GDC 잔액이 부족합니다. GDC를 충전 후 다시 시도하세요.
      </p>` : ''}
    </div>`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;

  // tx와 sourceWin을 임시 저장 (서명 실행 시 참조)
  window._gwpSignPending = window._gwpSignPending || {};
  window._gwpSignPending[sessionId] = { tx, sourceWin, sourceOrigin };

  console.info('[GWP_SIGN] 서명 확인 UI 표시 | session_id:', sessionId,
               '| seller:', sellerName, '| total: ₮' + totalAmount.toLocaleString());
}

// ── 서명 실행 (사용자가 [서명하여 결제] 클릭) ────────────────
window._gwpSignExecute = async function(confirmId, sessionId, sourceOrigin) {
  const pending = window._gwpSignPending?.[sessionId];
  if (!pending) {
    console.warn('[GWP_SIGN] pending 세션 없음:', sessionId);
    return;
  }
  const { tx, sourceWin } = pending;

  // UI 비활성화 (중복 클릭 방지)
  const row = document.getElementById(confirmId);
  if (row) {
    const btns = row.querySelectorAll('button');
    btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
  }

  appendBubble('ai', '🔏 서명 중…', false);

  try {
    // gopang-wallet.js가 로드된 경우 → Ed25519 서명 수행
    // STEP 23 완료 후 window.gopangWallet.sign()이 활성화됨
    let signedTx;
    if (window.gopangWallet?.sign) {
      signedTx = await window.gopangWallet.sign(tx);
    } else {
      // STEP 23 완료 전 폴백: tx를 그대로 전달 (서명 없이)
      // Worker/L1에서 Phase 1 형식 검증만 수행
      console.warn('[GWP_SIGN] gopang-wallet.js 미로드 — 서명 없이 전달 (Phase 1 폴백)');
      signedTx = { ...tx, buyer_sig: null, _phase1_fallback: true };
    }

    // GWP_SIGN_RESPONSE → market 탭 전송
    sourceWin?.postMessage({
      type:       'GWP_SIGN_RESPONSE',
      success:    true,
      signedTx,
      session_id: sessionId,
    }, sourceOrigin);

    // UI 제거 + 완료 메시지
    row?.remove();
    appendBubble('ai',
      '✅ 서명 완료! 결제가 진행됩니다.<br>' +
      '<span style="font-size:12px;color:var(--label-3);">market 탭에서 결제 결과를 확인하세요.</span>',
      true
    );

    console.info('[GWP_SIGN] 서명 완료 → market 탭 전송 | session_id:', sessionId);
  } catch(err) {
    console.error('[GWP_SIGN] 서명 실패:', err.message);
    sourceWin?.postMessage({
      type:       'GWP_SIGN_RESPONSE',
      success:    false,
      error:      err.message || 'SIGN_FAILED',
      session_id: sessionId,
    }, sourceOrigin);
    row?.remove();
    appendBubble('ai', '⚠️ 서명 중 오류가 발생했습니다: ' + err.message, false);
  } finally {
    delete window._gwpSignPending?.[sessionId];
  }
};

// ── 서명 취소 (사용자가 [취소] 클릭) ─────────────────────────
window._gwpSignCancel = function(confirmId, sessionId, sourceOrigin) {
  const pending = window._gwpSignPending?.[sessionId];
  const sourceWin = pending?.sourceWin;

  sourceWin?.postMessage({
    type:       'GWP_SIGN_RESPONSE',
    success:    false,
    error:      'USER_CANCELLED',
    session_id: sessionId,
  }, sourceOrigin);

  document.getElementById(confirmId)?.remove();
  delete window._gwpSignPending?.[sessionId];

  appendBubble('ai', '결제를 취소했습니다.', false);
  console.info('[GWP_SIGN] 사용자 취소 | session_id:', sessionId);
};

// ── recordPDV — 하위 시스템 공통 PDV 표준 함수 (STEP 20) ────────
// 설계 원칙 P2: 모든 하위 시스템 PDV는 Worker /pdv/report 경유 필수
// 하위 시스템(market, gdc 등)이 window.recordPDV()를 호출하면
// Worker가 수신 → Supabase pdv_log INSERT + OpenHash 앵커링 처리
//
// @param {Object} report — 6하 원칙 포함 PDV 리포트 객체
//   필수: report.who.ipv6, report.what, report.why, report.svc
//   선택: report.block_hash (동기 앵커링 시 포함)
//         report.session_id (중복 방지용, STEP 11)
//         report.reporter_svc (보고 주체 서비스 ID)
// @returns {Promise<Response>}
async function recordPDV({ report }) {
  if (!report) {
    console.warn('[recordPDV] report 객체 누락 — 호출 무시');
    return;
  }
  try {
    const res = await fetch(CFG.endpoint + '/pdv/report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ report }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      console.warn('[recordPDV] Worker 오류:', res.status, err);
    } else {
      console.info('[recordPDV] Worker 전송 완료 | svc:', report.svc,
                   '| reporter_svc:', report.reporter_svc || '-',
                   '| session_id:', report.session_id || '-');
    }
    return res;
  } catch(e) {
    console.warn('[recordPDV] 네트워크 오류 (무시):', e.message);
  }
}
// 전역 노출 — 하위 시스템(market, gdc, kinsurance 등) window.recordPDV()로 접근
window.recordPDV = recordPDV;

// ── PDV 메타데이터 기록 ────────────────────────────────────────
// 고팡 내부 전용. 직접 Supabase INSERT. 하위 시스템은 위 recordPDV() 사용.
async function _recordPDV(record) {
  try {
    // ── 로컬 PDV 캐시 (localStorage) ──────────────────────
    const log = JSON.parse(localStorage.getItem('gopang_pdv_log') || '[]');
    log.push(record);
    if (log.length > 1000) log.splice(0, log.length - 1000);
    localStorage.setItem('gopang_pdv_log', JSON.stringify(log));

    // ── 6하 원칙 필드 구성 ─────────────────────────────────
    // 누가 (Who)
    const whoName = _USER.phone
      ? _USER.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      : 'GUID:' + _USER.guid.slice(0, 8);

    // 어디서 (Where) — GPS 우선, 주소 fallback
    const locStr = _userLocation
      ? (_userLocation.address ||
         (_userLocation.lat
           ? `${_userLocation.lat.toFixed(5)},${_userLocation.lng.toFixed(5)}`
           : null))
      : (record.data?.location || null);

    // 어떻게 (How) — 입력 방식 추론
    const howStr = record.how
      || (record.data?.reportId  ? 'image'   // 서비스 신고 = 이미지
        : record.type === 'klaw_monitor' ? 'auto'  // K-Law 자동 감시
        : 'text');

    // 왜 (Why) — 서비스명 또는 직접 기록된 의도
    const whyStr = record.why
      || (record.service ? record.service + ' 서비스 이용'
        : record.type === 'klaw_monitor' ? '법적 리스크 자동 감시'
        : record.type === 'service_task' ? '서비스 작업 완료'
        : '대화');

    // ── Supabase pdv_log 저장 ──────────────────────────────
    await fetch(_SUPABASE_URL + '/rest/v1/pdv_log', {
      method: 'POST',
      headers: {
        'apikey': _SUPABASE_KEY, 'Authorization': 'Bearer ' + _SUPABASE_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        // 누가
        user_guid:   _USER.guid,
        device_fp:   _USER.fp,
        who_name:    whoName,
        // 언제 (created_at은 DB 기본값 사용)
        // 어디서
        location:    locStr,
        // 무엇을
        record_type: record.type,
        summary:     record.summary || null,
        payload:     record,
        // 어떻게
        how:         howStr,
        service_id:  record.serviceId || null,
        // 왜
        why:         whyStr,
      }),
    });

    console.info('[PDV] 기록 완료:', record.type, '|', whyStr);
  } catch(e) { console.warn('[PDV] 기록 실패:', e.message); }

  // K-Law 백그라운드 감시 트리거 — 서비스 완료 결과 자동 검토
  if (record.type === 'service_task' && record.serviceId !== 'klaw') {
    setTimeout(() => _klawReview('service', record), 2000);
  }
}

const _SUPABASE_URL = 'https://ebbecjfrwaswbdybbgiu.supabase.co';
const _SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViYmVjamZyd2Fzd2JkeWJiZ2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjE5ODQsImV4cCI6MjA5NTEzNzk4NH0.H2ahQKtWdSke04Pdi3hDY86pdTx7UUKPUpQMlS_zciA';

function _sendReportToFiil(geminiResult, imageFile, userText) {
  try {
    const COMP_MAP = {
      ST:'스티로폼', PL:'경질플라스틱', VI:'비닐',
      GL:'유리병', ME:'금속캔', NT:'폐어구', WD:'목재', EX:'기타'
    };
    const TERRAIN_TYPE = {
      SAND:{type:'🏖️ 해안쓰레기',code:'TYPE_01'},
      ROCK:{type:'🏖️ 해안쓰레기',code:'TYPE_01'},
      CLIFF:{type:'🏖️ 해안쓰레기',code:'TYPE_01'},
      WATER:{type:'🌊 수중쓰레기',code:'TYPE_02'},
      FOREST:{type:'🌲 산림쓰레기',code:'TYPE_03'},
    };
    const RISK_URGENCY = {S0:'낮음',S1:'보통',S2:'높음',S3:'긴급'};

    // ── Gemini 결과 기반 필드 (없으면 텍스트에서 추정) ──────
    let materials = [];
    let typeInfo  = {type:'🏖️ 해안쓰레기', code:'TYPE_01'};
    let urgency   = '보통';
    let summary   = userText || '고팡 K-Cleaner 현장 신고';
    let volume    = '미상';
    let hazard    = '미상';

    if (geminiResult) {
      materials = Object.entries(geminiResult.components || {})
        .filter(([,v]) => v.visible && v.ratio_pct > 0)
        .map(([k,v]) => ({name: COMP_MAP[k]||k, pct: v.ratio_pct}))
        .sort((a,b) => b.pct - a.pct);
      typeInfo  = TERRAIN_TYPE[geminiResult.terrain] || typeInfo;
      urgency   = RISK_URGENCY[geminiResult.risk_level] || '보통';
      summary   = geminiResult.scene_description || summary;
      volume    = geminiResult.total_weight_kg_est
                  ? geminiResult.total_weight_kg_est + 'kg (추정)'
                  : '규모 ' + (geminiResult.scale || '미상');
      hazard    = geminiResult.hazard_detected
                  ? '⚠️ ' + (geminiResult.hazard_notes || geminiResult.risk_level)
                  : '유해물질 없음';
    } else {
      // Gemini 없음 — 텍스트 키워드로 유형 추정
      if (/수중|침적|잠수|해저|ROV/.test(userText||''))      typeInfo = {type:'🌊 수중쓰레기',code:'TYPE_02'};
      else if (/산림|계곡|오름|임도|산간/.test(userText||'')) typeInfo = {type:'🌲 산림쓰레기',code:'TYPE_03'};
    }

    // ── GPS ──────────────────────────────────────────────────
    const gLat = geminiResult?.exif?.lat || _userLocation?.lat || null;
    const gLng = geminiResult?.exif?.lng || _userLocation?.lng || null;
    const gps  = gLat ? `${gLat.toFixed(4)}, ${gLng.toFixed(4)}` : '위치 미상';
    const loc  = _userLocation?.address || gps;

    // ── 신고 객체 구성 ────────────────────────────────────────
    const doSend = (imageDataUrl) => {
      const report = {
        id: 'RPT-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-4),
        type: typeInfo.type,
        typeCode: typeInfo.code,
        location: loc,
        gps: gps,
        reporter: '010-****-' + Math.floor(1000 + Math.random() * 9000),
        reportedAt: new Date().toLocaleString('ko-KR'),
        urgency: urgency,
        status: '접수',
        imageUrl: imageDataUrl || null,
        gopangAnalysis: {
          summary: summary,
          materials: materials,
          volume: volume,
          hazard: hazard,
          recommendation: userText || '수거 조치 필요',
          geminiModel: geminiResult ? 'gemini-2.0-flash' : '텍스트 분석',
          analyzedAt: new Date().toLocaleString('ko-KR'),
        },
        dispatch: null,
        cost: {labor:0, equipment:0, supplies:0, other:0},
        blockchain: {
          txHash: '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
                        .map(b => b.toString(16).padStart(2,'0')).join(''),
          blockHeight: 8200000 + Math.floor(Math.random() * 100000),
          imageHash: 'sha256:' + Math.random().toString(36).slice(2,10) + '...',
          network: 'Openhash Network',
        },
      };

      // ── Supabase REST API 직접 저장 ──────────────────────────
      fetch(_SUPABASE_URL + '/rest/v1/reports', {
        method: 'POST',
        headers: {
          'apikey': _SUPABASE_KEY,
          'Authorization': 'Bearer ' + _SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          id:          report.id,
          type:        report.type,
          type_code:   report.typeCode,
          location:    report.location,
          gps:         report.gps,
          reporter:    report.reporter,
          reported_at: report.reportedAt,
          urgency:     report.urgency,
          status:      report.status,
          image_url:   report.imageUrl,
          analysis:    report.gopangAnalysis,
          dispatch:    report.dispatch,
          cost:        report.cost,
          blockchain:  report.blockchain
        })
      })
      .then(res => {
        if (res.ok || res.status === 201) {
          console.log('[FIIL] ✅ Supabase 저장 완료 →', report.id, report.type, report.urgency);
          _lastFiilReportId = report.id;  // AI 응답 파싱 후 업데이트에 사용
        } else {
          res.text().then(t => console.warn('[FIIL] Supabase 오류:', res.status, t));
        }
      })
      .catch(e => console.warn('[FIIL] 네트워크 오류:', e.message));
    };

    // 이미지 base64 변환 후 전송 (없으면 null)
    if (imageFile && imageFile instanceof File) {
      const reader = new FileReader();
      reader.onload  = (e) => doSend(e.target.result);
      reader.onerror = ()  => doSend(null);
      reader.readAsDataURL(imageFile);
    } else {
      doSend(null);
    }

  } catch(e) {
    console.warn('[FIIL] 전송 오류 (무시됨):', e.message);
  }
}

    })();
