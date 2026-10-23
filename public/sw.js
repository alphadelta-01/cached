const APP_URL = new URL('/', self.location.origin).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = typeof payload.title === 'string' ? payload.title : 'New message';
  const body = typeof payload.body === 'string' ? payload.body : 'You have a new message.';
  const conversationId = Number(payload.conversationId);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients.some((client) => client.focused)) return;

    await self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: Number.isSafeInteger(conversationId)
        ? `conversation-${conversationId}`
        : 'new-message',
      renotify: false,
      data: {
        url: Number.isSafeInteger(conversationId) && conversationId > 0
          ? `/?conversation=${conversationId}`
          : APP_URL
      }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const requestedUrl = new URL(event.notification.data?.url || APP_URL, APP_URL);
    const targetUrl = requestedUrl.origin === self.location.origin
      ? requestedUrl.href
      : APP_URL;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients[0];
    if (client) {
      await client.navigate(targetUrl);
      await client.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
