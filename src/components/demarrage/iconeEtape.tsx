import {
  CalendarPlus, ClipboardList, Dumbbell, Receipt, Smartphone, UserPlus, UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { IdEtape } from '../../lib/demarrage';

export const ICONE_ETAPE: Record<IdEtape, LucideIcon> = {
  compte: UserRound,
  beneficiaire: UserPlus,
  bilan: ClipboardList,
  seance: CalendarPlus,
  programme: Dumbbell,
  facturation: Receipt,
  application: Smartphone,
};
