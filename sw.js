/* ═══════════════════════════════════════════════════
   Entre Páginas — Service Worker
   Notificações diárias de highlights
═══════════════════════════════════════════════════ */
const SW_CACHE = 'ep-v1';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim().then(() => reschedule())));

/* ─── Mensagens da app principal ─── */
self.addEventListener('message', async e => {
  const { type, highlights, prefs } = e.data || {};
  if (type === 'SYNC') {
    if (highlights !== undefined) await store('highlights', highlights);
    if (prefs      !== undefined) await store('prefs', prefs);
    await reschedule();
  }
  if (type === 'TEST') {
    await sendHighlight();
  }
});

/* ─── Cache API como key-value store ─── */
async function store(key, val) {
  const c = await caches.open(SW_CACHE);
  await c.put('/_ep_/' + key, new Response(JSON.stringify(val)));
}
async function load(key) {
  const c = await caches.open(SW_CACHE);
  const r = await c.match('/_ep_/' + key);
  if (!r) return null;
  try { return await r.json(); } catch { return null; }
}

/* ─── Agendamento ─── */
let _timers = [];

async function reschedule() {
  _timers.forEach(clearTimeout);
  _timers = [];

  const prefs = await load('prefs');
  if (!prefs?.enabled) return;

  const times = (prefs.times || ['09:00', '21:00']).filter(Boolean);
  times.forEach(hhmm => {
    const delay = msUntil(hhmm);
    _timers.push(setTimeout(async () => {
      await sendHighlight();
      reschedule(); /* reagendar para o dia seguinte */
    }, delay));
  });
}

function msUntil(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now  = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

/* ─── Enviar notificação com highlight aleatório ─── */
async function sendHighlight() {
  const highlights = await load('highlights');
  if (!highlights?.length) return;

  const pick = highlights[Math.floor(Math.random() * highlights.length)];
  const text = pick.text || '';
  const body = text.length > 250 ? text.slice(0, 250) + '…' : text;
  const title = pick.bookTitle
    ? `"${pick.bookTitle}"`
    : 'Entre Páginas';

  return self.registration.showNotification(title, {
    body,
    icon:     '/icon-192.png',
    badge:    '/icon-72.png',
    tag:      'ep-daily',
    renotify: true,
    vibrate:  [200, 100, 200],
    data:     { bookId: pick.bookId },
  });
}

/* ─── Clique na notificação → abre a app ─── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : clients.openWindow('/');
    })
  );
});
