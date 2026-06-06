// ═══════════════════════════════════════════════════════════
// gopang-proxy — v4.6
// AI API 프록시 + SSO 인증 통합
// GPT-4o mini Vision + DeepSeek V4 Pro + SameSite=None 쿠키 SSO
// 환경변수: OpenAI, DEEPSEEK_API_KEY, KAKAO_REST_KEY, KAKAO_JS_KEY
// v4.1 변경: police.gopang.net CORS 추가, /chat/completions 라우트 추가
// v4.2 변경: insurance·911 CORS 추가, stock·traffic·logistics 신규 등록
// v4.3 변경: SVC_ALIAS 추가 — gwp-registry.js k-prefix ID 자동 resolve
// v4.4 변경: /kakao/appkey (GET) + /ai/chat (POST) 라우트 추가
//            traffic·logistics Kakao Maps SDK 동적 로드 지원
// v4.5 변경: 기본 모델 deepseek-chat → deepseek-v4-flash
//            handleAIChat system 필드 undefined 버그 수정
//            callOpenAIFromGeminiBody fallback 모델 동일 적용
// v4.6 변경: /pdv/query 추가 — PDV 읽기(read) 프로토콜
//            handlePdvQuery, _verifyConsentToken, _fetchPdvByScope
//            _storeConsentRequest, _recordConsentEvent, _checkRateLimit
// ═══════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://gopang.net',
  'https://www.gopang.net',
  'https://klaw.gopang.net',
  'https://market.gopang.net',
  'https://tax.gopang.net',
  'https://gdc.gopang.net',
  'https://health.gopang.net',
  'https://school.gopang.net',
  'https://public.gopang.net',
  'https://security.gopang.net',
  'https://democracy.gopang.net',
  'https://police.gopang.net',
  'https://insurance.gopang.net',
  'https://911.gopang.net',
  'https://stock.gopang.net',
  'https://traffic.gopang.net',
  'https://logistics.gopang.net',
  'https://fiil.kr',
  'https://openhash.kr',
  'https://nounweb.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const OPENAI_URL     = 'https://api.openai.com/v1/chat/completions';
const DEEPSEEK_URL   = 'https://api.deepseek.com/v1/chat/completions';
const KAKAO_BASE     = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';
const OPENAI_MODEL   = 'gpt-4o-mini';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const SUPABASE_URL   = 'https://ebbecjfrwaswbdybbgiu.supabase.co';

// ── 허용 scope 목록 (PDV_QUERY_PROTOCOL_v1_0.md §scope) ─────
const VALID_PDV_SCOPES = ['ktraffic', 'khealth', 'pdv_general', 'kmarket', 'k119'];

// ── scope별 최소 인증 레벨 ─────────────────────────────────
const SCOPE_MIN_LEVEL = {
  ktraffic:    'L1',
  khealth:     'L1',
  pdv_general: 'L1',
  k119:        'L1',
  kmarket:     'L0',
};

// ── PDV source → pdv_log.source 매핑 ──────────────────────
const SCOPE_SOURCE_MAP = {
  ktraffic:    'traffic',
  khealth:     'health',
  pdv_general: null,       // null = 소스 미지정, 전체 조회
  kmarket:     'market',
  k119:        '911',
};

// ═══════════════════════════════════════════════════════════
// v4.3 — 서비스 ID 별칭 테이블
// ═══════════════════════════════════════════════════════════
const SVC_ALIAS = {
  'kemergency':    '911',
  'kpolice':       'police',
  'ksecurity':     'security',
  'khealth':       'health',
  'kedu':          'school',
  'kgdc':          'gdc',
  'kfinance':      'stock',
  'kinsurance':    'insurance',
  'ktax':          'tax',
  'kcommerce':     'market',
  'ktransport':    'traffic',
  'klogistics':    'logistics',
  'fiil-kcleaner': 'fiil',
  'kgov':          'public',
  'kdemocracy':    'democracy',
};

function _resolveSvcId(svcId) {
  return SVC_ALIAS[svcId] || svcId;
}

// ── CORS origin 결정 ────────────────────────────────────────
function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return origin;
  if (origin === '') return '';
  return null;
}

// ── CORS 헤더 빌더 ──────────────────────────────────────────
function buildCorsHeaders(corsOrigin, extra = {}) {
  return {
    'Content-Type':                     'application/json',
    'Access-Control-Allow-Origin':      corsOrigin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods':     'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    ...extra,
  };
}

// ── 공용 에러 응답 빌더 ─────────────────────────────────────
function _err(status, code, detail, corsHeaders) {
  return new Response(
    JSON.stringify({ ok: false, error: code, detail }),
    { status, headers: corsHeaders }
  );
}

