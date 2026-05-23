import { NORMS } from '../data/norms';

function linearScale(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function invertedScale(value: number, min: number, max: number): number {
  // Pour TUG : plus la valeur est basse, mieux c'est
  return Math.max(0, Math.min(100, ((min - value) / (min - max)) * 100));
}

export function useNormalize() {
  const normalize = {
    equilibre: (v: number) => linearScale(v, NORMS.equilibre.min, NORMS.equilibre.max),
    chairStand30: (v: number) => linearScale(v, NORMS.chairStand30.min, NORMS.chairStand30.max),
    handGrip: (v: number) => linearScale(v, NORMS.handGrip.min, NORMS.handGrip.max),
    tug3m: (v: number) => invertedScale(v, NORMS.tug3m.min, NORMS.tug3m.max),
    souplesse: (v: number) => linearScale(v, NORMS.souplesse.min, NORMS.souplesse.max),
    tm6: (v: number) => linearScale(v, NORMS.tm6.min, NORMS.tm6.max),
    memoire: (v: number) => linearScale(v, NORMS.memoire.min, NORMS.memoire.max),
  };

  return normalize;
}
