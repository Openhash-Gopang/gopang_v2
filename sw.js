// ═══════════════════════════════════════════════════════════
// sw.js — 고팡 Service Worker v1.0
// PWA 오프라인 지원 + 캐시 전략
// ═══════════════════════════════════════════════════════════

const CACHE_NAME    = 'gopang-v3';
const CACHE_TIMEOUT = 5000; // 네트워크 타임아웃 5초

// 설치 시 사전 캐시할 핵심 파일
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/desktop.html',
  '/webapp.html',
  '/config.js',
  '/manifest.json',
  '/favicon.ico',
];

// ── 설치 ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] 사전 캐시 일부 실패 (무시):', err.message);
      });
    }).then(() => {
      console.log('[SW] 설치 완료 — skipWaiting');
      return self.skipWaiting();
    })
  );
});

// ── 활성화 ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] 활성화 — 이전 캐시 정리');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] 삭제:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch 전략: Network First + Cache Fallback ─────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── 외부 API 요청은 캐시 안 함 ──────────────────────────
  if (
    url.hostname.includes('supabase.co')     ||
    url.hostname.includes('workers.dev')     ||
    url.hostname.includes('deepseek.com')    ||
    url.hostname.includes('openai.com')      ||
    url.hostname.includes('kakao.com')       ||
    url.hostname.includes('googleapis.com')  ||
    url.hostname.includes('raw.githubusercontent.com')
  ) {
    return; // 기본 fetch 사용
  }

  // ── 고팡 자체 리소스: Network First ─────────────────────
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      try {
        // 네트워크 우선 시도 (타임아웃 포함)
        const networkRes = await Promise.race([
          fetch(event.request.clone()),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), CACHE_TIMEOUT)
          ),
        ]);

        // 성공 시 캐시 업데이트
        if (networkRes.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkRes.clone());
        }
        return networkRes;

      } catch (err) {
        // 네트워크 실패 → 캐시 폴백
        const cached = await caches.match(event.request);
        if (cached) {
          console.log('[SW] 캐시 폴백:', url.pathname);
          return cached;
        }

        // 캐시도 없으면 오프라인 페이지
        if (event.request.mode === 'navigate') {
          const offlineCache = await caches.match('/index.html');
          if (offlineCache) return offlineCache;
        }

        return new Response('오프라인 상태입니다.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })()
  );
});

// ── 메시지 수신 (skipWaiting 명령) ────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING 수신 → 즉시 활성화');
    self.skipWaiting();
  }
});