// ═══════════════════════════════════════════════════════════
// 단일 export default
// ═══════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const corsOrigin = getCorsOrigin(request);

    // ── CORS preflight ───────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':      corsOrigin ?? 'null',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods':     'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers':     'Content-Type',
          'Access-Control-Max-Age':           '86400',
        },
      });
    }

    // ── 도메인 검증 ──────────────────────────────────────
    if (corsOrigin === null) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', origin: request.headers.get('Origin') }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const corsHeaders = buildCorsHeaders(corsOrigin);
    const url         = new URL(request.url);
    const pathname    = url.pathname;

    // ── 라우팅 ───────────────────────────────────────────

    // SSO 인증 라우트
    if (pathname === '/auth/issue')              return handleIssue(request, env, corsHeaders);
    if (pathname === '/auth/verify')             return handleVerify(request, env, corsHeaders);
    if (pathname === '/auth/refresh')            return handleRefresh(request, env, corsHeaders);

    // WebAuthn 지문 라우트
    if (pathname === '/auth/webauthn/challenge') return handleWAChallenge(request, env, corsHeaders);
    if (pathname === '/auth/webauthn/register')  return handleWARegister(request, env, corsHeaders);
    if (pathname === '/auth/webauthn/verify')    return handleWAVerify(request, env, corsHeaders);

    // PDV 읽기 (쓰기보다 먼저 — v4.6 신규)
    if (pathname === '/pdv/query')               return handlePdvQuery(request, env, corsHeaders);

    // PDV 쓰기 (기존)
    if (pathname === '/pdv/report')              return handlePdvReport(request, env, corsHeaders);

    // 하위 서비스 등록·확인
    if (pathname === '/svc/register')            return handleSvcRegister(request, env, corsHeaders);
    if (pathname === '/svc/verify')              return handleSvcVerify(request, env, corsHeaders);

    // 카카오 역지오코딩 (GET)
    if (pathname.startsWith('/geocode'))         return handleGeocode(url, env, corsHeaders);

    // v4.4: Kakao Maps JS 앱 키 반환 (GET)
    if (pathname === '/kakao/appkey')            return handleKakaoAppKey(request, env, corsHeaders);

    // POST 전용 (이하)
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method Not Allowed' }),
        { status: 405, headers: corsHeaders }
      );
    }

    const bodyText = await request.text();

    // OpenAI 호환 표준 라우트 → DeepSeek 프록시
    if (pathname === '/chat/completions')        return callDeepSeek(bodyText, env, corsHeaders);

    // DeepSeek 직접 호출
    if (pathname.startsWith('/deepseek'))        return callDeepSeek(bodyText, env, corsHeaders);

    // Gemini 형식 → GPT-4o mini 변환 호출
    if (pathname.startsWith('/gemini/'))         return callOpenAIFromGeminiBody(bodyText, env, corsHeaders);

    // v4.4: AI 채팅 (DeepSeek V4 Pro + Claude 폴백)
    if (pathname === '/ai/chat')                 return handleAIChat(bodyText, env, corsHeaders);

    return new Response(
      JSON.stringify({ error: 'Not Found', path: pathname }),
      { status: 404, headers: corsHeaders }
    );
  },
};

// ═══════════════════════════════════════════════════════════
// v4.6 — /pdv/query 핸들러
// PDV_QUERY_PROTOCOL_v1_0.md 전체 구현
// ═══════════════════════════════════════════════════════════

