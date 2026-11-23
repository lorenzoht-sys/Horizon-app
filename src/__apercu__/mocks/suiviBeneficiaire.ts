import { retours } from '../donnees';
export async function chargerRetoursParBeneficiaire() { return retours; }
export function ressentisPreoccupants(r: readonly { borgRpe: number; bienEtre: number }[]): boolean {
  if (r.length < 3) return false; const l = r.slice(0, 3); return l.every(x => x.borgRpe >= 8) || l.every(x => x.bienEtre >= 4);
}
