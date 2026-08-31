// Administration des comptes praticiens (étape 4 des rôles).
//
// Trois choses, et volontairement rien d'autre : lister les comptes,
// désactiver, réactiver.
//
// ── Aucun bouton « supprimer », et ce n'en est pas un oubli ─────────────
// Supprimer un compte praticien orpheline le dossier patient : les FK de
// participants, bilans, comptes_rendus_seances, notes_seances, contrats,
// programmes et seances vers auth.users sont en ON DELETE SET NULL. Les
// lignes survivent avec praticien_id à NULL, et comme toutes les policies
// filtrent sur praticien_id = auth.uid(), plus aucun compte authentifié ne
// peut jamais les relire. Donnée légalement conservée, pratiquement perdue,
// sans le moindre signal. La désactivation est réversible et ne touche à
// aucune donnée. Voir docs/PLAN-BETA.md.
//
// ── Aucune donnée clinique n'est affichée ni même chargée ───────────────
// Cette page ne parle que de comptes. Le rôle admin ne donne aucun accès
// aux bilans, comptes rendus, notes de séance ou documents patient —
// vérifié par le describe « [RÔLES] un compte admin ne lit aucune donnée
// clinique » de tests/security/rls.spec.ts.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, ShieldOff, RefreshCw, AlertTriangle, UserPlus, CheckCircle2 } from 'lucide-react';
import { getAuthHeader } from '../lib/supabase';
import { useAppRole } from '../hooks/useAppRole';

type Compte = {
  id: string;
  email: string | null;
  prenom: string | null;
  nom: string | null;
  appRole: 'admin' | 'praticien' | null;
  actif: boolean;
  creeLe: string | null;
  derniereConnexion: string | null;
  emailConfirme: boolean;
  sansFichePraticien: boolean;
};

