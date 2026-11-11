import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { utilisateurCourant } from '../../lib/session';
import { activerRappelsPush, desactiverRappelsPush, etatAbonnementPush, estIOS, estInstalleeSurEcranAccueil, pushSupporte } from '../../lib/push';
import { praticienEnregistrerAbonnementPush, praticienSupprimerAbonnementPush } from '../../lib/praticienPush';
import { SectionTitle } from './communs';

// ── Alertes praticien (notifications push) ──────────────────────────────────
// Chantier « push praticien », lot 1 (fondations) : abonnement du PRATICIEN à
// ses propres alertes sur cet appareil — distinct de SectionRappelsGlobal
// ci-dessus, qui configure les rappels ENVOYÉS AUX bénéficiaires. Aucun envoi
// réel dans ce lot, seulement la mécanique d'abonnement.
//
// Même patron d'états que SectionRappels (EspacePatient.tsx), même
// détection support/iOS/permission (src/lib/push.ts, générique, réutilisé
// tel quel). Seule différence : l'enregistrement se fait par écriture
// DIRECTE Supabase (praticienPush.ts, RLS praticien_id = auth.uid()) plutôt
// que par un appel à une route API — le praticien a déjà une session
// Supabase, contrairement au bénéficiaire (jeton JWT maison).

export type EtatAlertesPraticien = 'verification' | 'actif' | 'inactif' | 'ios' | 'non_supporte' | 'refuse' | 'erreur';

export function SectionAlertesPraticien() {
  const [etat, setEtat] = useState<EtatAlertesPraticien>('verification');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    void (async () => {
      if (estIOS() && !estInstalleeSurEcranAccueil()) { setEtat('ios'); return; }
      if (!pushSupporte()) { setEtat('non_supporte'); return; }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') { setEtat('refuse'); return; }
      const statut = await etatAbonnementPush();
      if (statut === 'non_supporte') setEtat('non_supporte');
      else setEtat(statut === 'abonne' ? 'actif' : 'inactif');
    })();
  }, []);

  async function activer() {
    if (!supabase) { setEtat('erreur'); return; }
    setEnCours(true);
    const res = await activerRappelsPush();
    if (res.ok) {
      const user = await utilisateurCourant();
      const ok = user ? await praticienEnregistrerAbonnementPush(supabase, user.id, res.subscription) : false;
      if (ok) {
        setEtat('actif');
        toast.success('Alertes activées !');
      } else {
        setEtat('erreur');
        toast.error("Erreur lors de l'activation. Réessayez plus tard.");
      }
    } else if (res.raison === 'permission_refusee') {
      setEtat('refuse');
    } else if (res.raison === 'ios_non_installee') {
      setEtat('ios');
    } else if (res.raison === 'non_supporte' || res.raison === 'cle_manquante') {
      setEtat('non_supporte');
    } else {
      setEtat('erreur');
      toast.error("Erreur lors de l'activation. Réessayez plus tard.");
    }
    setEnCours(false);
  }

  async function desactiver() {
    if (!supabase) return;
    setEnCours(true);
    const endpoint = await desactiverRappelsPush();
    if (endpoint) {
      const user = await utilisateurCourant();
      if (user) await praticienSupprimerAbonnementPush(supabase, user.id, endpoint);
    }
    setEtat('inactif');
    toast('Alertes désactivées sur cet appareil.');
    setEnCours(false);
  }

  if (etat === 'verification') {
    return (
      <section>
        <SectionTitle title="🔔 Alertes praticien" />
        <div className="text-sm text-gray-400">Chargement…</div>
      </section>
    );
  }

  if (etat === 'actif') {
    return (
      <section>
        <SectionTitle title="🔔 Alertes praticien" />
        <div className="flex items-center justify-between gap-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <div>
            <div className="text-sm font-medium text-dark">Alertes activées sur cet appareil</div>
            <p className="text-xs text-gray-400 mt-0.5">Vous serez notifié quand un bénéficiaire signale une absence.</p>
          </div>
          <button onClick={desactiver} disabled={enCours}
            className="flex-shrink-0 border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
            Désactiver sur cet appareil
          </button>
        </div>
      </section>
    );
  }

  if (etat === 'inactif') {
    return (
      <section>
        <SectionTitle title="🔔 Alertes praticien" />
        <p className="text-xs text-gray-400 mb-4">
          Recevez une notification sur cet appareil quand un bénéficiaire signale une absence (et d'autres
          alertes à venir).
        </p>
        <button onClick={activer} disabled={enCours}
          className="bg-primary text-white hover:bg-dark px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
          {enCours ? 'Activation…' : 'Activer les alertes'}
        </button>
      </section>
    );
  }

  if (etat === 'ios') {
    return (
      <section>
        <SectionTitle title="🔔 Alertes praticien" />
        <div className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5">
          Pour activer les alertes sur iPhone/iPad : installez l'app depuis Safari sur votre écran d'accueil
          (<strong>□↑</strong> puis <strong>« Sur l'écran d'accueil »</strong>), puis revenez sur cette page.
        </div>
      </section>
    );
  }

  if (etat === 'refuse') {
    return (
      <section>
        <SectionTitle title="🔔 Alertes praticien" />
        <p className="text-xs text-gray-400">
          Les notifications ont été refusées pour ce site. Pour les activer, autorisez les notifications
          pour Horizon dans les réglages de votre navigateur, puis revenez sur cette page.
        </p>
      </section>
    );
  }

  if (etat === 'non_supporte') {
    return (
      <section>
        <SectionTitle title="🔔 Alertes praticien" />
        <p className="text-xs text-gray-400">
          Les alertes par notification ne sont pas disponibles sur ce navigateur. Essayez avec une version
          récente de Chrome ou Safari, ou installez l'app sur votre écran d'accueil.
        </p>
      </section>
    );
  }

  // erreur
  return (
    <section>
      <SectionTitle title="🔔 Alertes praticien" />
      <p className="text-xs text-gray-400 mb-3">Une erreur est survenue lors de l'activation des alertes.</p>
      <button onClick={activer} disabled={enCours}
        className="border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
        Réessayer
      </button>
    </section>
  );
}
