import { useState } from 'react';
import { toast } from 'sonner';
import { useParticipants } from '../../../hooks/useParticipants';
import type { Participant } from '../../../types';
import { useEtatSession } from '../../../hooks/useEtatSession';
import { formaterDateNaissanceAffichage, masquerSaisieDateNaissance, messageErreurDateNaissance, parserDateNaissanceSaisie } from '../../../utils/dateNaissance';
import { C, EcranChargement } from './communs';

// ── Modification fiche patient mobile ────────────────────────────────────────

export function EditPatientMobile({ participant, onBack: retourParent }: { participant: import('../../../types').Participant; onBack: () => void }) {
  const { updateParticipant } = useParticipants();
  const [loading, setLoading] = useState(false);
  // Conservée si l'interface est remplacée (rotation du téléphone).
  const [form, setForm, effacerSaisie] = useEtatSession(`modifier_beneficiaire_${participant.id}`, () => ({
    prenom:                  participant.prenom ?? '',
    nom:                     participant.nom ?? '',
    dateNaissance:           participant.dateNaissance ?? '',
    taille:                  participant.taille ? String(participant.taille) : '',
    poids:                   participant.poids ? String(participant.poids) : '',
    telephone:               participant.telephone ?? '',
    email:                   participant.email ?? '',
    adresseRue:              participant.adresseRue ?? '',
    adresseCodePostal:       participant.adresseCodePostal ?? '',
    adresseVille:            participant.adresseVille ?? '',
    contexteClinic:          participant.contexteClinic ?? '',
    antecedentsMedicaux:     participant.antecedentsMedicaux ?? '',
    antecedentsChirurgicaux: participant.antecedentsChirurgicaux ?? '',
    allergies:               participant.allergies ?? '',
  }));

  // Retour explicite ou fiche enregistrée : rien à reprendre.
  function onBack() {
    effacerSaisie();
    retourParent();
  }

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // Date de naissance : saisie au clavier JJ/MM/AAAA, même logique que
  // NouveauPatientMobile ci-dessus et que ParticipantForm.tsx (voir
  // src/utils/dateNaissance.ts) — mais champ non obligatoire ici : une fiche
  // en modification a déjà une date de naissance, la laisser vide au blur
  // garde simplement l'existante (voir sauvegarder ci-dessous).
  const [dateNaissanceSaisie, setDateNaissanceSaisie] = useState(
    formaterDateNaissanceAffichage(participant.dateNaissance ?? ''),
  );
  const [dateNaissanceErreur, setDateNaissanceErreur] = useState<string | null>(null);

  function handleChangeDateNaissance(e: React.ChangeEvent<HTMLInputElement>) {
    const masque = masquerSaisieDateNaissance(e.target.value);
    setDateNaissanceSaisie(masque);
    setDateNaissanceErreur(null);
    const resultat = parserDateNaissanceSaisie(masque);
    setF('dateNaissance', resultat.statut === 'valide' ? resultat.iso : '');
  }

  function handleBlurDateNaissance() {
    if (!dateNaissanceSaisie) return;
    setDateNaissanceErreur(messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie)));
  }

  // Non obligatoire : une saisie vide garde la date existante (voir
  // sauvegarder). Seule une saisie NON vide mais invalide/incomplète bloque.
  function validerDateNaissance(): string | null {
    if (!dateNaissanceSaisie || form.dateNaissance) return null;
    return messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie));
  }

  async function sauvegarder() {
    if (!form.prenom.trim() || !form.nom.trim()) { toast.error('Prénom et nom requis'); return; }
    const erreurDate = validerDateNaissance();
    if (erreurDate) {
      setDateNaissanceErreur(erreurDate);
      toast.error(erreurDate);
      return;
    }
    setLoading(true);
    try {
      await updateParticipant(participant.id, {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        dateNaissance: form.dateNaissance || participant.dateNaissance,
        taille: form.taille ? Number(form.taille) : undefined,
        poids: form.poids ? Number(form.poids) : undefined,
        telephone: form.telephone || undefined,
        email: form.email || undefined,
        adresseRue: form.adresseRue || undefined,
        adresseCodePostal: form.adresseCodePostal || undefined,
        adresseVille: form.adresseVille || undefined,
        contexteClinic: form.contexteClinic || undefined,
        antecedentsMedicaux: form.antecedentsMedicaux || undefined,
        antecedentsChirurgicaux: form.antecedentsChirurgicaux || undefined,
        allergies: form.allergies || undefined,
      });
      toast.success('Fiche mise à jour ✅');
      onBack();
    } catch (err) {
      console.error('Erreur mise à jour fiche:', err);
      toast.error('Erreur lors de la sauvegarde, réessayez');
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', border: `1.5px solid ${C.border}`,
    borderRadius: 10, fontSize: 14, outline: 'none', background: 'white',
    boxSizing: 'border-box', marginBottom: 12, fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    display: 'block', marginBottom: 5,
  };
  const sec: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 8, paddingLeft: 4,
  };
  const box: React.CSSProperties = {
    background: 'white', borderRadius: 12, border: `1px solid ${C.border}`,
    padding: '14px 16px', marginBottom: 16,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 40 }}>
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} aria-hidden="true" />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Modifier la fiche</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{participant.prenom} {participant.nom}</div>
      </div>

      <div style={{ padding: 16 }}>

        <div style={sec}>Identité</div>
        <div style={box}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Prénom *</label>
              <input value={form.prenom} onChange={e => setF('prenom', e.target.value)} style={{ ...inp, marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Nom *</label>
              <input value={form.nom} onChange={e => setF('nom', e.target.value)} style={{ ...inp, marginBottom: 0 }} />
            </div>
          </div>
          <label style={lbl}>Date de naissance</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="JJ/MM/AAAA"
            maxLength={10}
            value={dateNaissanceSaisie}
            onChange={handleChangeDateNaissance}
            onBlur={handleBlurDateNaissance}
            style={{ ...inp, marginBottom: dateNaissanceErreur ? 4 : 12, borderColor: dateNaissanceErreur ? '#FCA5A5' : C.border }}
          />
          {dateNaissanceErreur && (
            <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{dateNaissanceErreur}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Taille (cm)</label>
              <input type="number" value={form.taille} onChange={e => setF('taille', e.target.value)} placeholder="170" style={{ ...inp, marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Poids (kg)</label>
              <input type="number" value={form.poids} onChange={e => setF('poids', e.target.value)} placeholder="70" style={{ ...inp, marginBottom: 0 }} />
            </div>
          </div>
        </div>

        <div style={sec}>Contact</div>
        <div style={box}>
          <label style={lbl}>Téléphone</label>
          <input type="tel" value={form.telephone} onChange={e => setF('telephone', e.target.value)} placeholder="06 00 00 00 00" style={inp} />
          <label style={lbl}>Email</label>
          <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="patient@email.com" style={{ ...inp, marginBottom: 0 }} />
        </div>

        <div style={sec}>Adresse</div>
        <div style={box}>
          <label style={lbl}>Rue</label>
          <input value={form.adresseRue} onChange={e => setF('adresseRue', e.target.value)} placeholder="12 rue des Acacias" style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label style={lbl}>Code postal</label>
              <input value={form.adresseCodePostal} onChange={e => setF('adresseCodePostal', e.target.value)} placeholder="75001" style={{ ...inp, marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Ville</label>
              <input value={form.adresseVille} onChange={e => setF('adresseVille', e.target.value)} placeholder="Paris" style={{ ...inp, marginBottom: 0 }} />
            </div>
          </div>
        </div>

        <div style={sec}>Santé</div>
        <div style={box}>
          <label style={lbl}>Contexte clinique / pathologie</label>
          <textarea value={form.contexteClinic} onChange={e => setF('contexteClinic', e.target.value)} placeholder="Ex : PTH droite, diabète T2..." rows={2}
            style={{ ...inp, resize: 'none' }} />
          <label style={lbl}>Antécédents médicaux</label>
          <textarea value={form.antecedentsMedicaux} onChange={e => setF('antecedentsMedicaux', e.target.value)} placeholder="HTA, diabète T2..." rows={2}
            style={{ ...inp, resize: 'none' }} />
          <label style={lbl}>Antécédents chirurgicaux</label>
          <textarea value={form.antecedentsChirurgicaux} onChange={e => setF('antecedentsChirurgicaux', e.target.value)} placeholder="PTH droite 2023..." rows={2}
            style={{ ...inp, resize: 'none' }} />
          <label style={lbl}>Allergies</label>
          <input value={form.allergies} onChange={e => setF('allergies', e.target.value)} placeholder="Allergies connues..." style={{ ...inp, marginBottom: 0 }} />
        </div>

        <button onClick={sauvegarder} disabled={!form.prenom || !form.nom || loading}
          style={{
            width: '100%', padding: '14px',
            background: !form.prenom || !form.nom ? '#E0EEEE' : C.primary,
            color: !form.prenom || !form.nom ? C.muted : 'white',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: !form.prenom || !form.nom ? 'not-allowed' : 'pointer',
          }}>
          {loading ? 'Enregistrement...' : '💾 Enregistrer les modifications'}
        </button>

      </div>
    </div>
  );
}

export function ModifierBeneficiaireMobile({ participantId, onBack }: { participantId: string; onBack: () => void }) {
  const { participants, loading } = useParticipants();
  const participant: Participant | undefined = participants.find(p => p.id === participantId);
  if (!participant) return <EcranChargement loading={loading} texteIntrouvable="Bénéficiaire introuvable" onBack={onBack} />;
  return <EditPatientMobile participant={participant} onBack={onBack} />;
}
