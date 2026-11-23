// Données fictives de l'aperçu local (jamais commitées).
const maintenant = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const AUJ = iso(maintenant);
const jour = (n: number) => { const d = new Date(maintenant); d.setDate(d.getDate() + n); return iso(d); };
const hh = (min: number) => { const d = new Date(maintenant.getTime() + min * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function bilan(date: string, tug: number, lever: number, grip: number, tm6: number, extra: Record<string, unknown> = {}) {
  return { id: `b-${Math.random()}`, date, type: 'trimestriel', tug3m: tug, chairStand30: lever, handGrip: { droite: grip, gauche: grip - 1 },
    tm6: { mode: 'marche', distanceMetres: tm6 }, pointsVigilance: '', objectifsSuivants: '', ...extra };
}
function p(id: string, prenom: string, nom: string, ville: string, naissance: string, bilans: unknown[], extra: Record<string, unknown> = {}) {
  return { id, prenom, nom, adresseVille: ville, adresseRue: '12 rue des Lilas', adresseCodePostal: '44000', dateNaissance: naissance, bilans, archive: false, ...extra };
}
export const participants = [
  p('a1', 'Odette', 'Lambert', 'Rezé', '1944-03-02', [
    bilan(jour(-200), 13, 9, 18, 330, { type: 'initial', profilEnrichi: { objectifsPersonnels: 'Jardiner sans devoir m’asseoir toutes les dix minutes' } }),
    bilan(jour(-110), 11, 11, 19, 380), bilan(jour(-20), 9, 13, 21, 410)]),
  p('b2', 'Gérard', 'Morel', 'Nantes', '1951-07-14', [
    bilan(jour(-95), 14, 8, 18, 320, { type: 'initial', profilEnrichi: { objectifsPersonnels: 'Marcher jusqu’au marché le samedi' }, pointsVigilance: 'Hypertension, bien surveiller la récupération' })]),
  p('c3', 'Simone', 'Perrin', 'Bouguenais', '1956-11-30', [
    bilan(jour(-160), 9.5, 12, 22, 440, { type: 'initial', profilEnrichi: { objectifsPersonnels: 'Remonter seule les escaliers de sa fille à Noël' } }),
    bilan(jour(-70), 8, 15, 24, 500, { pointsVigilance: 'Genou droit sensible à la montée' })]),
  p('d4', 'Lucienne', 'Faure', 'Résidence Les Pins', '1948-01-09', [bilan(jour(-40), 11, 10, 16, 360, { type: 'initial' })], { structureId: 's1' }),
  p('e5', 'Bernard', 'Collin', 'Saint-Herblain', '1959-05-22', [], {}),
  p('f6', 'Hélène', 'Roche', 'Résidence Les Pins', '1942-09-18', [bilan(jour(-30), 16, 7, 15, 280, { type: 'initial' })], { structureId: 's1' }),
];
const seance = (id: string, pid: string, date: string, debut: string, fin: string, statut: string, extra: Record<string, unknown> = {}) =>
  ({ id, participantId: pid, date, heureDebut: debut, heureFin: fin, dureeMinutes: 45, type: 'seance', statut, adresse: '', ...extra });
export const seances = [
  seance('s1', 'a1', AUJ, hh(-300), hh(-255), 'realisee'),
  seance('s2', 'b2', AUJ, hh(-200), hh(-155), 'planifiee', { type: 'bilan' }),
  seance('s3', 'c3', AUJ, hh(130), hh(175), 'planifiee', { objectif: 'Travail de montée de marches, avec appui' }),
  seance('s4', 'f6', AUJ, hh(240), hh(285), 'planifiee'),
  seance('s5', 'd4', jour(-3), '10:00', '10:45', 'planifiee'),
  seance('s6', 'a1', jour(2), '09:00', '09:45', 'planifiee'),
  seance('s7', 'f6', jour(4), '10:00', '11:00', 'planifiee', { type: 'bilan' }),
];
export const retours: Record<string, { borgRpe: number; bienEtre: number }[]> = {
  c3: [{ borgRpe: 6, bienEtre: 2 }],
  d4: [{ borgRpe: 6, bienEtre: 4 }, { borgRpe: 7, bienEtre: 4 }, { borgRpe: 5, bienEtre: 5 }],
};
export const contratsARenouveler = [{ id: 'k1', participantId: 'a1', dateFin: jour(12) }];
