// Gestion des notifications push (rappels-patients + alertes praticien).
//
// Importé par le service worker généré par vite-plugin-pwa via
// `workbox.importScripts` (vite.config.ts) : ce script s'exécute dans le
// même contexte (self = ServiceWorkerGlobalScope), sans remplacer la
// stratégie de cache générée par Workbox.
//
// Le contenu des notifications est toujours neutre (aucune donnée médicale)
// — voir api/_lib/rappels.ts et api/_lib/absenceSignalee.ts.

self.addEventListener('push', (event) => {
  let data = { title: 'Horizon', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Payload non-JSON : on garde les valeurs par défaut.
  }

  // Décidée côté serveur selon le destinataire (patient → /patient,
  // praticien → voir URL_NOTIFICATION_ABSENCE_PRATICIEN,
  // api/_lib/absenceSignalee.ts) — jamais devinée ici.
  const url = typeof data.url === 'string' && data.url ? data.url : '/patient';

  event.waitUntil(
    self.registration.showNotification(data.title || 'Horizon', {
      body: data.body || '',
      icon: '/icon-horizon.png.png',
      badge: '/icon-horizon.png.png',
      tag: 'horizon-rappel',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Repli /patient : payloads déjà en file d'attente au moment du
  // déploiement (envoyés avant que ce service worker ne porte `data.url`
  // dans la notification), qui n'ont donc pas ce champ.
  const url = (event.notification.data && event.notification.data.url) || '/patient';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
