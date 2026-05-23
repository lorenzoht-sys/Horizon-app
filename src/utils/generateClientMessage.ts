import type { Bilan, TagPatient } from '../types';
import { TAG_CONFIG, getPriorityTag } from '../data/profiles';

interface MetricDelta {
  label: string;
  delta: number;
  unit: string;
}

function getMetricDeltas(current: Bilan, previous: Bilan): MetricDelta[] {
  const deltas: MetricDelta[] = [];

  const equMoy = (((current.equilibre.droite ?? 0) - (previous.equilibre.droite ?? 0)) +
                  ((current.equilibre.gauche ?? 0) - (previous.equilibre.gauche ?? 0))) / 2;
  if (Math.abs(equMoy) > 1) deltas.push({ label: 'équilibre', delta: equMoy, unit: 's' });

  if (current.chairStand30 !== null && previous.chairStand30 !== null) {
    const d = current.chairStand30 - previous.chairStand30;
    if (Math.abs(d) >= 1) deltas.push({ label: 'lever de chaise', delta: d, unit: 'rép.' });
  }

  if (current.tug3m !== null && previous.tug3m !== null) {
    const d = previous.tug3m - current.tug3m;
    if (Math.abs(d) > 0.5) deltas.push({ label: 'mobilité (TUG)', delta: d, unit: 's' });
  }

  if (current.souplesse.valeur !== null && previous.souplesse.valeur !== null) {
    const d = current.souplesse.valeur - previous.souplesse.valeur;
    if (Math.abs(d) >= 2) deltas.push({ label: 'souplesse', delta: d, unit: 'cm' });
  }

  if (current.tm6.distanceMetres !== null && previous.tm6.distanceMetres !== null) {
    const d = current.tm6.distanceMetres - previous.tm6.distanceMetres;
    if (Math.abs(d) >= 10) deltas.push({ label: 'endurance (TM6)', delta: d, unit: 'm' });
  }

  return deltas;
}

const INITIAL_MESSAGES: Record<TagPatient, string> = {
  senior:          "🎉 Bravo {prenom} ! Votre bilan initial est réalisé. C'est le point de départ — ensemble, nous allons progresser à votre rythme !",
  post_op:         "🎉 Bienvenue {prenom} ! Ce premier bilan marque le début de votre rééducation. Nous avançons ensemble, étape par étape.",
  chronique:       "🎉 Bravo {prenom} d'avoir fait ce premier pas ! Ce bilan nous sert de boussole pour adapter votre programme à votre situation.",
  adulte_blessure: "🎉 {prenom}, c'est parti ! Ce bilan initial nous permet de mesurer votre point de départ. La reprise se fera progressivement et en sécurité.",
};

const STABLE_MESSAGES: Record<TagPatient, string> = {
  senior:          "💪 {prenom}, être là et continuer, c'est déjà une belle victoire ! Ce trimestre est un trimestre de stabilisation. Au prochain cycle, on met les bouchées doubles !",
  post_op:         "💪 {prenom}, la récupération prend du temps — vous êtes sur la bonne voie ! Continuons à ce rythme au prochain cycle.",
  chronique:       "💪 {prenom}, maintenir ses acquis avec votre condition, c'est déjà un vrai effort. Continuons ensemble !",
  adulte_blessure: "💪 {prenom}, la reprise demande de la patience. Vous êtes présent(e) et c'est l'essentiel. Prochaine étape : on intensifie !",
};

const DEFAULT_INITIAL = "🎉 Bravo {prenom} ! Votre bilan initial est réalisé. C'est le point de départ de votre progression !";
const DEFAULT_STABLE  = "💪 {prenom}, vous êtes présent(e) et c'est déjà une victoire ! Continuons ensemble !";

export function generateClientMessage(
  prenom: string,
  current: Bilan,
  previous: Bilan | null,
  tags?: TagPatient[]
): string {
  const priorityTag = tags && tags.length > 0 ? getPriorityTag(tags) : undefined;

  function fill(tpl: string) { return tpl.replace('{prenom}', prenom); }

  if (!previous) {
    const msg = priorityTag ? INITIAL_MESSAGES[priorityTag] : DEFAULT_INITIAL;
    return fill(msg);
  }

  const deltas = getMetricDeltas(current, previous);
  const positives = deltas.filter(d => d.delta > 0);

  if (positives.length === 0) {
    const msg = priorityTag ? STABLE_MESSAGES[priorityTag] : DEFAULT_STABLE;
    return fill(msg);
  }

  const intro = priorityTag
    ? TAG_CONFIG[priorityTag].introMessage.replace('{prenom}', prenom)
    : `Super bilan ce trimestre, ${prenom} !`;

  const top = positives.slice(0, 3);
  const details = top.map(d => {
    const sign = d.delta > 0 ? '+' : '';
    return `votre ${d.label} s'est amélioré(e) de ${sign}${Math.round(d.delta * 10) / 10} ${d.unit}`;
  });

  const detailsText = details.length === 1
    ? details[0]
    : details.slice(0, -1).join(', ') + ' et ' + details[details.length - 1];

  return `🎉 ${intro} ${detailsText}. Continuons sur cette lancée — au prochain cycle, on ira encore plus loin !`;
}