async function handlePdvQuery(request, env, corsHeaders) {
  if (request.method !== 'POST')
    return _err(405, 'METHOD_NOT_ALLOWED', 'POST만 허용됩니다', corsHeaders);

  const origin = request.headers.get('Origin') || '';

  try {
    const body  = await request.json().catch(() => null);
    const query = body?.query;

    // ── 1. 스키마 검증 ─────────────────────────────────────
    if (!query?.svc || !query?.ipv6 || !query?.scope || !query?.period)
      return _err(400, 'SCHEMA_ERROR', '필수 필드 누락: svc, ipv6, scope, period', corsHeaders);

    if (!Array.isArray(query.scope) || query.scope.length === 0)
      return _err(400, 'SCOPE_INVALID', 'scope는 비어있지 않은 배열이어야 합니다', corsHeaders);

    const invalidScope = query.scope.find(s => !VALID_PDV_SCOPES.includes(s));
    if (invalidScope)
      return _err(400, 'SCOPE_INVALID', `허용되지 않은 scope: ${invalidScope}`, corsHeaders);

    if (!query.period?.start || !query.period?.end)
      return _err(400, 'SCHEMA_ERROR', 'period.start, period.end 필수 (YYYY-MM-DD)', corsHeaders);

    // 기간 12개월 초과 검사
    const periodMs = new Date(query.period.end) - new Date(query.period.start);
    if (periodMs > 365 * 24 * 60 * 60 * 1000)
      return _err(400, 'PERIOD_TOO_LONG', '조회 기간은 12개월을 초과할 수 없습니다', corsHeaders);

    // ── 2. 서비스 등록 확인 ───────────────────────────────
    const svcReg = _getSvcRegistration(origin, query.svc);
    if (!svcReg || !svcReg.pdv)
      return _err(403, 'SVC_NOT_REGISTERED',
        `미등록 또는 PDV 권한 없는 서비스: ${query.svc}`, corsHeaders);

    // ── 3. 인증 토큰 만료 확인 ────────────────────────────
    const authToken = query.auth_token;
    if (!authToken?.exp || Math.floor(Date.now() / 1000) > authToken.exp)
      return _err(401, 'AUTH_EXPIRED', '인증 토큰이 만료되었습니다. 재인증이 필요합니다', corsHeaders);

    // ── 4. scope별 최소 인증 레벨 확인 ───────────────────
    const LEVEL_ORDER = { L0: 0, L1: 1, L2: 2, L3: 3 };
    const userLevel   = LEVEL_ORDER[authToken.level] ?? 0;
    for (const scope of query.scope) {
      const required = LEVEL_ORDER[SCOPE_MIN_LEVEL[scope] || 'L1'];
      if (userLevel < required)
        return _err(403, 'LEVEL_INSUFFICIENT',
          `${scope} 조회는 ${SCOPE_MIN_LEVEL[scope]} 이상 필요합니다 (현재: ${authToken.level})`,
          corsHeaders);
    }

    // ── 5. 동의 토큰 확인 — 단계A / 단계B 분기 ───────────
    if (!query.consent_token || !query.request_id) {
      // ── 단계A: 동의 요청 생성 (202) ──────────────────
      const reqId     = `CNSREQ-${query.ipv6.replace(/:/g,'').slice(0,8)}-${Date.now()}`;
      const expiresAt = Math.floor(Date.now() / 1000) + 300;

      // 동의 요청 Supabase 저장
      await _storeConsentRequest(env, reqId, query, expiresAt);

      const consentUrl = 'https://gopang.net/consent'
        + `?req=${encodeURIComponent(reqId)}`
        + `&svc=${encodeURIComponent(query.svc)}`
        + `&scope=${encodeURIComponent(query.scope.join(','))}`
        + `&purpose=${encodeURIComponent(query.purpose || '')}`
        + `&ipv6_hash=${encodeURIComponent(await _sha256Hex(query.ipv6))}`;

      return new Response(JSON.stringify({
        ok:      false,
        status:  'CONSENT_REQUIRED',
        consent: {
          request_id:  reqId,
          expires_at:  expiresAt,
          consent_url: consentUrl,
          message:     '사용자가 고팡 앱에서 PDV 조회에 동의해야 합니다.',
        },
      }), { status: 202, headers: corsHeaders });
    }

    // ── 단계B: 동의 토큰 검증 ─────────────────────────
    const consentOk = await _verifyConsentToken(
      env, query.consent_token, query.request_id, query.ipv6
    );
    if (!consentOk)
      return _err(401, 'CONSENT_INVALID',
        '동의 토큰이 유효하지 않거나 만료되었습니다. 동의 절차를 다시 시작해 주세요',
        corsHeaders);

    // ── 6. Rate Limiting — 사용자당 5분 3회 ──────────────
    const withinLimit = await _checkRateLimit(env, query.ipv6, 'pdv_query');
    if (!withinLimit)
      return _err(429, 'RATE_LIMITED', 'PDV 조회 한도 초과입니다. 5분 후 다시 시도해 주세요', corsHeaders);

    // ── 7. PDV 조회 (scope별 pdv_log SELECT) ──────────────
    const pdvSummary = await _fetchPdvByScope(env, query.ipv6, query.scope, query.period);

    // ── 8. 조회 행위 자체를 PDV에 기록 ───────────────────
    const queryId    = `PDVQ-${query.ipv6.replace(/:/g,'').slice(0,8)}-${Date.now()}`;
    const pdvEntryId = await _recordConsentEvent(env, query, queryId);

    return new Response(JSON.stringify({
      ok:          true,
      query_id:    queryId,
      ipv6:        query.ipv6,
      period:      query.period,
      pdv_summary: pdvSummary,
      consent: {
        granted_at:   new Date().toISOString(),
        expires_at:   new Date(authToken.exp * 1000).toISOString(),
        pdv_entry_id: pdvEntryId,
      },
    }), { status: 200, headers: corsHeaders });

  } catch (e) {
    return _err(500, 'INTERNAL_ERROR', e.message, corsHeaders);
  }
}

// ── 동의 요청 저장 (pdv_consent_requests) ──────────────────
async function _storeConsentRequest(env, reqId, query, expiresAt) {
  const key = env.SUPABASE_KEY || _supabaseAnonKey();
  try {
    await fetch(SUPABASE_URL + '/rest/v1/pdv_consent_requests', {
      method: 'POST',
      headers: {
        'apikey':        key,
        'Authorization': 'Bearer ' + key,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        id:          reqId,
        ipv6:        query.ipv6,
        svc:         _resolveSvcId(query.svc),
        scope:       query.scope,
        purpose:     query.purpose || '',
        period:      query.period,
        status:      'pending',
        expires_at:  new Date(expiresAt * 1000).toISOString(),
      }),
    });
  } catch (e) {
    // 저장 실패해도 흐름 중단하지 않음 — 동의 URL은 이미 생성됨
    console.warn('[PDVQuery] 동의 요청 저장 실패:', e.message);
  }
}

// ── 동의 토큰 검증 (HMAC-SHA256) ───────────────────────────
// gopang.net/consent 페이지가 사용자 동의 후
// HMAC-SHA256(reqId + '.' + ipv6, GOPANG_MASTER_KEY)으로 서명하여 발급
async function _verifyConsentToken(env, consentToken, requestId, ipv6) {
  try {
    // Supabase에서 동의 요청 상태 확인
    const key = env.SUPABASE_KEY || _supabaseAnonKey();
    const res = await fetch(
      SUPABASE_URL + `/rest/v1/pdv_consent_requests`
      + `?id=eq.${encodeURIComponent(requestId)}`
      + `&ipv6=eq.${encodeURIComponent(ipv6)}`
      + `&select=status,expires_at,consent_token`,
      {
        headers: {
          'apikey':        key,
          'Authorization': 'Bearer ' + key,
          'Content-Type':  'application/json',
        },
      }
    );
    const rows = await res.json().catch(() => []);
    if (!rows?.length) return false;

    const row = rows[0];
    // 만료 확인
    if (new Date(row.expires_at) < new Date()) return false;
    // 상태 확인
    if (row.status !== 'granted') return false;
    // 토큰 일치 확인
    if (row.consent_token !== consentToken) return false;

    return true;
  } catch (e) {
    // Supabase 실패 시 HMAC 직접 검증으로 폴백
    console.warn('[PDVQuery] 동의 DB 확인 실패, HMAC 폴백:', e.message);
    return _verifyConsentHmac(env, consentToken, requestId, ipv6);
  }
}

