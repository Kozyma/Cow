// 서비스워커 — 휴대폰 홈 화면 설치 + 기본 오프라인 동작
// 정적 자산은 stale-while-revalidate(캐시 즉시 + 백그라운드 갱신),
// 데이터(페이지/폼)는 네트워크 우선.
// ※ 코드(css/js)를 고치면 이 버전 숫자를 올려야 옛 캐시가 정리됩니다.
const CACHE = 'farm-solar-v3';
const ASSETS = [
  '/static/style.css',
  '/static/app.js',
  '/static/manifest.webmanifest',
  '/static/icon-192.png',
  '/static/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // 폼 전송(POST)은 항상 네트워크로
  const url = new URL(req.url);

  if (url.pathname.startsWith('/static/')) {
    // 정적 파일: stale-while-revalidate
    //   캐시가 있으면 즉시 반환하되, 동시에 새로 받아 캐시를 갱신한다.
    //   → css/js 를 고치면 다음 새로고침에 자동으로 최신 버전이 적용된다.
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => {
          const fetching = fetch(req)
            .then((res) => { c.put(req, res.clone()); return res; })
            .catch(() => hit);
          return hit || fetching;
        })
      )
    );
    return;
  }
  // 그 외(페이지): 네트워크 우선, 실패 시 캐시
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
