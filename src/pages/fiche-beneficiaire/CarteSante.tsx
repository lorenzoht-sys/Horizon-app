import { useState } from 'react';
import type { Bilan, Participant } from '../../types';
import { formatMomentsTraitement, getAntecedentIcon, getAntecedentTitre, getAntecedentSousLigne, getTraitementsActifs, getTraitementsArretes } from '../../lib/anamnese';

// ── CarteSante ────────────────────────────────────────────────────────────────

export function CarteSante({ participant, bilanInitial, onModifier }: {
  participant: Participant;
  bilanInitial: Bilan | null;
  onModifier: () => void;
}) {
  const [showArretes, setShowArretes] = useState(false);
  const profil = bilanInitial?.profilEnrichi;

  const traitementsActifs = getTraitementsActifs(participant.traitements);
  const traitementsArretes = getTraitementsArretes(participant.traitements);
  const antecedents = participant.antecedentsMedicauxStructures ?? [];
  const contactsSante = participant.anamnese?.autonomie?.contactsSante ?? [];

  const lignes = ([
    participant.pathologie && { icon: '🏥', texte: participant.pathologie },
    participant.antecedentsMedicaux && { icon: '📋', texte: participant.antecedentsMedicaux },
    participant.antecedentsChirurgicaux && { icon: '✂️', texte: participant.antecedentsChirurgicaux },
    participant.allergies && { icon: '⚠️', texte: `Allergies : ${participant.allergies}` },
    profil?.douleursNiveau != null && { icon: '🔴', texte: `Douleur habituelle : ${profil.douleursNiveau}/10` },
    profil?.douleursLocalisation && { icon: '📍', texte: profil.douleursLocalisation },
    profil?.chutes12mois != null && { icon: '⚡', texte: `Chutes / 12 mois : ${profil.chutes12mois}` },
    profil?.objectifsPersonnels && { icon: '🎯', texte: profil.objectifsPersonnels },
  ] as ({ icon: string; texte: string } | false)[]).filter((l): l is { icon: string; texte: string } => Boolean(l));

  const hasContent = lignes.length > 0 || traitementsActifs.length > 0 || traitementsArretes.length > 0 || antecedents.length > 0 || contactsSante.length > 0;
  if (!hasContent) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Profil de santé</div>
        <button
          onClick={onModifier}
          className="text-[12px] text-gray-400 hover:text-primary flex items-center gap-1 transition-colors"
        >
          ✏️ Modifier
        </button>
      </div>

      {/* Infos textuelles */}
      {lignes.length > 0 && (
        <div className="space-y-2 mb-4">
          {lignes.slice(0, 6).map((l, i) => (
            <div key={i} className="flex gap-2 text-[13px] text-gray-600 leading-relaxed">
              <span className="flex-shrink-0">{l.icon}</span>
              <span>{l.texte}</span>
            </div>
          ))}
        </div>
      )}

      {/* Traitements structurés */}
      {(traitementsActifs.length > 0 || traitementsArretes.length > 0) && (
        <div className="mt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">Traitements en cours</div>
          {traitementsActifs.length > 0 ? (
            <div className="space-y-1.5 mb-2">
              {traitementsActifs.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-[13px] flex-wrap">
                  <span className="flex-shrink-0">💊</span>
                  <span className="font-medium text-gray-700">{t.nom || '—'}</span>
                  {t.dose && <span className="text-gray-400">· {t.dose}</span>}
                  {t.frequence && <span className="text-gray-400">· {t.frequence}</span>}
                  {(t.moments?.length ?? 0) > 0 && <span className="text-gray-400">· {formatMomentsTraitement(t.moments)}</span>}
                  {t.effetSecondaire && <span className="text-gray-400 text-[12px]">— {t.effetSecondaire}</span>}
                  <span className="ml-auto text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">En cours ✅</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 italic mb-2">Aucun traitement en cours</p>
          )}

          {traitementsArretes.length > 0 && (
            <div>
              <button
                onClick={() => setShowArretes(!showArretes)}
                className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 font-medium mb-1.5"
              >
                {showArretes ? '▼' : '▶'} Traitements arrêtés ({traitementsArretes.length})
              </button>
              {showArretes && (
                <div className="space-y-1 border border-gray-100 rounded-lg p-2">
                  {traitementsArretes.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-[12px] text-gray-400">
                      <span>💊</span>
                      <span className="line-through">{t.nom}</span>
                      {t.dose && <span>· {t.dose}</span>}
                      <span className="ml-auto text-[10px] bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Arrêté le {new Date((t.date_fin ?? '') + 'T12:00').toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Antécédents structurés */}
      {antecedents.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">Antécédents</div>
          <div className="space-y-2">
            {antecedents.map(a => (
              <div key={a.id}>
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="flex-shrink-0">{getAntecedentIcon(a)}</span>
                  <span className="font-medium text-gray-700">{getAntecedentTitre(a)}</span>
                  {a.douleur === 'oui' && (
                    <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">Douleur liée</span>
                  )}
                </div>
                {getAntecedentSousLigne(a) && (
                  <p className="text-[12px] text-gray-400 ml-5 mt-0.5">{getAntecedentSousLigne(a)}</p>
                )}
                {a.notes && (
                  <p className="text-[12px] text-gray-400 ml-5 mt-0.5 italic">{a.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts professionnels — saisis dans l'anamnèse (ContactsSanteForm,
          ParticipantForm.tsx), jamais réaffichés nulle part avant ce bug 06.
          `prenom`/`notes` optionnels : un contact plus ancien sans ces clés
          affiche simplement `nom` seul, sans notes. */}
      {contactsSante.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">Contacts professionnels</div>
          <div className="space-y-2">
            {contactsSante.map((c, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 text-[13px] flex-wrap">
                  <span className="flex-shrink-0">🩺</span>
                  <span className="font-medium text-gray-700">{[c.prenom, c.nom].filter(Boolean).join(' ') || '—'}</span>
                  {c.profession && <span className="text-gray-400">· {c.profession}</span>}
                  {c.telephone && (
                    <a href={`tel:${c.telephone}`} className="text-gray-500 hover:text-gray-800 transition-colors">
                      📞 {c.telephone}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-gray-500 hover:text-gray-800 transition-colors">
                      ✉️ {c.email}
                    </a>
                  )}
                </div>
                {c.notes && (
                  <p className="text-[12px] text-gray-400 ml-5 mt-0.5 italic">{c.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