// ── HMAC 직접 검증 폴백 ────────────────────────────────────
async function _verifyConsentHmac(env, consentToken, requestId, ipv6) {
  try {
    const masterKey = env.GOPANG_MASTER_KEY || 'gopang-webauthn-secret-v1';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(masterKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );
    const data = new TextEncoder().encode(`${requestId}.${ipv6}`);
    const sigBytes = Uint8Array.from(
      atob(consentToken.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    return crypto.subtle.verify('HMAC', key, sigBytes, data);
  } catch { return false; }
}

// ── Rate Limiting — 5분 3회 ────────────────────────────────
// KV가 없으면 Supabase 임시 테이블로 대체
async function _checkRateLimit(env, ipv6, action) {
  if (env.RATE_LIMIT_KV) {
    // Cloudflare KV 방식
    const kvKey   = `rl:${action}:${ipv6}`;
    const current = parseInt(await env.RATE_LIMIT_KV.get(kvKey) || '0');
    if (current >= 3) return false;
    await env.RATE_LIMIT_KV.put(kvKey, String(current + 1), { expirationTtl: 300 });
    return true;
  }
  // KV 없음 — 허용 (Supabase 기반 구현은 추후 추가)
  return true;
}

// ── PDV 조회 (scope별 pdv_log SELECT) ─────────────────────
async function _fetchPdvByScope(env, ipv6, scopes, period) {
  const key    = env.SUPABASE_KEY || _supabaseAnonKey();
  const result = {};

  for (const scope of scopes) {
    const source = SCOPE_SOURCE_MAP[scope];

    let queryUrl = SUPABASE_URL + '/rest/v1/pdv_log'
      + `?guid=eq.${encodeURIComponent(ipv6)}`
      + `&created_at=gte.${period.start}T00:00:00Z`
      + `&created_at=lte.${period.end}T23:59:59Z`
      + `&select=summary,summary_6w,risk_level,created_at,source`
      + `&order=created_at.desc`
      + `&limit=50`;

    if (source) {
      queryUrl += `&source=eq.${encodeURIComponent(source)}`;
    }

    try {
      const res  = await fetch(queryUrl, {
        headers: {
          'apikey':        key,
          'Authorization': 'Bearer ' + key,
          'Content-Type':  'application/json',
        },
      });
      const rows = await res.json().catch(() => []);

      if (!rows?.length) {
        result[scope] = { available: false, entry_count: 0,
          risk_level: 'unknown', summary_6w: null, risk_factors: {} };
        continue;
      }

      // risk_level 집계: 가장 높은 레벨 반환
      const RISK_ORDER = { low: 0, medium: 1, high: 2 };
      const maxRisk    = rows.reduce((max, r) => {
        const lvl = r.risk_level || 'low';
        return RISK_ORDER[lvl] > RISK_ORDER[max] ? lvl : max;
      }, 'low');

      // 최신 summary_6w 파싱
      let summary6w = null;
      for (const row of rows) {
        try { summary6w = JSON.parse(row.summary_6w); break; }
        catch {}
      }

      // scope별 risk_factors 집계
      const riskFactors = _aggregateRiskFactors(scope, rows);

      result[scope] = {
        available:    true,
        entry_count:  rows.length,
        risk_level:   maxRisk,
        summary_6w:   summary6w,
        risk_factors: riskFactors,
      };

    } catch (e) {
      console.warn(`[PDVQuery] scope ${scope} 조회 실패:`, e.message);
      result[scope] = { available: false, entry_count: 0,
        risk_level: 'unknown', summary_6w: null, risk_factors: {},
        error: 'fetch_failed' };
    }
  }

  return result;
}

// ── scope별 risk_factors 집계 ──────────────────────────────
function _aggregateRiskFactors(scope, rows) {
  if (scope === 'ktraffic') {
    const accidents = rows.filter(r => {
      try { return JSON.parse(r.summary_6w)?.what?.includes('사고'); }
      catch { return false; }
    }).length;
    return {
      accident_count:       accidents,
      entry_count:          rows.length,
      high_risk_count:      rows.filter(r => r.risk_level === 'high').length,
      accident_free_months: accidents === 0 ? 36 : 0,  // 실제 계산은 LLM에 위임
    };
  }
  if (scope === 'khealth') {
    return {
      total_records:         rows.length,
      high_risk_count:       rows.filter(r => r.risk_level === 'high').length,
      medium_risk_count:     rows.filter(r => r.risk_level === 'medium').length,
    };
  }
  return {
    entry_count: rows.length,
    high_risk_count: rows.filter(r => r.risk_level === 'high').length,
  };
}

// ── 조회 행위를 PDV에 기록 (consent_event) ─────────────────
async function _recordConsentEvent(env, query, queryId) {
  const key       = env.SUPABASE_KEY || _supabaseAnonKey();
  const svcId     = _resolveSvcId(query.svc);
  const pdvId     = `PDV-${query.ipv6.replace(/:/g,'').slice(0,12)}-${Date.now()}`;
  const summary6w = JSON.stringify({
    who:   svcId,
    when:  new Date().toISOString(),
    where: `https://${svcId}.gopang.net`,
    what:  `PDV 조회 동의: scope=[${query.scope.join(',')}]`,
    how:   '사용자 명시적 동의 (고팡 앱 팝업)',
    why:   query.purpose || 'PDV 데이터 조회',
  });

  try {
    await fetch(SUPABASE_URL + '/rest/v1/pdv_log', {
      method: 'POST',
      headers: {
        'apikey':        key,
        'Authorization': 'Bearer ' + key,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        id:          pdvId,
        guid:        query.ipv6,
        source:      svcId,
        type:        'consent_event',
        report_id:   queryId,
        summary:     `PDV 조회 동의: ${svcId} → [${query.scope.join(',')}]`,
        summary_6w:  summary6w,
        risk_level:  'low',
        period:      query.period,
        raw_hash:    null,
        created_at:  new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('[PDVQuery] consent_event 기록 실패:', e.message);
  }

  return pdvId;
}

// ── SHA-256 헥스 다이제스트 ────────────────────────────────
async function _sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Supabase Anon Key (환경변수 없을 때 폴백) ──────────────
function _supabaseAnonKey() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViYmVjamZyd2Fzd2JkeWJiZ2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjE5ODQsImV4cCI6MjA5NTEzNzk4NH0.H2ahQKtWdSke04Pdi3hDY86pdTx7UUKPUpQMlS_zciA';
}

// ═══════════════════════════════════════════════════════════
// SSO 핸들러 (v4.5 이하와 동일)
// ═══════════════════════════════════════════════════════════

function buildCookie(token) {
  return [
    `gopang_token=${token}`, 'Path=/', 'Domain=.gopang.net',
    'Max-Age=3600', 'SameSite=None', 'Secure', 'HttpOnly',
  ].join('; ');
}

function parseCookie(header, name) {
  const match = header.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function buildToken(ipv6, level, svc) {
  const now     = Math.floor(Date.now() / 1000);
  const payload = { ipv6, level, svc, iat: now, exp: now + 3600 };
  return btoa(JSON.stringify(payload)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function parseToken(token) {
  try {
    const padded  = token.replace(/-/g,'+').replace(/_/g,'/');
    const payload = JSON.parse(atob(padded + '=='.slice((padded.length % 4) || 4)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function handleIssue(request, env, corsHeaders) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body?.ipv6) return _err(400, 'MISSING_FIELD', 'ipv6 필수', corsHeaders);
  const { ipv6, level = 'L0', svc = '*' } = body;
  const token  = buildToken(ipv6, level, svc);
  const cookie = buildCookie(token);
  return new Response(
    JSON.stringify({ ok: true, ipv6, level }),
    { status: 200, headers: { ...corsHeaders, 'Set-Cookie': cookie } }
  );
}

async function handleVerify(request, env, corsHeaders) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const raw          = parseCookie(cookieHeader, 'gopang_token');
  if (!raw) return _err(401, 'NO_TOKEN', 'no_token', corsHeaders);
  const payload = parseToken(raw);
  if (!payload) return _err(401, 'INVALID_TOKEN', 'expired_or_invalid', corsHeaders);
  return new Response(
    JSON.stringify({ valid: true, ipv6: payload.ipv6, level: payload.level,
                     svc: payload.svc, exp: payload.exp }),
    { status: 200, headers: corsHeaders }
  );
}

async function handleRefresh(request, env, corsHeaders) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const raw          = parseCookie(cookieHeader, 'gopang_token');
  if (!raw) return _err(401, 'NO_TOKEN', 'no_token', corsHeaders);
  const payload = parseToken(raw);
  if (!payload) return _err(401, 'INVALID_TOKEN', 'expired_or_invalid', corsHeaders);
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  if (remaining > 1800) return new Response(
    JSON.stringify({ ok: false, reason: 'not_yet', remaining }),
    { status: 200, headers: corsHeaders }
  );
  const newToken = buildToken(payload.ipv6, payload.level, payload.svc);
  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders, 'Set-Cookie': buildCookie(newToken) } }
  );
}

// ═══════════════════════════════════════════════════════════
// WebAuthn 핸들러 (v4.5와 동일)
// ═══════════════════════════════════════════════════════════

const WA_RP_ID   = 'gopang.net';
const WA_RP_NAME = '고팡 (Gopang)';

async function sbFetch(env, path, method = 'GET', body = null) {
  const key = env.SUPABASE_KEY || _supabaseAnonKey();
  const headers = {
    'apikey': key, 'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
  };
  const res = await fetch(SUPABASE_URL + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? res.json().catch(() => ({})) : null;
}

async function handleWAChallenge(request, env, corsHeaders) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const chalB64   = btoa(String.fromCharCode(...challenge))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const exp     = Math.floor(Date.now() / 1000) + 300;
  const sigData = `${chalB64}.${exp}`;
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.GOPANG_MASTER_KEY || 'gopang-webauthn-secret-v1'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigData));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  return new Response(
    JSON.stringify({ challenge: chalB64, exp, sig: sigHex }),
    { status: 200, headers: corsHeaders }
  );
}

async function _verifyChallengeToken(env, chalB64, exp, sig) {
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const sigData = `${chalB64}.${exp}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.GOPANG_MASTER_KEY || 'gopang-webauthn-secret-v1'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(sig.match(/.{2}/g).map(h => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(sigData));
}

async function handleWARegister(request, env, corsHeaders) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body?.ipv6 || !body?.credentialId || !body?.publicKey)
    return _err(400, 'MISSING_FIELD', 'ipv6, credentialId, publicKey 필수', corsHeaders);
  const chalOk = await _verifyChallengeToken(env, body.challenge, body.challengeExp, body.challengeSig);
  if (!chalOk) return _err(401, 'CHALLENGE_INVALID', '챌린지 만료 또는 위조', corsHeaders);
  const result = await sbFetch(env, '/rest/v1/webauthn_credentials', 'POST', {
    ipv6: body.ipv6, credential_id: body.credentialId, public_key: body.publicKey,
    counter: 0, device_type: body.deviceType || 'platform', aaguid: body.aaguid || null,
  });
  if (!result) return _err(502, 'DB_ERROR', 'Supabase 저장 실패', corsHeaders);
  return new Response(JSON.stringify({ ok: true, ipv6: body.ipv6 }), { status: 200, headers: corsHeaders });
}

async function handleWAVerify(request, env, corsHeaders) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body?.ipv6 || !body?.credentialId)
    return _err(400, 'MISSING_FIELD', 'ipv6, credentialId 필수', corsHeaders);
  const rows = await sbFetch(env,
    `/rest/v1/webauthn_credentials?ipv6=eq.${encodeURIComponent(body.ipv6)}&credential_id=eq.${encodeURIComponent(body.credentialId)}&select=public_key,counter`,
    'GET'
  );
  if (!rows?.length) return _err(404, 'CREDENTIAL_NOT_FOUND', 'credential_not_found', corsHeaders);
  const cred = rows[0];
  if (body.counter !== undefined && body.counter <= cred.counter)
    return _err(401, 'COUNTER_REPLAY', 'counter_replay', corsHeaders);
  if (body.counter !== undefined) {
    await sbFetch(env,
      `/rest/v1/webauthn_credentials?credential_id=eq.${encodeURIComponent(body.credentialId)}`,
      'PATCH', { counter: body.counter, last_used_at: new Date().toISOString() }
    );
  }
  const token = buildToken(body.ipv6, 'L2', '*');
  return new Response(
    JSON.stringify({ valid: true, ipv6: body.ipv6, level: 'L2' }),
    { status: 200, headers: { ...corsHeaders, 'Set-Cookie': buildCookie(token) } }
  );
}

// ═══════════════════════════════════════════════════════════
// 하위 서비스 등록 화이트리스트
// ═══════════════════════════════════════════════════════════

const REGISTERED_SERVICES = {
  'klaw':      { level: 3, domain: 'klaw.gopang.net',      minAuth: 'L0', pdv: true  },
  'market':    { level: 3, domain: 'market.gopang.net',    minAuth: 'L0', pdv: true  },
  'school':    { level: 3, domain: 'school.gopang.net',    minAuth: 'L0', pdv: true  },
  'security':  { level: 3, domain: 'security.gopang.net',  minAuth: 'L1', pdv: true  },
  'health':    { level: 3, domain: 'health.gopang.net',    minAuth: 'L1', pdv: true  },
  'tax':       { level: 3, domain: 'tax.gopang.net',       minAuth: 'L0', pdv: true  },
  'gdc':       { level: 3, domain: 'gdc.gopang.net',       minAuth: 'L1', pdv: true  },
  'public':    { level: 3, domain: 'public.gopang.net',    minAuth: 'L0', pdv: true  },
  'democracy': { level: 3, domain: 'democracy.gopang.net', minAuth: 'L1', pdv: true  },
  '911':       { level: 3, domain: '911.gopang.net',       minAuth: 'L0', pdv: true  },
  'police':    { level: 3, domain: 'police.gopang.net',    minAuth: 'L1', pdv: true  },
  'insurance': { level: 3, domain: 'insurance.gopang.net', minAuth: 'L1', pdv: true  },
  'stock':     { level: 3, domain: 'stock.gopang.net',     minAuth: 'L1', pdv: true  },
  'traffic':   { level: 3, domain: 'traffic.gopang.net',   minAuth: 'L0', pdv: true  },
  'logistics': { level: 3, domain: 'logistics.gopang.net', minAuth: 'L0', pdv: true  },
  'fiil':      { level: 2, domain: 'fiil.kr',              minAuth: 'L0', pdv: true  },
  'klaw-ext':  { level: 2, domain: 'klaw.openhash.kr',     minAuth: 'L0', pdv: false },
};

function _getSvcRegistration(origin, svcId) {
  const resolvedId = _resolveSvcId(svcId);
  const svc        = REGISTERED_SERVICES[resolvedId];
  if (svc && origin.includes(svc.domain)) return { ...svc, svcId: resolvedId, originalId: svcId };
  if (/^https:\/\/[a-z0-9-]+\.gopang\.net$/.test(origin))
    return { level: 1, domain: origin, minAuth: 'L0', pdv: false, svcId: resolvedId, originalId: svcId };
  return null;
}

// ═══════════════════════════════════════════════════════════
// /pdv/report (v4.5와 동일)
// ═══════════════════════════════════════════════════════════

async function handlePdvReport(request, env, corsHeaders) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const origin = request.headers.get('Origin') || '';
  const body   = await request.json().catch(() => null);
  if (!body?.report) return _err(400, 'SCHEMA_ERROR', 'report.report 필드 필수', corsHeaders);
  const r     = body.report;
  const svcId = r.svc || request.headers.get('X-Gopang-Svc') || 'unknown';
  const ipv6  = r.who?.ipv6;
  const reg   = _getSvcRegistration(origin, svcId);
  if (!reg) return _err(403, 'SERVICE_NOT_REGISTERED',
    `${svcId} (${origin})은 등록된 서비스가 아닙니다`, corsHeaders);
  if (reg.level < 2 && !reg.pdv) return _err(403, 'PDV_NOT_ALLOWED',
    'Level 1 서비스는 PDV 보고서 전송 권한이 없습니다', corsHeaders);
  if (!ipv6) return _err(404, 'USER_NOT_FOUND', 'who.ipv6 필수', corsHeaders);

  const resolvedSvcId = _resolveSvcId(svcId);
  const reportId      = r.id || `RPT-${resolvedSvcId}-${Date.now()}-auto`;
  const summary6w = {
    who:   `${r.who?.role || 'user'} (${ipv6.slice(0,20)}...)`,
    when:  `${(r.when?.period_start||'').slice(0,10)} ~ ${(r.when?.period_end||'').slice(0,10)}`,
    where: r.where?.svc_url || `https://${resolvedSvcId}.gopang.net`,
    what:  r.what?.summary  || '(요약 없음)',
    how:   r.how?.method    || '자동 집계',
    why:   r.why?.goal      || '(목표 미지정)',
  };
  const pdvId  = `PDV-${ipv6.replace(/:/g,'').slice(0,12)}-${Date.now()}`;
  const pdvKey = env.SUPABASE_KEY || _supabaseAnonKey();
  const pdvFetch = await fetch(SUPABASE_URL + '/rest/v1/pdv_log', {
    method: 'POST',
    headers: {
      'apikey': pdvKey, 'Authorization': 'Bearer ' + pdvKey,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      id: pdvId, guid: ipv6, source: resolvedSvcId,
      type: r.type || 'report', report_id: reportId,
      summary: r.what?.summary || '', summary_6w: JSON.stringify(summary6w),
      risk_level: r.analysis?.risk_level || 'low',
      period: r.when ?? r.period ?? null,
      raw_hash: r.content_hash || null, created_at: new Date().toISOString(),
    }),
  });
  if (!pdvFetch.ok) return _err(503, 'PDV_LOCKED', 'PDV 저장 실패, 60초 후 재시도', corsHeaders);

  return new Response(JSON.stringify({
    ok: true, report_id: reportId, pdv_entry: pdvId,
    recorded_at: new Date().toISOString(),
    recipients_notified: (r.who?.recipients || []).filter(x => x !== 'gopang-pdv'),
    svc_level: reg.level,
    message: `PDV 기록 완료. ${resolvedSvcId} (Level ${reg.level})`,
  }), { status: 200, headers: corsHeaders });
}

