import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useParticipants } from '../../../hooks/useParticipants';
import { v4 as uuidv4 } from 'uuid';
import { erreurConsentementCreation, normaliserRgpd } from '../../../lib/consentementRgpd';
import type { RgpdConsent } from '../../../types';
import { getBrouillonParticipant, sauvegarderBrouillonParticipant, supprimerBrouillonParticipant } from '../../../hooks/useBrouillonParticipant';
import { formaterDateNaissanceAffichage, masquerSaisieDateNaissance, messageErreurDateNaissance, parserDateNaissanceSaisie } from '../../../utils/dateNaissance';
import { BlocConsentementMobile } from './BlocConsentementMobile';
import { C } from './communs';

// ── EcranSaisie ───────────────────────────────────────────────────────────────

export function ChoixSaisie({ onPatient, onBilan }: { onPatient: () => void; onBilan: () => void }) {
  const btn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, cursor: 'pointer', textAlign: 'left' };
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 20, paddingRight: 20, paddingBottom: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Que saisir ?</div>
      <button onClick={onBilan} style={btn}>
        <span style={{ fontSize: 28 }}>📋</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nouveau bilan</div><div style={{ fontSize: 12, color: C.muted }}>Bilan initial ou trimestriel</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
      <button onClick={onPatient} style={btn}>
        <span style={{ fontSize: 28 }}>👤</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nouveau bénéficiaire</div><div style={{ fontSize: 12, color: C.muted }}>Créer une fiche bénéficiaire</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
    </div>
  );
}

// Brouillon PARTAGÉ avec le formulaire complet (ParticipantFormPage, même clé) :
// tourner le téléphone en paysage reprend la saisie dans le formulaire
// complet, et inversement. Le consentement reste obligatoire des deux côtés —
// le formulaire complet normalise le `rgpd` du brouillon et refuse la
// création sans lui (src/lib/consentementRgpd.ts, testé).
export const CLE_BROUILLON_CREATION = 'nouveau';

