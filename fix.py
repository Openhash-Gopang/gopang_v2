import re

WORKER = r'C:\Users\주피터\Downloads\gopang\worker.js'

with open(WORKER, encoding='utf-8') as f:
    src = f.read()

# ── 1. /ai-setup 라우트 추가 ──────────────────────────────────
# 삽입 위치: "/biz/product" 라우트 바로 뒤
old_route = "    if (pathname === '/biz/product' && request.method === 'POST') return handleBizProduct(request, env, corsHeaders);"

new_route = old_route + """

    // ── ai-setup (AI 비서 설정) ─────────────────────────────
    if (pathname === '/ai-setup') {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) return _err(401, 'UNAUTHORIZED', 'JWT 필수', corsHeaders);
      const jwt = _parseGopangJWT(token, env);
      if (!jwt) return _err(401, 'INVALID_TOKEN', 'JWT 만료 또는 위조', corsHeaders);
      const guid = jwt.guid;
      if (!guid) return _err(401, 'NO_GUID', 'guid 없음', corsHeaders);
      if (request.method === 'GET')  return handleAiSetupGet(request, env, corsHeaders, guid);
      if (request.method === 'POST') return handleAiSetupPost(request, env, corsHeaders, guid);
    }"""

assert old_route in src, "❌ 라우트 삽입 위치를 찾지 못했습니다"
src = src.replace(old_route, new_route, 1)
print("✅ 라우트 추가 완료")

# ── 2. JWT 파싱 헬퍼 추가 ─────────────────────────────────────
# 삽입 위치: _err 함수 바로 뒤
old_err = "function _err(status, code, detail, corsHeaders) {\n  return new Response(\n    JSON.stringify({ ok: false, error: code, detail }),\n    { status, headers: corsHeaders }\n  );\n}"

new_err = old_err + """

// gopang_token (HMAC-SHA256 JWT) 파싱
function _parseGopangJWT(token, env) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}"""

assert old_err in src, "❌ JWT 헬퍼 삽입 위치를 찾지 못했습니다"
src = src.replace(old_err, new_err, 1)
print("✅ JWT 헬퍼 추가 완료")

# ── 3. handleAiSetupGet / handleAiSetupPost 추가 ──────────────
# 삽입 위치: anchorL1MerkleRoot 함수 바로 앞
anchor_marker = "async function anchorL1MerkleRoot(env) {"

ai_setup_code = '''// ═══════════════════════════════════════════════════════════
// /ai-setup GET — 현재 AI 비서 설정 조회
// ═══════════════════════════════════════════════════════════
async function handleAiSetupGet(request, env, corsHeaders, guid) {
  const sbH = _sbHeaders(env);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_llm_keys?guid=eq.${guid}&select=provider,model,ai_active,custom_prompt,native_lang&limit=1`,
    { headers: sbH }
  );
  if (!res.ok) return _err(502, 'DB_ERROR', 'DB 조회 실패', corsHeaders);
  const rows = await res.json().catch(() => []);
  if (!rows.length) {
    return new Response(JSON.stringify({
      ai_active: false, provider: 'deepseek', model: 'deepseek-chat',
      has_key: false, custom_prompt: '',
    }), { status: 200, headers: corsHeaders });
  }
  const row = rows[0];
  return new Response(JSON.stringify({
    ai_active:     row.ai_active,
    provider:      row.provider,
    model:         row.model,
    has_key:       !!(row.api_key_enc),
    custom_prompt: row.custom_prompt || '',
    native_lang:   row.native_lang || 'ko',
  }), { status: 200, headers: corsHeaders });
}

// ═══════════════════════════════════════════════════════════
// /ai-setup POST — AI 비서 설정 저장 (API 키 AES-256-GCM 암호화)
// ═══════════════════════════════════════════════════════════
async function handleAiSetupPost(request, env, corsHeaders, guid) {
  const body = await request.json().catch(() => null);
  if (!body) return _err(400, 'INVALID_JSON', 'JSON body 필수', corsHeaders);

  const {
    provider = 'deepseek', model = 'deepseek-chat',
    ai_active = false, api_key,
    custom_prompt = '', welcome_message = '',
    off_hours_message = '', endpoint = '',
  } = body;

  const validProviders = ['deepseek', 'anthropic', 'openai', 'custom'];
  if (!validProviders.includes(provider))
    return _err(400, 'INVALID_PROVIDER', '허용: deepseek|anthropic|openai|custom', corsHeaders);

  // 기존 키 조회
  const sbSvcH = _sbServiceHeaders(env);
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/user_llm_keys?guid=eq.${guid}&select=api_key_enc&limit=1`,
    { headers: sbSvcH }
  ).then(r => r.json()).catch(() => []);

  let apiKeyEnc = existing[0]?.api_key_enc || null;

  if (api_key && api_key.trim()) {
    if (!env.AES_ENCRYPTION_KEY)
      return _err(500, 'ENCRYPTION_KEY_MISSING', 'AES 키 미설정', corsHeaders);
    apiKeyEnc = await _aesEncrypt(api_key.trim(), env.AES_ENCRYPTION_KEY);
  }

  if (!apiKeyEnc)
    return _err(400, 'API_KEY_REQUIRED', 'API 키를 입력해 주세요', corsHeaders);

  const tokenEst = Math.ceil(custom_prompt.length / 3.5);

  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/user_llm_keys`, {
    method: 'POST',
    headers: { ...sbSvcH, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      guid, provider, model, api_key_enc: apiKeyEnc,
      ai_active, custom_prompt,
      native_lang: 'ko',
      ...(endpoint && { endpoint }),
    }),
  });

  if (!upsertRes.ok) {
    const err = await upsertRes.text();
    return _err(500, 'SAVE_FAILED', err, corsHeaders);
  }

  return new Response(JSON.stringify({
    ok: true, ai_active, provider, model,
    token_est: tokenEst,
    token_warn: tokenEst > 800,
    message: tokenEst > 800
      ? `저장 완료. 프롬프트가 약 ${tokenEst} 토큰으로 비용이 증가할 수 있습니다.`
      : '저장 완료',
  }), { status: 200, headers: corsHeaders });
}

// AES-256-GCM 암호화
async function _aesEncrypt(plaintext, keyHex) {
  const key = await crypto.subtle.importKey(
    'raw', _hexToBytes(keyHex), { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(12 + enc.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...combined));
}

function _hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
}

'''

assert anchor_marker in src, "❌ 핸들러 삽입 위치를 찾지 못했습니다"
src = src.replace(anchor_marker, ai_setup_code + anchor_marker, 1)
print("✅ handleAiSetupGet/Post 추가 완료")

with open(WORKER, 'w', encoding='utf-8') as f:
    f.write(src)

print("\n✅ worker.js 수정 완료")

# 검증
checks = [
    "pathname === '/ai-setup'",
    "_parseGopangJWT",
    "handleAiSetupGet",
    "handleAiSetupPost",
    "_aesEncrypt",
    "_hexToBytes",
]
for c in checks:
    found = c in src
    print(f"  {'✅' if found else '❌'} {c}")