// ═══════════════════════════════════════════════════════════
// /svc/register · /svc/verify (v4.5와 동일)
// ═══════════════════════════════════════════════════════════

async function handleSvcRegister(request, env, corsHeaders) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body?.svc_id || !body?.domain || !body?.operator_ipv6)
    return _err(400, 'MISSING_FIELD', 'svc_id, domain, operator_ipv6 필수', corsHeaders);
  const { svc_id, domain, description, min_auth, operator_ipv6 } = body;
  const isGopangSub = /^[a-z0-9-]+\.gopang\.net$/.test(domain);
  await sbFetch(env, '/rest/v1/svc_registry', 'POST', {
    svc_id, domain, description: description || '', operator_ipv6,
    min_auth: min_auth || 'L0', trust_level: isGopangSub ? 1 : 0,
    status: isGopangSub ? 'auto_approved' : 'pending',
    registered_at: new Date().toISOString(),
  });
  return new Response(JSON.stringify({
    ok: true, svc_id, domain, trust_level: isGopangSub ? 1 : 0,
    status: isGopangSub ? 'auto_approved' : 'pending_review',
    message: isGopangSub
      ? '*.gopang.net 서브도메인으로 자동 승인됐습니다. (Level 1)'
      : '등록 신청이 접수됐습니다. AI City Inc. 검토 후 승인됩니다.',
  }), { status: 200, headers: corsHeaders });
}

