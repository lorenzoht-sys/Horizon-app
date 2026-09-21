import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chargerIdsParticipantsArchives, exclureBeneficiairesArchives } from './participantsArchives.js';

// Faux client minimal : from('participants').select().in('id', lot).eq('archive', true)
function clientParticipants(participants: { id: string; archive?: boolean }[], options: { erreur?: string } = {}) {
  const requetes: string[][] = [];
  const client = {
    from(table: string) {
      expect(table).toBe('participants');
      let lot: string[] = [];
      const builder = {
        select() { return builder; },
        in(_champ: string, valeurs: string[]) { lot = valeurs; requetes.push(valeurs); return builder; },
        eq(_champ: string, valeur: boolean) {
          if (options.erreur) return Promise.resolve({ data: null, error: { message: options.erreur } });
          return Promise.resolve({
            data: participants.filter(p => lot.includes(p.id) && (p.archive === true) === valeur).map(p => ({ id: p.id })),
            error: null,
          });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, requetes };
}

describe('chargerIdsParticipantsArchives', () => {
  it('ne renvoie que les bénéficiaires archivés parmi ceux demandés', async () => {
    const { client } = clientParticipants([
      { id: 'a', archive: true }, { id: 'b', archive: false }, { id: 'c' }, { id: 'd', archive: true },
    ]);
    const archives = await chargerIdsParticipantsArchives(client, ['a', 'b', 'c']);
    expect([...archives]).toEqual(['a']);
  });

  it('un champ absent vaut « actif »', async () => {
    const { client } = clientParticipants([{ id: 'x' }]);
    expect((await chargerIdsParticipantsArchives(client, ['x'])).size).toBe(0);
  });

  it('découpe en lots de 100 identifiants (limite de taille d\'URL) sans perdre un archivé', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `p${i}`);
    const { client, requetes } = clientParticipants(ids.map(id => ({ id, archive: id === 'p3' || id === 'p120' || id === 'p249' })));
    const archives = await chargerIdsParticipantsArchives(client, ids);
    expect(requetes.map(l => l.length)).toEqual([100, 100, 50]);
    expect([...archives].sort()).toEqual(['p120', 'p249', 'p3']);
  });

  it('dédoublonne les identifiants demandés', async () => {
    const { client, requetes } = clientParticipants([{ id: 'a', archive: true }]);
    await chargerIdsParticipantsArchives(client, ['a', 'a', 'a']);
    expect(requetes).toEqual([['a']]);
  });

  it('aucun identifiant : aucune requête', async () => {
    const { client, requetes } = clientParticipants([]);
    expect((await chargerIdsParticipantsArchives(client, [])).size).toBe(0);
    expect(requetes).toEqual([]);
  });

  it('lève si la lecture échoue — jamais « personne n\'est archivé » par défaut', async () => {
    const { client } = clientParticipants([{ id: 'a', archive: true }], { erreur: 'panne réseau' });
    await expect(chargerIdsParticipantsArchives(client, ['a'])).rejects.toThrow(/archivage.*impossible.*panne réseau/);
  });
});

describe('exclureBeneficiairesArchives', () => {
  it('retire les éléments des archivés et garde l\'ordre des autres', () => {
    const elements = [
      { id: 1, participant_id: 'a' }, { id: 2, participant_id: 'b' }, { id: 3, participant_id: 'a' }, { id: 4, participant_id: 'c' },
    ];
    expect(exclureBeneficiairesArchives(elements, new Set(['a'])).map(e => e.id)).toEqual([2, 4]);
  });
  it('aucun archivé : tout est conservé', () => {
    const elements = [{ participant_id: 'a' }, { participant_id: 'b' }];
    expect(exclureBeneficiairesArchives(elements, new Set())).toHaveLength(2);
  });
});