export function texteBrouillon(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function NouveauPatientMobile({ onBack: retourParent, onCree }: { onBack: () => void; onCree: (participantId: string) => void }) {
  const { addParticipant } = useParticipants();
  const [brouillon] = useState<Record<string, unknown>>(() => getBrouillonParticipant(CLE_BROUILLON_CREATION)?.data ?? {});
  const [form, setForm] = useState(() => ({
    prenom: texteBrouillon(brouillon.prenom),
    nom: texteBrouillon(brouillon.nom),
    dateNaissance: texteBrouillon(brouillon.dateNaissance),
    telephone: texteBrouillon(brouillon.telephone),
    pathologie: texteBrouillon(brouillon.pathologie),
  }));
  const [rgpd, setRgpd] = useState<RgpdConsent>(() => normaliserRgpd(brouillon.rgpd as Partial<RgpdConsent> | undefined));
  const [droitImage, setDroitImage] = useState<boolean>(brouillon.droitImage === true);
  const [enregistrement, setEnregistrement] = useState(false);

  // Date de naissance : saisie au clavier JJ/MM/AAAA. form.dateNaissance
  // reste l'ISO (inchangé, c'est lui qui est écrit dans le brouillon et
  // envoyé à addParticipant) ; ce texte séparé est ce que l'utilisateur voit
  // et tape. Voir src/utils/dateNaissance.ts (même logique que le formulaire
  // complet, ParticipantForm.tsx).
  const [dateNaissanceSaisie, setDateNaissanceSaisie] = useState(
    formaterDateNaissanceAffichage(texteBrouillon(brouillon.dateNaissance)),
  );
  const [dateNaissanceErreur, setDateNaissanceErreur] = useState<string | null>(null);

  function handleChangeDateNaissance(e: React.ChangeEvent<HTMLInputElement>) {
    const masque = masquerSaisieDateNaissance(e.target.value);
    setDateNaissanceSaisie(masque);
    setDateNaissanceErreur(null);
    const resultat = parserDateNaissanceSaisie(masque);
    setForm(f => ({ ...f, dateNaissance: resultat.statut === 'valide' ? resultat.iso : '' }));
  }

  function handleBlurDateNaissance() {
    if (!dateNaissanceSaisie) return; // le contrôle « obligatoire » se fait à la sauvegarde
    setDateNaissanceErreur(messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie)));
  }

  function validerDateNaissance(): string | null {
    if (form.dateNaissance) return null;
    return dateNaissanceSaisie
      ? messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie))
      : 'La date de naissance est obligatoire.';
  }

  // Écrit à chaque changement, sans délai : c'est ce brouillon qui survit à la
  // rotation. Fusionné avec l'existant, pour ne rien perdre de ce que le
  // formulaire complet y a mis (anamnèse, organisation…).
  useEffect(() => {
    const existant = getBrouillonParticipant(CLE_BROUILLON_CREATION);
    const saisieVide = !form.prenom && !form.nom && !form.dateNaissance && !form.telephone && !form.pathologie && !rgpd.consentementObtenu;
    if (!existant && saisieVide) return;
    sauvegarderBrouillonParticipant(CLE_BROUILLON_CREATION, existant?.step ?? 0, {
      ...(existant?.data ?? {}),
      ...form,
      pathologie: form.pathologie || undefined,
      rgpd,
      droitImage,
    });
  }, [form, rgpd, droitImage]);

  // Abandon explicite : le brouillon ne doit pas réapparaître, comme le
  // bouton « Annuler » du formulaire complet.
  function onBack() {
    supprimerBrouillonParticipant(CLE_BROUILLON_CREATION);
    retourParent();
  }
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box' };

  async function sauvegarder() {
    if (enregistrement) return;
    if (!form.prenom.trim() || !form.nom.trim()) {
      toast.error('Prénom et nom requis');
      return;
    }
    const erreurDate = validerDateNaissance();
    if (erreurDate) {
      setDateNaissanceErreur(erreurDate);
      toast.error(erreurDate);
      return;
    }
    // Ce formulaire n'enregistrait AUCUN consentement. Même règle que le
    // formulaire complet désormais : bloquant à la création.
    const erreurRgpd = erreurConsentementCreation(rgpd);
    if (erreurRgpd) {
      toast.error(erreurRgpd);
      return;
    }
    setEnregistrement(true);
    try {
      // Attendu, et plus lancé sans `await` : le succès s'affichait même
      // quand l'enregistrement échouait.
      // Ce que le formulaire complet a mis dans le brouillon partagé (anamnèse,
      // organisation…) n'est repris QUE pour la même personne : un brouillon
      // abandonné ne doit pas prêter ses données de santé à un autre
      // bénéficiaire.
      const donneesBrouillon = getBrouillonParticipant(CLE_BROUILLON_CREATION)?.data ?? {};
      const memePersonne =
        texteBrouillon(donneesBrouillon.prenom).trim().toLowerCase() === form.prenom.trim().toLowerCase() &&
        texteBrouillon(donneesBrouillon.nom).trim().toLowerCase() === form.nom.trim().toLowerCase();
      const cree = await addParticipant({
        ...(memePersonne ? donneesBrouillon : {}),
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        dateNaissance: form.dateNaissance,
        telephone: form.telephone || undefined,
        pathologie: form.pathologie || undefined,
        dateCreation: new Date().toISOString(),
        rgpd,
        droitImage,
        bilans: [],
        token: uuidv4().slice(0, 12),
      } as any);
      supprimerBrouillonParticipant(CLE_BROUILLON_CREATION);
      toast.success(`${form.prenom} ${form.nom} créé(e) ✅`);
      onCree(cree.id);
    } catch (err) {
      console.error('[Mobile] Création bénéficiaire en échec :', err);
      toast.error("La fiche n'a pas pu être créée, réessayez");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Nouveau bénéficiaire</div>
      </div>

      <label style={label}>Prénom *</label>
      <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Marie" style={input} />

      <label style={label}>Nom *</label>
      <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Dupont" style={input} />

      <label style={label}>Date de naissance *</label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder="JJ/MM/AAAA"
        maxLength={10}
        value={dateNaissanceSaisie}
        onChange={handleChangeDateNaissance}
        onBlur={handleBlurDateNaissance}
        style={{ ...input, marginBottom: dateNaissanceErreur ? 4 : 14, borderColor: dateNaissanceErreur ? '#FCA5A5' : C.border }}
      />
      {dateNaissanceErreur && (
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{dateNaissanceErreur}</div>
      )}

      <label style={label}>Téléphone</label>
      <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00" style={input} />

      <label style={label}>Pathologie / contexte</label>
      <input value={form.pathologie} onChange={e => setForm(f => ({ ...f, pathologie: e.target.value }))} placeholder="Ex : arthrose genou droit" style={input} />

      <BlocConsentementMobile rgpd={rgpd} onRgpdChange={setRgpd} droitImage={droitImage} onDroitImageChange={setDroitImage} />

      <button onClick={sauvegarder} disabled={enregistrement}
        style={{ width: '100%', padding: 16, background: rgpd.consentementObtenu ? C.primary : '#8FA8A8', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: enregistrement ? 'wait' : 'pointer', marginTop: 8 }}>
        {enregistrement ? 'Enregistrement…' : '✅ Créer le bénéficiaire'}
      </button>
    </div>
  );
}