async function handleSvcVerify(request, env, corsHeaders) {
  const url    = new URL(request.url);
  const svcId  = url.searchParams.get('svc_id');
  const origin = request.headers.get('Origin') || '';
  if (!svcId) return _err(400, 'MISSING_FIELD', 'svc_id 파라미터 필수', corsHeaders);
  const reg = _getSvcRegistration(origin, svcId);
  if (!reg) return new Response(JSON.stringify({
    ok: false, registered: false, svc_id: svcId, message: '등록되지 않은 서비스입니다.',
  }), { status: 200, headers: corsHeaders });
  return new Response(JSON.stringify({
    ok: true, registered: true, svc_id: svcId, trust_level: reg.level,
    pdv_allowed: reg.pdv, min_auth: reg.minAuth,
    message: `등록된 서비스 (Level ${reg.level})`,
  }), { status: 200, headers: corsHeaders });
}

// ═══════════════════════════════════════════════════════════
// /geocode · /kakao/appkey · /ai/chat (v4.5와 동일)
// ═══════════════════════════════════════════════════════════

async function handleGeocode(url, env, corsHeaders) {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  if (!lat || !lng) return _err(400, 'MISSING_FIELD', 'lat, lng required', corsHeaders);
  try {
    const res  = await fetch(`${KAKAO_BASE}?x=${lng}&y=${lat}&input_coord=WGS84`,
      { headers: { 'Authorization': `KakaoAK ${env.KAKAO_REST_KEY}` } });
    const data = await res.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch(e) { return _err(502, 'GEOCODE_ERROR', e.message, corsHeaders); }
}

async function handleKakaoAppKey(request, env, corsHeaders) {
  const appkey = env.KAKAO_JS_KEY || env.KAKAO_REST_KEY;
  if (!appkey) return _err(500, 'CONFIG_ERROR', 'Kakao key not configured', corsHeaders);
  return new Response(JSON.stringify({ appkey }),
    { status: 200, headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300' } });
}

async function handleAIChat(bodyText, env, corsHeaders) {
  let body;
  try { body = JSON.parse(bodyText); }
  catch { return _err(400, 'INVALID_JSON', 'Invalid JSON', corsHeaders); }
  const { provider = 'deepseek', model, system, messages, max_tokens = 2000 } = body;
  const builtMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...(messages || []),
  ];
  try {
    if (provider !== 'anthropic') {
      const res = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: model || DEEPSEEK_MODEL, max_tokens, messages: builtMessages }),
      });
      const data    = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('DeepSeek 응답 없음: ' + JSON.stringify(data));
      return new Response(
        JSON.stringify({ content, provider: 'deepseek', model: model || DEEPSEEK_MODEL }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'x-api-key': env.ANTHROPIC_API_KEY || env.OpenAI,
                   'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514', max_tokens,
          ...(system ? { system } : {}), messages: messages || [],
        }),
      });
      const data    = await res.json();
      const content = data.content?.find(c => c.type === 'text')?.text;
      return new Response(JSON.stringify({ content, provider: 'anthropic' }),
        { status: 200, headers: corsHeaders });
    }
  } catch (e) { return _err(502, 'AI_ERROR', e.message, corsHeaders); }
}

