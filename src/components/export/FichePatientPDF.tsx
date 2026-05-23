import type { Participant, Bilan, Contrat, NotesBilan } from '../../types';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Settings {
  prenom: string; nom: string; titre: string;
  email: string; telephone: string; logoUrl: string;
}

interface Props {
  participant: Participant;
  bilanInitial: Bilan | null;
  contratActif: Contrat | null;
  settings: Settings;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function formatDateFR(d: string | Date): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcAge(dn: string): number {
  const today = new Date(), birth = new Date(dn);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth()) age--;
  return age;
}

function getCategorieIMC(imc: number): string {
  if (imc < 18.5) return 'Insuffisance pondérale';
  if (imc < 25)   return 'Poids normal';
  if (imc < 30)   return 'Surpoids';
  if (imc < 35)   return 'Obésité modérée';
  return 'Obésité sévère / morbide';
}

function masquerIBAN(iban: string): string {
  const c = iban.replace(/\s/g, '');
  if (c.length < 8) return iban;
  return c.slice(0, 4) + ' **** **** **** ' + c.slice(-3);
}

const MODE_LABEL: Record<string, string> = {
  voiture: '🚗 Voiture', velo: '🚲 Vélo', transports: '🚌 Transports',
  marche: '🚶 Marche', fauteuil: '♿ Fauteuil', autre: '✏️ Autre',
};

const JOURS_FR: Record<string, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

const NOTE_COLOR: Record<number, string> = {
  1: '#EF4444', 2: '#F59E0B', 3: '#F59E0B', 4: '#3B6D11', 5: '#2BBFBF',
};
const NOTE_LABEL: Record<number, string> = {
  1: 'Très insuf.', 2: 'Insuffisant', 3: 'Moyen', 4: 'Bien', 5: 'Excellent',
};

// ─── Composants internes ──────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  width: 794, minHeight: 1123, padding: '44px 52px 90px',
  fontFamily: 'Arial, sans-serif', fontSize: 12,
  color: '#0D2B4B', background: 'white',
  position: 'relative', boxSizing: 'border-box',
};

function SectionPDF({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#1A5F9E',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        borderBottom: '1px solid #D0E7F9', paddingBottom: 4, marginBottom: 8,
      }}>
        {titre}
      </div>
      {children}
    </div>
  );
}

function LigneTexte({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11.5 }}>
      <span style={{ color: '#6B84A0', minWidth: 150, flexShrink: 0 }}>{label} :</span>
      <span style={{ color: '#0D2B4B', fontWeight: 500 }}>{valeur}</span>
    </div>
  );
}

function Puces({ label, valeur, max }: { label: string; valeur: number | null; max: number }) {
  if (valeur === null || valeur === undefined) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'center' }}>
      <span style={{ color: '#6B84A0', minWidth: 150, fontSize: 11.5, flexShrink: 0 }}>{label} :</span>
      <span style={{ color: '#1A5F9E', fontSize: 12 }}>{'●'.repeat(valeur)}{'○'.repeat(max - valeur)}</span>
      <span style={{ fontSize: 10, color: '#8B9BB4' }}>{valeur}/{max}</span>
    </div>
  );
}

function FooterFiche({ settings, page }: { settings: Settings; page: string }) {
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 52, right: 52,
      borderTop: '1px solid #D0E7F9', paddingTop: 10,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 9, color: '#8B9BB4',
    }}>
      <span>{settings.prenom} {settings.nom} · {settings.titre} · Mouv'APA</span>
      <span>Document confidentiel · {formatDateFR(new Date())}</span>
      <span>{page}</span>
    </div>
  );
}

// ─── Page 1 — Identité + Profil ───────────────────────────────────────────────

