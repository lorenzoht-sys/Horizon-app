import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';

// public/push-sw.js n'est ni un module ni du TypeScript (importé tel quel par
// le service worker Workbox, vite.config.ts) : on l'exécute dans un contexte
// isolé avec un faux `self`, puis on rejoue un événement `push` pour lire les
// options réellement passées à showNotification.
const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/push-sw.js'),
  'utf-8',
);

async function optionsAffichees(payload: unknown): Promise<Record<string, unknown>> {
  const ecouteurs: Record<string, (e: unknown) => void> = {};
  let options: Record<string, unknown> | null = null;
  let attente: Promise<unknown> = Promise.resolve();
  const self = {
    addEventListener: (type: string, f: (e: unknown) => void) => { ecouteurs[type] = f; },
    registration: {
      showNotification: (_titre: string, o: Record<string, unknown>) => { options = o; return Promise.resolve(); },
    },
  };
  vm.runInNewContext(source, { self });
  ecouteurs.push({
    data: { json: () => payload },
    waitUntil: (p: Promise<unknown>) => { attente = p; },
  });
  await attente;
  if (!options) throw new Error('showNotification non appelé');
  return options;
}

describe('public/push-sw.js — tag des notifications', () => {
  it('sans tag dans le payload (rappels patient) : tag fixe « horizon-rappel », pas de renotify — inchangé', async () => {
    const o = await optionsAffichees({ title: 'Horizon', body: 'Pensez à vos exercices !', url: '/patient' });
    expect(o.tag).toBe('horizon-rappel');
    expect(o).not.toHaveProperty('renotify');
  });

  it('tag fourni (alerte praticien) : repris tel quel, avec renotify', async () => {
    const o = await optionsAffichees({ title: 'Horizon', body: 'Camille a signalé…', url: '/agenda?date=2026-10-07', tag: 'absence-seance-42' });
    expect(o.tag).toBe('absence-seance-42');
    expect(o.renotify).toBe(true);
    expect(o.data).toEqual({ url: '/agenda?date=2026-10-07' });
  });

  it('tag vide ou non textuel : traité comme absent', async () => {
    for (const tag of ['', 42, null]) {
      const o = await optionsAffichees({ title: 'Horizon', body: '', url: '/agenda', tag });
      expect(o.tag).toBe('horizon-rappel');
      expect(o).not.toHaveProperty('renotify');
    }
  });
});
