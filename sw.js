// =====================================================================
// サービスワーカー: ホーム画面に追加したとき、ネットにつながっていなくても遊べるようにする (スロット版と同じ作り)
// ---------------------------------------------------------------------
// - ページ (index.html / howto.html): ネット優先。つながらないときは保存しておいたもの
// - js / css: URL に版番号 (?v=) が付いているので、保存しておいたものを優先
//   (中身が変わると番号も変わり、別の URL として新しく読み込まれる。tools/bump-version.py)
// - 保存するファイルは、ページの HTML が読み込む js / css をそのまま拾う (一覧を手で書かない)。
//   ページを開くたびに足りないものを足し、いまの HTML が使っていない古い版は消す
// - ドットフォント (Google Fonts) も一度読み込んだら保存しておく
// このファイルの処理を変えたときは CACHE の番号を上げる
// =====================================================================

const CACHE = 'koori-pachinko-v1';
const PAGES = ['index.html', 'howto.html'];
const STATIC = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const ASSET_PATTERN = /\b(?:src|href)="((?:js|css)\/[^"]+)"/g;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

// ページと、ページが読み込む js / css・アイコンを保存し直す
async function refreshCache() {
    const cache = await caches.open(CACHE);
    const keep = new Set();
    for (const page of PAGES) {
        const res = await fetch(scopeUrl(page), { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${page}: ${res.status}`);
        const html = await res.clone().text();
        await cache.put(scopeUrl(page), res);
        keep.add(scopeUrl(page));
        for (const m of html.matchAll(ASSET_PATTERN)) keep.add(scopeUrl(m[1]));
    }
    await Promise.all(STATIC.map(async (path) => {
        keep.add(scopeUrl(path));
        const res = await fetch(scopeUrl(path), { cache: 'no-cache' });
        if (res.ok) await cache.put(scopeUrl(path), res);
    }));
    // 足りない js / css を足す
    await Promise.all([...keep].map(async (url) => {
        if (await cache.match(url)) return;
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
    }));
    // いまのページが使っていない古い版を消す (フォントなど別のサイトのものは残す)
    for (const req of await cache.keys()) {
        if (new URL(req.url).origin === self.location.origin && !keep.has(req.url)) await cache.delete(req);
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(refreshCache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

// ページを開いたとき: ネットから読み、つながらなければ保存しておいたページ (なければ index.html)
async function fromNetworkOrCache(event) {
    try {
        const res = await fetch(event.request);
        event.waitUntil(refreshCache().catch(() => {}));
        return res;
    } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match(event.request, { ignoreSearch: true })) || cache.match(scopeUrl('index.html'));
    }
}

// js / css / 画像 / フォント: 保存しておいたものを優先し、なければネットから読んで保存する
async function fromCacheOrNetwork(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') await cache.put(request, res.clone());
    return res;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (request.mode === 'navigate' && url.origin === self.location.origin) {
        event.respondWith(fromNetworkOrCache(event));
    } else if (url.origin === self.location.origin || FONT_HOSTS.includes(url.hostname)) {
        event.respondWith(fromCacheOrNetwork(request));
    }
});
