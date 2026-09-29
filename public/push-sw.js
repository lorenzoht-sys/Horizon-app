// Gestion des notifications push (rappels-patients + alertes praticien).
//
// Importé par le service worker généré par vite-plugin-pwa via
// `workbox.importScripts` (vite.config.ts) : ce script s'exécute dans le
// même contexte (self = ServiceWorkerGlobalScope), sans remplacer la
// stratégie de cache générée par Workbox.
//
// Aucune donnée médicale dans les notifications. Rappels patient : message
// neutre (api/_lib/rappels.ts). Alerte praticien : prénom seul du
// bénéficiaire et heure de la séance, jamais le nom complet
// (api/_lib/absenceSignalee.ts).

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

  // Tag fourni par le serveur (alerte praticien : `absence-<id séance>`, voir
  // api/_lib/notifications.ts) : une notification par séance, au lieu du tag
  // fixe qui faisait remplacer silencieusement une alerte par la suivante.
  // `renotify` seulement dans ce cas : une même séance re-signalée met sa
  // notification à jour ET sonne à nouveau. Sans tag (rappels patient) :
  // comportement inchangé, tag fixe, pas de renotify.
  const tagExplicite = typeof data.tag === 'string' && data.tag ? data.tag : null;

  event.waitUntil(
    self.registration.showNotification(data.title || 'Horizon', {
      body: data.body || '',
      icon: '/icon-horizon.png.png',
      badge: '/icon-horizon.png.png',
      tag: tagExplicite || 'horizon-rappel',
      ...(tagExplicite ? { renotify: true } : {}),
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
