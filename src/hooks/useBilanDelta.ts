import type { Bilan, DeltaResult, Direction } from '../types';
import { computeTinettiScores } from '../data/tinetti';
import { computeBergScore } from '../data/berg';
import { distanceTm6, resultatTm6 } from '../lib/tm6';

function calcDelta(current: number | null, previous: number | null, lowerIsBetter: boolean): DeltaResult {
  if (current === null) {
    return { current, previous, delta: null, direction: 'first', lowerIsBetter, isPositive: false };
  }
  if (previous === null) {
    return { current, previous, delta: null, direction: 'first', lowerIsBetter, isPositive: false };
  }

  const delta = current - previous;
  let direction: Direction;

  if (Math.abs(delta) < 0.01) {
    direction = 'equal';
  } else if (lowerIsBetter) {
    direction = delta < 0 ? 'up' : 'down';
  } else {
    direction = delta > 0 ? 'up' : 'down';
  }

  const isPositive = direction === 'up';

  return { current, previous, delta, direction, lowerIsBetter, isPositive };
}

function adlTotal(b: Bilan | null): number | null {
  if (!b) return null;
  const a = b.adl ? Object.values(b.adl).filter(Boolean).length : null;
  const i = b.iadl ? Object.values(b.iadl).filter(Boolean).length : null;
  if (a === null && i === null) return null;
  return (a ?? 0) + (i ?? 0);
}

export function useBilanDelta(current: Bilan, previous: Bilan | null) {
  const p = previous;
  const tinettiCur = computeTinettiScores(current.tinetti);
  const tinettiPrev = computeTinettiScores(p?.tinetti);

  return {
    equilibreDroite: calcDelta(current.equilibre.droite, p?.equilibre.droite ?? null, false),
    equilibreGauche: calcDelta(current.equilibre.gauche, p?.equilibre.gauche ?? null, false),
    chairStand30: calcDelta(current.chairStand30, p?.chairStand30 ?? null, false),
    handGripDroite: calcDelta(current.handGrip.droite, p?.handGrip.droite ?? null, false),
    handGripGauche: calcDelta(current.handGrip.gauche, p?.handGrip.gauche ?? null, false),
    tug3m: calcDelta(current.tug3m, p?.tug3m ?? null, true),
    souplesse: calcDelta(current.souplesse.valeur, p?.souplesse.valeur ?? null, false),
    tm6Distance: calcDelta(distanceTm6(current.tm6), distanceTm6(p?.tm6), false),
    // TMC en pas (stepper, marche sur place) : comparé seulement à un TMC précédent en pas
    tm6Pas: calcDelta(
      resultatTm6(current.tm6).type === 'pas' ? resultatTm6(current.tm6).valeur : null,
      p && resultatTm6(p.tm6).type === 'pas' ? resultatTm6(p.tm6).valeur : null,
      false,
    ),
    tm6DureeMismatch: !!p && (current.tm6.dureeReelleSecondes ?? 360) !== (p.tm6.dureeReelleSecondes ?? 360),
    memoireImmediat: calcDelta(current.memoire.scoreImmediat, p?.memoire.scoreImmediat ?? null, false),
    memoireDiffere: calcDelta(current.memoire.scoreDiffere, p?.memoire.scoreDiffere ?? null, false),
    memoireMIS: calcDelta(
      current.memoire.dubois?.scoreMIS ?? null,
      p?.memoire.dubois?.scoreMIS ?? null,
      false,
    ),
    apleyScore: calcDelta(current.apley?.score ?? null, p?.apley?.score ?? null, false),
    tinettiScore: calcDelta(
      tinettiCur?.complet ? tinettiCur.scoreTotal : null,
      tinettiPrev?.complet ? tinettiPrev.scoreTotal : null,
      false,
    ),
    bergScore: calcDelta(computeBergScore(current.berg), computeBergScore(p?.berg ?? null), false),
    mocaScore: calcDelta(current.mocaScore ?? null, p?.mocaScore ?? null, false),
    marche10mHabituel: calcDelta(current.marche10m?.habituel ?? null, p?.marche10m?.habituel ?? null, true),
    marche10mMax: calcDelta(current.marche10m?.max ?? null, p?.marche10m?.max ?? null, true),
    adlIadlTotal: calcDelta(adlTotal(current), adlTotal(p), false),
  };
}