function Page1({ participant, settings }: { participant: Participant; settings: Settings }) {
  const imc = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10
    : null;

  return (
    <div style={PAGE}>
      {/* En-tête */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 20, paddingBottom: 14, borderBottom: '2.5px solid #1A5F9E',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {settings.logoUrl ? (
            <img src={settings.logoUrl} style={{ height: 40, objectFit: 'contain' }} alt="Logo" />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1A5F9E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>
              M
            </div>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1A5F9E' }}>Mouv'APA Suivis</div>
            <div style={{ fontSize: 10, color: '#8B9BB4' }}>par {settings.prenom} {settings.nom} · {settings.titre}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D2B4B' }}>Fiche patient</div>
          <div style={{ fontSize: 10, color: '#8B9BB4' }}>Générée le {formatDateFR(new Date())}</div>
        </div>
      </div>

      {/* Identité */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0D2B4B', marginBottom: 3 }}>
          {participant.prenom.toUpperCase()} {participant.nom.toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: '#4A6080', lineHeight: 1.8 }}>
          {calcAge(participant.dateNaissance)} ans · Né(e) le {formatDateFR(participant.dateNaissance)}
        </div>
        {(participant.taille || participant.poids) && (
          <div style={{ fontSize: 12, color: '#4A6080' }}>
            {[participant.taille && `${participant.taille} cm`, participant.poids && `${participant.poids} kg`, imc && `IMC ${imc} — ${getCategorieIMC(imc)}`].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Coordonnées */}
      <SectionPDF titre="Coordonnées">
        {participant.telephone && <LigneTexte label="Téléphone" valeur={participant.telephone} />}
        {participant.email && <LigneTexte label="Email" valeur={participant.email} />}
        {participant.adresseRue && (
          <LigneTexte label="Adresse" valeur={`${participant.adresseRue}, ${participant.adresseCodePostal} ${participant.adresseVille}`} />
        )}
        {participant.iban && (
          <LigneTexte label="IBAN (SAP)" valeur={masquerIBAN(participant.iban)} />
        )}
      </SectionPDF>

      {/* Profil de santé */}
      {(participant.antecedentsMedicaux || participant.antecedentsChirurgicaux || participant.allergies) && (
        <SectionPDF titre="Profil de santé">
          {participant.antecedentsMedicaux && (
            <LigneTexte label="Antécédents médicaux" valeur={participant.antecedentsMedicaux} />
          )}
          {participant.antecedentsChirurgicaux && (
            <LigneTexte label="Antécédents chirurgicaux" valeur={participant.antecedentsChirurgicaux} />
          )}
          {participant.allergies && (
            <LigneTexte label="Allergies" valeur={participant.allergies} />
          )}
          {participant.modeDeplacementHabituel && (
            <LigneTexte label="Déplacement habituel" valeur={MODE_LABEL[participant.modeDeplacementHabituel] ?? participant.modeDeplacementHabituel} />
          )}
        </SectionPDF>
      )}

      {/* Disponibilités */}
      {(participant.disponibilites?.joursDisponibles?.length ?? 0) > 0 && (
        <SectionPDF titre="Disponibilités">
          <LigneTexte
            label="Jours"
            valeur={participant.disponibilites!.joursDisponibles.map(j => JOURS_FR[j] ?? j).join(', ')}
          />
          {participant.disponibilites!.dureeSeanceMinutes && (
            <LigneTexte label="Durée séance" valeur={`${participant.disponibilites!.dureeSeanceMinutes} min`} />
          )}
          {participant.disponibilites!.contraintes && (
            <LigneTexte label="Contraintes" valeur={participant.disponibilites!.contraintes} />
          )}
        </SectionPDF>
      )}

      {/* Objectifs & activités */}
      {((participant.activitesSouhaitees?.length ?? 0) > 0 || participant.objectifsPatient) && (
        <SectionPDF titre="Objectifs & activités souhaitées">
          {(participant.activitesSouhaitees?.length ?? 0) > 0 && (
            <LigneTexte label="Activités souhaitées" valeur={participant.activitesSouhaitees!.join(' · ')} />
          )}
          {participant.objectifsPatient && (
            <div style={{ marginTop: 6, padding: '8px 12px', background: '#E1F5EE', borderLeft: '3px solid #2BBFBF', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: '#0F6E56', fontStyle: 'italic', lineHeight: 1.6 }}>
                « {participant.objectifsPatient} »
              </div>
            </div>
          )}
        </SectionPDF>
      )}

      <FooterFiche settings={settings} page="1" />
    </div>
  );
}

// ─── Page 2 — Bilan fonctionnel ───────────────────────────────────────────────

function Page2({ bilan, contrat, settings }: { bilan: Bilan; contrat: Contrat | null; settings: Settings }) {
  const notes: NotesBilan = bilan.notesBilan ?? {};
  const interp = bilan.interpretationIA;
  const flat = bilan.bilanInitialData?.formulaireFlat?.data ?? {};

  const tests: { label: string; valeur: string | null; note?: number }[] = [
    { label: 'Équilibre D', valeur: bilan.equilibre.droite !== null ? `${bilan.equilibre.droite} s` : null, note: notes.equilibre },
    { label: 'Équilibre G', valeur: bilan.equilibre.gauche !== null ? `${bilan.equilibre.gauche} s` : null },
    { label: 'Chair Stand 30s', valeur: bilan.chairStand30 !== null ? `${bilan.chairStand30} rép.` : null, note: notes.force },
    { label: 'HandGrip D', valeur: bilan.handGrip.droite !== null ? `${bilan.handGrip.droite} kg` : null, note: notes.handGrip },
    { label: 'HandGrip G', valeur: bilan.handGrip.gauche !== null ? `${bilan.handGrip.gauche} kg` : null },
    { label: 'TUG 3m', valeur: bilan.tug3m !== null ? `${bilan.tug3m} s` : null, note: notes.mobilite },
    { label: 'Souplesse', valeur: bilan.souplesse.valeur !== null ? `${bilan.souplesse.valeur > 0 ? '+' : ''}${bilan.souplesse.valeur} cm` : null, note: notes.souplesse },
    { label: 'TM6 distance', valeur: bilan.tm6.distanceMetres !== null ? `${bilan.tm6.distanceMetres} m` : null, note: notes.endurance },
    { label: 'Mémoire immédiate', valeur: bilan.memoire.scoreImmediat !== null ? `${bilan.memoire.scoreImmediat}/5` : null },
    { label: 'Mémoire différée', valeur: bilan.memoire.scoreDiffere !== null ? `${bilan.memoire.scoreDiffere}/5` : null, note: notes.memoire },
  ].filter(t => t.valeur !== null) as { label: string; valeur: string; note?: number }[];

  return (
    <div style={PAGE}>
      {/* En-tête page 2 */}
      <div style={{ borderBottom: '2.5px solid #1A5F9E', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0D2B4B' }}>Bilan fonctionnel initial</div>
        <div style={{ fontSize: 11, color: '#8B9BB4' }}>Réalisé le {formatDateFR(bilan.date)}</div>
      </div>

      {/* Tableau des tests */}
      {tests.length > 0 && (
        <SectionPDF titre="Résultats des tests">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#F0F7FF' }}>
                {['Test', 'Résultat', 'Note', 'Interprétation'].map(h => (
                  <th key={h} style={{ padding: '5px 8px', textAlign: h === 'Test' || h === 'Interprétation' ? 'left' : 'center', fontWeight: 700, color: '#0D2B4B', borderBottom: '1px solid #D0E7F9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #E8F0F8' }}>
                  <td style={{ padding: '5px 8px', color: '#4A6080' }}>{t.label}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600, color: '#0D2B4B' }}>{t.valeur}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    {t.note ? (
                      <span style={{ background: NOTE_COLOR[t.note], color: 'white', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                        {t.note}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '5px 8px', fontSize: 10, color: t.note ? NOTE_COLOR[t.note] : '#8B9BB4' }}>
                    {t.note ? NOTE_LABEL[t.note] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPDF>
      )}

      {/* Habitudes de vie depuis le bilan */}
      {(flat.douleur !== undefined || flat.fatigue !== undefined) && (
        <SectionPDF titre="Ressenti global">
          {flat.douleur !== undefined && <Puces label="Douleur quotidienne" valeur={flat.douleur as number} max={10} />}
          {flat.fatigue !== undefined && <Puces label="Fatigue quotidienne" valeur={flat.fatigue as number} max={10} />}
          {flat.qualiteSommeil !== undefined && <Puces label="Qualité du sommeil" valeur={flat.qualiteSommeil as number} max={5} />}
        </SectionPDF>
      )}

      {/* Interprétation IA */}
      {interp && (
        <>
          <SectionPDF titre="Interprétation professionnelle">
            <div style={{ fontSize: 11.5, lineHeight: 1.7, color: '#333', textAlign: 'justify' }}>
              {interp.textePro}
            </div>
            {interp.pointsForts?.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#3B6D11', fontWeight: 700 }}>Points forts :</span>
                <span style={{ fontSize: 10, color: '#3B6D11' }}>{interp.pointsForts.join(' · ')}</span>
              </div>
            )}
            {interp.pointsATravail?.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#92400E', fontWeight: 700 }}>À travailler :</span>
                <span style={{ fontSize: 10, color: '#92400E' }}>{interp.pointsATravail.join(' · ')}</span>
              </div>
            )}
          </SectionPDF>

          {interp.messageClient && (
            <div style={{ background: '#E1F5EE', borderLeft: '4px solid #2BBFBF', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0F6E56', marginBottom: 4 }}>Message pour le patient</div>
              <div style={{ fontSize: 11.5, color: '#0F6E56', fontStyle: 'italic', lineHeight: 1.6 }}>
                {interp.messageClient}
              </div>
            </div>
          )}
        </>
      )}

      {/* Notes pro */}
      {bilan.notesProfessionnelles && (
        <SectionPDF titre="Notes professionnelles">
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{bilan.notesProfessionnelles}</div>
        </SectionPDF>
      )}

      {/* Suivi en cours */}
      {contrat && (
        <SectionPDF titre="Suivi en cours">
          <LigneTexte label="Planning" valeur={`${contrat.joursFixe.map(j => JOURS_FR[j]).join(', ')} à ${contrat.heureDebut} · ${contrat.dureeMinutes} min`} />
          <LigneTexte label="Depuis" valeur={formatDateFR(contrat.dateDebut)} />
          <LigneTexte label="Progression" valeur={`${contrat.nombreSeancesRealisees} / ${contrat.nombreSeancesTotal} séances réalisées`} />
        </SectionPDF>
      )}

      <FooterFiche settings={settings} page="2" />
    </div>
  );
}

// ─── Composant principal (rendu caché) ────────────────────────────────────────

export default function FichePatientPDF({ participant, bilanInitial, contratActif, settings }: Props) {
  return (
    <div style={{ position: 'fixed', top: -9999, left: -9999, zIndex: -1 }}>
      <div id="fiche-page-1">
        <Page1 participant={participant} settings={settings} />
      </div>
      {bilanInitial && (
        <div id="fiche-page-2">
          <Page2 bilan={bilanInitial} contrat={contratActif} settings={settings} />
        </div>
      )}
    </div>
  );
}
