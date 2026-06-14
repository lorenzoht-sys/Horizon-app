// Gestion des notifications push (rappels-patients).
//
// Importé par le service worker généré par vite-plugin-pwa via
// `workbox.importScripts` (vite.config.ts) : ce script s'exécute dans le
// même contexte (self = ServiceWorkerGlobalScope), sans remplacer la
// stratégie de cache générée par Workbox.
//
// Le contenu des notifications est toujours neutre (aucune donnée médicale)
// — voir api/_lib/rappels.ts.

self.addEventListener('push', (event) => {
  let data = { title: 'Horizon', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Payload non-JSON : on garde les valeurs par défaut.
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Horizon', {
      body: data.body || '',
      icon: '/icon-horizon.png.png',
      badge: '/icon-horizon.png.png',
      tag: 'horizon-rappel',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = '/patient';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes('/patient') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