async function callOpenAIFromGeminiBody(bodyText, env, corsHeaders) {
  const apiKey = env.OpenAI;
  if (!apiKey) return _err(500, 'CONFIG_ERROR', 'OpenAI key not configured', corsHeaders);
  let geminiBody;
  try { geminiBody = JSON.parse(bodyText); }
  catch { return _err(400, 'INVALID_JSON', 'Invalid JSON body', corsHeaders); }
  const systemPrompt = geminiBody.system_instruction?.parts?.[0]?.text || '';
  const parts        = geminiBody.contents?.[0]?.parts || [];
  const textPart     = parts.find(p => p.text)?.text || '';
  const imagePart    = parts.find(p => p.inline_data);
  const maxTokens    = geminiBody.generationConfig?.maxOutputTokens || 1500;
  const messages     = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  if (imagePart?.inline_data) {
    messages.push({ role: 'user', content: [
      { type: 'image_url', image_url: {
        url: `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}` }},
      { type: 'text', text: textPart || '이미지를 분석하여 JSON으로만 출력하라.' },
    ]});
  } else {
    messages.push({ role: 'user', content: textPart });
  }
  try {
    const res  = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, max_tokens: maxTokens,
                             temperature: geminiBody.generationConfig?.temperature ?? 0.1 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    const text = data.choices?.[0]?.message?.content || '{}';
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }],
      _provider: 'openai', _model: OPENAI_MODEL,
    }), { headers: corsHeaders });
  } catch(e) {
    const fbBody = JSON.stringify({ model: DEEPSEEK_MODEL, messages, max_tokens: maxTokens,
                                    temperature: 0.1, stream: false });
    return callDeepSeek(fbBody, env, corsHeaders, e.message);
  }
}

async function callDeepSeek(bodyText, env, corsHeaders, fallbackFrom = null) {
  try {
    let isStream = false;
    try { isStream = !!JSON.parse(bodyText)?.stream; } catch {}
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: bodyText,
    });
    if (!res.ok) {
      const errText = await res.text();
      let errMsg;
      try { errMsg = JSON.parse(errText)?.error?.message; } catch {}
      return new Response(JSON.stringify({ error: errMsg || `HTTP ${res.status}` }),
        { status: res.status, headers: corsHeaders });
    }
    if (isStream) {
      return new Response(res.body, { status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream',
                   'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
    }
    const data = await res.json();
    if (fallbackFrom) {
      const text = data.choices?.[0]?.message?.content || '{}';
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }],
        _provider: 'deepseek-fallback', _fallback_from: fallbackFrom,
      }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch(e) { return _err(502, 'DEEPSEEK_ERROR', e.message, corsHeaders); }
}