async function appelerAdmin(body: Record<string, unknown>) {
  const authHeader = await getAuthHeader();
  const r = await fetch('/api/organisation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error ?? `Erreur ${r.status}`);
  return json;
}

function dateCourte(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

export default function AdminComptesPage() {
  const { estAdmin, chargement: chargementRole } = useAppRole();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [tronquee, setTronquee] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [emailInvite, setEmailInvite] = useState('');
  const [invitationEnCours, setInvitationEnCours] = useState(false);
  const [succesInvitation, setSuccesInvitation] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const json = await appelerAdmin({ action: 'admin.comptes' });
      setComptes(json.comptes ?? []);
      setTronquee(Boolean(json.tronquee));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (!chargementRole && estAdmin) void charger();
    else if (!chargementRole) setChargement(false);
  }, [chargementRole, estAdmin, charger]);

  // Invitation d'un praticien.
  //
  // Le serveur cree le compte et envoie un lien `type=invite` pointant sur
  // /reset-password. Rien de plus a faire ici : cette page est deja ecrite,
  // et le verrou d'App.tsx empeche l'invite d'entrer dans l'application
  // avant d'avoir choisi un mot de passe.
  async function inviter(e: FormEvent) {
    e.preventDefault();
    // Garde dure : un second envoi creerait une seconde invitation, et
    // Supabase compte les emails par heure.
    if (invitationEnCours) return;

    const email = emailInvite.trim();
    if (!email) return;

    setInvitationEnCours(true);
    setErreur(null);
    setSuccesInvitation(null);
    try {
      await appelerAdmin({ action: 'admin.inviter', email });
      setSuccesInvitation(`Invitation envoyée à ${email}.`);
      setEmailInvite('');
      // Le compte invite apparait aussitot dans la liste, avec son email
      // non confirme : l'admin voit que l'invitation est en attente.
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setInvitationEnCours(false);
    }
  }

  async function basculerStatut(compte: Compte) {
    const desactiver = compte.actif;
    const qui = [compte.prenom, compte.nom].filter(Boolean).join(' ') || compte.email || compte.id;
    const message = desactiver
      ? `Désactiver le compte de ${qui} ?\n\nIl ne pourra plus se connecter. Aucune donnée n'est supprimée, et l'opération est réversible.`
      : `Réactiver le compte de ${qui} ?\n\nIl pourra de nouveau se connecter.`;
    if (!window.confirm(message)) return;

    setEnCours(compte.id);
    setErreur(null);
    try {
      await appelerAdmin({
        action: desactiver ? 'admin.desactiver' : 'admin.reactiver',
        praticienId: compte.id,
      });
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(null);
    }
  }

  if (chargementRole) {
    return <div style={{ padding: 32, color: '#64748b' }}>Chargement…</div>;
  }

  // Écran d'un non-admin. Ce n'est pas la protection : le serveur refuse
  // déjà tout appel admin.* d'un non-admin (403). C'est juste une page
  // honnête plutôt qu'une page vide.
  if (!estAdmin) {
    return (
      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Administration</h1>
        <p style={{ color: '#64748b' }}>
          Cette page est réservée aux administrateurs.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comptes praticiens</h1>
        <button
          onClick={() => void charger()}
          disabled={chargement}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: '#0d9488', background: 'none', border: 'none',
            cursor: chargement ? 'default' : 'pointer', opacity: chargement ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>
      <p style={{ color: '#64748b', fontSize: 13.5, marginBottom: 24 }}>
        Désactiver un compte l'empêche de se connecter. Aucune donnée n'est supprimée
        et l'opération est réversible — la suppression de compte n'existe pas ici,
        elle rendrait les dossiers patients définitivement illisibles.
      </p>

      {erreur && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16,
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13.5,
        }}>
          <AlertTriangle size={16} /> {erreur}
        </div>
      )}

      {tronquee && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, background: '#fffbeb',
          border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13.5,
        }}>
          La liste atteint la limite de 1000 comptes et est donc tronquée.
        </div>
      )}

      {succesInvitation && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16,
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontSize: 13.5,
        }}>
          <CheckCircle2 size={16} /> {succesInvitation}
        </div>
      )}

      {/* Invitation. Le praticien recoit un lien qui le mene directement au
          choix de son mot de passe : il n'y a pas d'inscription autonome,
          retiree le 2026-08-29 parce qu'elle laissait n'importe qui creer un
          compte praticien. */}
      <form
        onSubmit={inviter}
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
          padding: '16px 18px', marginBottom: 24,
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
        }}
      >
        <div style={{ flex: '1 1 280px', minWidth: 220 }}>
          <label
            htmlFor="email-invitation"
            style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}
          >
            Inviter un praticien
          </label>
          <input
            id="email-invitation"
            type="email"
            value={emailInvite}
            onChange={e => setEmailInvite(e.target.value)}
            disabled={invitationEnCours}
            placeholder="adresse@exemple.fr"
            style={{
              width: '100%', padding: '9px 12px', fontSize: 13.5,
              border: '1px solid #cbd5e1', borderRadius: 8,
              background: 'white', color: '#0f172a', boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={invitationEnCours || !emailInvite.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', fontSize: 13.5, fontWeight: 600,
            color: 'white', background: '#0d9488',
            border: 'none', borderRadius: 8,
            cursor: invitationEnCours || !emailInvite.trim() ? 'default' : 'pointer',
            opacity: invitationEnCours || !emailInvite.trim() ? 0.55 : 1,
          }}
        >
          <UserPlus size={15} />
          {invitationEnCours ? 'Envoi…' : "Envoyer l'invitation"}
        </button>
        <p style={{ flexBasis: '100%', margin: 0, fontSize: 12.5, color: '#64748b' }}>
          Le compte est créé avec le rôle praticien. L'invité reçoit un lien pour
          choisir son mot de passe ; tant qu'il ne l'a pas fait, son email reste
          non confirmé dans la liste ci-dessous.
        </p>
      </form>

      {chargement ? (
        <div style={{ color: '#64748b' }}>Chargement des comptes…</div>
      ) : comptes.length === 0 ? (
        <div style={{ color: '#64748b' }}>Aucun compte.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Praticien</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Rôle</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Créé le</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Dernière connexion</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Statut</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }} />
              </tr>
            </thead>
            <tbody>
              {comptes.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    {[c.prenom, c.nom].filter(Boolean).join(' ') || <span style={{ color: '#94a3b8' }}>—</span>}
                    {c.sansFichePraticien && (
                      <span title="Compte sans fiche praticien" style={{ marginLeft: 6, color: '#b45309' }}>⚠</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    {c.email ?? '—'}
                    {!c.emailConfirme && (
                      <span style={{ marginLeft: 6, fontSize: 11.5, color: '#b45309' }}>non confirmé</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {c.appRole === 'admin'
                      ? <span style={{ fontWeight: 700, color: '#0d9488' }}>admin</span>
                      : c.appRole ?? <span style={{ color: '#b45309' }}>aucun</span>}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{dateCourte(c.creeLe)}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{dateCourte(c.derniereConnexion)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {c.actif
                      ? <span style={{ color: '#15803d', fontWeight: 600 }}>Actif</span>
                      : <span style={{ color: '#b91c1c', fontWeight: 600 }}>Désactivé</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      onClick={() => void basculerStatut(c)}
                      disabled={enCours === c.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
                        border: '1px solid ' + (c.actif ? '#fecaca' : '#bbf7d0'),
                        background: c.actif ? '#fef2f2' : '#f0fdf4',
                        color: c.actif ? '#b91c1c' : '#15803d',
                        cursor: enCours === c.id ? 'default' : 'pointer',
                        opacity: enCours === c.id ? 0.5 : 1,
                      }}
                    >
                      {c.actif ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                      {c.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
