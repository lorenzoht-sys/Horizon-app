// Accueil du praticien à sa première connexion.
//
// Refonte du 25/11/2026 : un formulaire unique de cinq champs sur fond sombre
// devient un échange en quatre questions (vous, votre pratique, vos
// coordonnées, votre activité), avec un aperçu de l'en-tête des documents qui
// se remplit en direct. Les questions ajoutées complètent d'emblée le profil
// de facturation (adresse, forme juridique, TVA) : voir src/lib/onboarding.ts.
//
// Ce qui ne change pas : l'écran s'affiche tant que praticiens.titre est vide
// (App.tsx, needsOnboarding) ; prénom, nom et métier restent exigés ; le SIRET
// aussi, sauf pour un salarié d'une structure. Rien n'est écrit en base avant
// la dernière question : un praticien qui ferme l'onglet revient au début.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Building2, Check, Dumbbell, FileText, Footprints,
  HeartPulse, Hand, Hospital, House, LoaderCircle, Mail, MapPin, Medal, Phone, Receipt, Sparkles, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { lirePraticien, enregistrerPraticien } from '../lib/acces/praticien';
import { utilisateurCourant } from '../lib/session';
import { lireEtatDemarrage } from '../lib/demarrage';
import {
  ETAPES, LIEUX, METIERS, PUBLICS, REPONSES_VIDES,
  bilanOnboarding, erreurEtape, ligneOnboarding, lirePratique, reponsesDepuisFiche,
  type Etape, type IdLieu, type IdPublic, type ReponsesOnboarding,
} from '../lib/onboarding';
import {
  rowToSettings, ecrireCacheSettingsPraticien, hydraterSettingsPraticien,
} from '../lib/settingsPraticien';
import IllustrationHorizon from './onboarding/IllustrationHorizon';
import ApercuDocument from './onboarding/ApercuDocument';
import { CarteChoix, Champ, Puce, Saisie } from './onboarding/elements';

interface Props {
  onComplete: () => void;
}

const ICONES_METIER: Record<string, ReactNode> = {
  'Enseignant APA': <HeartPulse size={18} />,
  'Kinésithérapeute': <Hand size={18} />,
  'Éducateur sportif': <Medal size={18} />,
  'Coach sportif': <Dumbbell size={18} />,
  'Autre': <Sparkles size={18} />,
};

const ICONES_LIEU: Record<IdLieu, ReactNode> = {
  domicile: <House size={18} />,
  cabinet: <Building2 size={18} />,
  structure: <Hospital size={18} />,
  collectif: <Users size={18} />,
};

// Ce que chaque question apporte, montré à gauche sur ordinateur.
const APPORTS: Record<Etape, { titre: string; apport: string }> = {
  vous:        { titre: 'Vous',              apport: 'Vos documents à votre nom' },
  pratique:    { titre: 'Votre pratique',    apport: 'Des outils adaptés à vos publics' },
  coordonnees: { titre: 'Vos coordonnées',   apport: 'Des comptes rendus prêts à remettre' },
  activite:    { titre: 'Votre activité',    apport: 'Une première facture sans rien ressaisir' },
};

const basculer = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter(x => x !== v) : [...liste, v]);

export default function OnboardingPage({ onComplete }: Props) {
  const navigate = useNavigate();
  const [r, setR] = useState<ReponsesOnboarding>(REPONSES_VIDES);
  const [etape, setEtape] = useState<number>(0);
  const [termine, setTermine] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [existant, setExistant] = useState<Record<string, unknown> | null>(null);
  const [erreur, setErreur] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const maj = <K extends keyof ReponsesOnboarding>(k: K, v: ReponsesOnboarding[K]) => {
    setR(prev => ({ ...prev, [k]: v }));
    setErreur('');
  };

  // Un praticien invité peut avoir une fiche déjà partiellement remplie :
  // on la reprend plutôt que de lui faire tout ressaisir.
  useEffect(() => {
    if (!supabase) return;
    utilisateurCourant().then(user => {
      if (!user) return;
      setEmail(user.email ?? null);
      lirePraticien(user.id, '*').then(({ data }: { data: Record<string, unknown> | null }) => {
        if (!data) return;
        setExistant(data);
        setR(reponsesDepuisFiche(data, lirePratique((data.demarrage as Record<string, unknown> | undefined)?.pratique)));
      });
    });
  }, []);

  const idEtape = ETAPES[etape];
  const premierPrenom = r.prenom.trim().split(/\s+/)[0] ?? '';
  const bilan = useMemo(() => bilanOnboarding(r), [r]);
  const metierChoisi = (METIERS as readonly string[]).includes(r.titre) ? r.titre : (r.titre ? 'Autre' : '');

  const suivant = async (e?: FormEvent) => {
    e?.preventDefault();
    const probleme = erreurEtape(idEtape, r);
    if (probleme) { setErreur(probleme); return; }
    setErreur('');
    if (etape < ETAPES.length - 1) { setEtape(etape + 1); return; }
    await enregistrer();
  };

  const precedent = () => { setErreur(''); setEtape(Math.max(0, etape - 1)); };

  const enregistrer = async () => {
    if (!supabase) { setTermine(true); return; }
    setEnregistrement(true);
    const user = await utilisateurCourant();
    if (!user) { onComplete(); navigate('/'); return; }

    const ligne = ligneOnboarding(r, { id: user.id, email: user.email ?? null, existant });
    // Lieux et publics : rangés avec l'état du guide (voir src/lib/onboarding.ts).
    // Seulement si la colonne est là (lue juste avant) ou si la fiche n'existe pas
    // encore : la migration du 19/11 est appliquée partout, mais une base en retard
    // refuserait toute la ligne pour une information facultative.
    if ((r.lieux.length > 0 || r.publics.length > 0) && (!existant || 'demarrage' in existant)) {
      ligne.demarrage = { ...lireEtatDemarrage(existant?.demarrage), pratique: { lieux: r.lieux, publics: r.publics } };
    }

    const { data, error } = await enregistrerPraticien(ligne);
    if (error) {
      console.error('[Onboarding] Erreur upsert praticiens:', error);
      setErreur(error.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
      setEnregistrement(false);
      return;
    }
    // Cache COMPLET (ligne renvoyée par la base), jamais partiel : voir
    // l'historique dans settingsPraticien.ts (contrat sans adresse, 2026).
    if (data) ecrireCacheSettingsPraticien(rowToSettings(data as Record<string, unknown>));
    else await hydraterSettingsPraticien();
    setEnregistrement(false);
    setTermine(true);
  };

  const entrer = () => { onComplete(); navigate('/'); };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F6FAF8] font-sans text-ink">
      <style>{`
        @keyframes ob-entree { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .ob-entree { animation: ob-entree .45s cubic-bezier(.2,.7,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .ob-entree { animation: none } }
      `}</style>

      <div className="flex min-h-full flex-col lg:flex-row">
        {/* ── Panneau d'accueil (ordinateur) ─────────────────────────── */}
        <aside className="relative hidden overflow-hidden bg-gradient-to-b from-[#0F3D36] via-[#12564A] to-[#0E4A40] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[42%] lg:max-w-[560px] lg:flex-col">
          <div className="relative z-10 px-10 pt-9">
            <img src="/LOGO_noir_pour_login.png" alt="Horizon" className="h-7 w-auto brightness-0 invert" />
            <h1 className="mt-10 text-[30px] font-extrabold leading-tight tracking-tight">
              {premierPrenom ? <>Ravi de vous rencontrer,<br />{premierPrenom}.</> : <>Bienvenue sur Horizon.</>}
            </h1>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/70">
              Quatre questions, deux minutes. Ensuite, Horizon connaît votre façon de travailler et vous n'aurez plus à ressaisir ces informations.
            </p>

            <ol className="mt-8 space-y-3.5">
              {ETAPES.map((id, i) => {
                const fait = termine || i < etape;
                const actif = !termine && i === etape;
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition
                      ${fait ? 'bg-teal text-white' : actif ? 'bg-white text-[#0F3D36]' : 'border border-white/25 text-white/50'}`}>
                      {fait ? <Check size={14} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${actif || fait ? 'text-white' : 'text-white/55'}`}>{APPORTS[id].titre}</span>
                      <span className="block text-xs text-white/50">{APPORTS[id].apport}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <IllustrationHorizon className="pointer-events-none absolute inset-x-0 bottom-0 block w-full" />
          <div className="relative z-10 mt-auto px-10 pb-12 pt-6">
            <div className="max-w-[300px] -rotate-[1.5deg]">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Aperçu de vos documents
              </div>
              <ApercuDocument r={r} titre={r.titre === 'Autre' ? '' : r.titre} />
            </div>
          </div>
        </aside>

        {/* ── Questions ──────────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col">
          {/* En-tête mobile : logo et progression */}
          <div className="sticky top-0 z-10 bg-[#F6FAF8]/90 px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))] backdrop-blur lg:static lg:bg-transparent lg:px-14 lg:pt-12">
            <img src="/LOGO_noir_pour_login.png" alt="Horizon" className="h-6 w-auto lg:hidden" />
            {!termine && (
              <div className="mx-auto mt-4 max-w-[540px] lg:mt-0">
                <div className="flex gap-1.5" aria-hidden>
                  {ETAPES.map((id, i) => (
                    <div key={id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
                      <div className={`h-full rounded-full bg-teal transition-all duration-500 ${i <= etape ? 'w-full' : 'w-0'}`} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs font-medium text-ink-2">Question {etape + 1} sur {ETAPES.length}</div>
              </div>
            )}
          </div>

          <div className="flex flex-1 justify-center px-5 pb-36 pt-4 lg:items-center lg:px-14 lg:pb-16">
            <div className="w-full max-w-[540px]">
              {termine ? (
                <Fin prenom={premierPrenom} r={r} bilan={bilan} onEntrer={entrer} />
              ) : (
                <form onSubmit={suivant} noValidate>
                  <div key={idEtape} className="ob-entree">
                  {idEtape === 'vous' && (
                    <>
                    <BandeauMobile titre="Bienvenue sur Horizon"
                      texte="Quatre questions, deux minutes. Ensuite, vous n'aurez plus à ressaisir ces informations." />
                    <Question surtitre="Faisons connaissance" titre={"Comment vous appelez-vous\u00A0?"}
                      texte="Votre nom figurera sur les bilans, comptes rendus et contrats que vous remettez.">
                      <div className="grid grid-cols-2 gap-3">
                        <Champ libelle="Prénom" requis>
                          <Saisie value={r.prenom} onChange={e => maj('prenom', e.target.value)} autoComplete="given-name" autoFocus placeholder="Marie" data-testid="onboarding-prenom" />
                        </Champ>
                        <Champ libelle="Nom" requis>
                          <Saisie value={r.nom} onChange={e => maj('nom', e.target.value)} autoComplete="family-name" placeholder="Durand" data-testid="onboarding-nom" />
                        </Champ>
                      </div>
                      <div className="mt-6 mb-2 text-[13px] font-semibold">Votre métier<span className="ml-0.5 text-teal-dark">*</span></div>
                      <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
                        {METIERS.map(m => (
                          <CarteChoix key={m} titre={m} icone={ICONES_METIER[m]} choisi={metierChoisi === m}
                            testid={`onboarding-metier-${m}`} onClick={() => maj('titre', m)} />
                        ))}
                      </div>
                      {metierChoisi === 'Autre' && (
                        <div className="mt-3 ob-entree">
                          <Champ libelle="Lequel ?" aide="Tel qu'il apparaîtra sous votre nom.">
                            <Saisie value={r.titre === 'Autre' ? '' : r.titre} autoFocus placeholder="Ex : Psychomotricien·ne"
                              onChange={e => maj('titre', e.target.value.trim() ? e.target.value : 'Autre')} />
                          </Champ>
                        </div>
                      )}
                    </Question>
                    </>
                  )}

                  {idEtape === 'pratique' && (
                    <Question surtitre="Votre pratique" titre={premierPrenom ? `Où intervenez-vous, ${premierPrenom}\u00A0?` : 'Où intervenez-vous\u00A0?'}
                      texte="Plusieurs réponses possibles. Horizon s'en sert pour vous proposer les bons outils, et vous pourrez changer d'avis.">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {LIEUX.map(l => (
                          <CarteChoix key={l.id} multiple titre={l.libelle} aide={l.aide} icone={ICONES_LIEU[l.id]}
                            choisi={r.lieux.includes(l.id)} onClick={() => maj('lieux', basculer<IdLieu>(r.lieux, l.id))} />
                        ))}
                      </div>
                      <div className="mt-7 mb-2.5 text-[13px] font-semibold">Les personnes que vous accompagnez</div>
                      <div className="flex flex-wrap gap-2">
                        {PUBLICS.map(p => (
                          <Puce key={p.id} choisie={r.publics.includes(p.id)}
                            onClick={() => maj('publics', basculer<IdPublic>(r.publics, p.id))}>{p.libelle}</Puce>
                        ))}
                      </div>
                    </Question>
                  )}

                  {idEtape === 'coordonnees' && (
                    <Question surtitre="Vos coordonnées" titre={"Où peut-on vous joindre\u00A0?"}
                      texte="Elles s'impriment en tête de vos documents : bénéficiaires, médecins et structures sauront vous recontacter.">
                      <div className="space-y-4">
                        {email && (
                          <div className="flex items-center gap-2.5 rounded-md bg-teal-light/60 px-4 py-3 text-sm text-ink">
                            <Mail size={16} className="shrink-0 text-teal-dark" />
                            <span className="min-w-0 truncate">{email}</span>
                            <span className="ml-auto shrink-0 text-xs text-ink-2">votre e-mail de connexion</span>
                          </div>
                        )}
                        <Champ libelle="Téléphone professionnel">
                          <Saisie icone={<Phone size={16} />} type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78"
                            value={r.telephone} onChange={e => maj('telephone', e.target.value)} />
                        </Champ>
                        <Champ libelle="Adresse professionnelle" aide="Celle de votre cabinet, ou votre adresse de domiciliation si vous exercez à domicile.">
                          <Saisie icone={<MapPin size={16} />} autoComplete="address-line1" placeholder="12 rue des Tilleuls"
                            value={r.adresseRue} onChange={e => maj('adresseRue', e.target.value)} />
                        </Champ>
                        <div className="grid grid-cols-[120px_1fr] gap-3">
                          <Champ libelle="Code postal">
                            <Saisie inputMode="numeric" autoComplete="postal-code" placeholder="69003" maxLength={5}
                              value={r.adresseCodePostal} onChange={e => maj('adresseCodePostal', e.target.value.replace(/\D/g, ''))} />
                          </Champ>
                          <Champ libelle="Ville">
                            <Saisie autoComplete="address-level2" placeholder="Lyon"
                              value={r.adresseVille} onChange={e => maj('adresseVille', e.target.value)} />
                          </Champ>
                        </div>
                      </div>
                    </Question>
                  )}

                  {idEtape === 'activite' && (
                    <Question surtitre="Votre activité" titre={"Comment exercez-vous\u00A0?"}
                      texte="De quoi préparer vos contrats et vos factures. Vous retrouverez tout dans Paramètres.">
                      <div role="radiogroup" className="grid gap-2.5">
                        <CarteChoix titre="À mon compte" aide="Entrepreneur individuel, micro-entrepreneur" icone={<Briefcase size={18} />}
                          testid="onboarding-statut-ei" choisi={r.statut === 'ei'} onClick={() => maj('statut', 'ei')} />
                        <CarteChoix titre="En société" aide="SARL, SAS, EURL…" icone={<Building2 size={18} />}
                          testid="onboarding-statut-societe" choisi={r.statut === 'societe'} onClick={() => maj('statut', 'societe')} />
                        <CarteChoix titre="Salarié·e d'une structure" aide="Pas de SIRET personnel, pas de facture à émettre" icone={<Users size={18} />}
                          testid="onboarding-statut-salarie" choisi={r.statut === 'salarie'} onClick={() => maj('statut', 'salarie')} />
                      </div>

                      {(r.statut === 'ei' || r.statut === 'societe') && (
                        <div className="mt-6 space-y-4 ob-entree">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Champ libelle="Numéro SIRET" requis aide="14 chiffres, sur votre avis de situation INSEE.">
                              <Saisie inputMode="numeric" placeholder="123 456 789 00012" value={r.siret}
                                onChange={e => maj('siret', e.target.value)} data-testid="onboarding-siret" />
                            </Champ>
                            <Champ libelle={r.statut === 'societe' ? 'Nom de la société' : 'Nom commercial'} aide="Facultatif.">
                              <Saisie placeholder="Ex : Activ'Forme" value={r.societe} onChange={e => maj('societe', e.target.value)} />
                            </Champ>
                          </div>

                          <div>
                            <div className="mb-2 text-[13px] font-semibold">TVA</div>
                            <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
                              <CarteChoix titre="Je ne facture pas la TVA" aide="Franchise en base (art. 293 B du CGI), le cas de la plupart des micro-entrepreneurs"
                                choisi={r.tva === 'franchise_293B'} onClick={() => maj('tva', 'franchise_293B')} />
                              <CarteChoix titre="Je facture la TVA" aide="Vous choisirez le taux dans « Profil de facturation »"
                                choisi={r.tva === 'a_voir'} onClick={() => maj('tva', 'a_voir')} />
                            </div>
                          </div>

                          <div className={`grid gap-3 ${r.lieux.includes('domicile') ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                            <Champ libelle="Tarif d'une séance d'1 h" aide="Proposé par défaut, modifiable à chaque contrat.">
                              <div className="relative">
                                <Saisie inputMode="decimal" value={r.tarifHoraire} onChange={e => maj('tarifHoraire', e.target.value)} />
                                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-2">€</span>
                              </div>
                            </Champ>
                            {r.lieux.includes('domicile') && (
                              <Champ libelle="Frais kilométriques" aide="Par km, 0 si vous n'en facturez pas.">
                                <div className="relative">
                                  <Saisie inputMode="decimal" value={r.fraisKm} onChange={e => maj('fraisKm', e.target.value)} />
                                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-2">€/km</span>
                                </div>
                              </Champ>
                            )}
                          </div>
                        </div>
                      )}

                      {r.statut === 'salarie' && (
                        <p className="mt-5 rounded-md bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2 ob-entree">
                          Parfait, vous n'émettez ni contrat de prestation ni facture : nous n'avons besoin de rien d'autre.
                        </p>
                      )}
                    </Question>
                  )}

                  </div>

                  {erreur && (
                    <div role="alert" className="mt-5 rounded-md border border-red/20 bg-red-light px-4 py-3 text-sm text-[#B4372E]">{erreur}</div>
                  )}

                  {/* Actions : collées en bas sur téléphone, sous le formulaire sur ordinateur */}
                  <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0">
                    <div className="mx-auto flex max-w-[540px] items-center gap-3">
                      {etape > 0 && (
                        <button type="button" onClick={precedent} aria-label="Question précédente"
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-ink-2 transition hover:text-ink">
                          <ArrowLeft size={18} />
                        </button>
                      )}
                      {(idEtape === 'pratique' || idEtape === 'coordonnees') && (
                        <button type="button" onClick={() => { setErreur(''); setEtape(etape + 1); }}
                          className="h-12 shrink-0 px-3 text-sm font-semibold text-ink-2 transition hover:text-ink">
                          Plus tard
                        </button>
                      )}
                      <button type="submit" disabled={enregistrement} data-testid="onboarding-suivant"
                        className="ml-auto flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-teal px-6 text-[15px] font-bold text-white shadow-teal transition hover:bg-teal-dark disabled:opacity-70 lg:flex-none lg:min-w-[200px]">
                        {enregistrement
                          ? <><LoaderCircle size={18} className="animate-spin" /> Enregistrement…</>
                          : <>{etape === ETAPES.length - 1 ? 'Terminer' : 'Continuer'} <ArrowRight size={18} /></>}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Lever de soleil sur téléphone, où le panneau d'accueil n'a pas la place. */
function BandeauMobile({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="mb-7 overflow-hidden rounded-xl bg-gradient-to-b from-[#0F3D36] to-[#12564A] text-white lg:hidden">
      <div className="relative z-10 px-5 pt-5">
        <div className="text-xl font-extrabold tracking-tight">{titre}</div>
        <p className="mt-1 text-sm leading-relaxed text-white/70">{texte}</p>
      </div>
      <div className="relative -mt-2 h-28"><IllustrationHorizon oiseaux={false} className="absolute inset-x-0 bottom-0 block w-full" /></div>
    </div>
  );
}

function Question({ surtitre, titre, texte, children }: { surtitre: string; titre: string; texte: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-dark">{surtitre}</div>
      <h2 className="mt-2 text-[24px] font-extrabold leading-tight tracking-tight text-ink lg:text-[30px]">{titre}</h2>
      <p className="mt-2 mb-6 text-[15px] leading-relaxed text-ink-2">{texte}</p>
      {children}
    </div>
  );
}

function Fin({ prenom, r, bilan, onEntrer }: {
  prenom: string; r: ReponsesOnboarding; bilan: ReturnType<typeof bilanOnboarding>; onEntrer: () => void;
}) {
  const pret: { icone: ReactNode; texte: string }[] = [
    { icone: <FileText size={16} />, texte: 'Vos bilans et comptes rendus portent votre nom' },
  ];
  if (r.lieux.length > 0 || r.publics.length > 0) pret.push({ icone: <Footprints size={16} />, texte: 'Horizon connaît votre pratique' });
  if (bilan.facturationPrete) pret.push({ icone: <Receipt size={16} />, texte: 'Votre profil de facturation est complet' });
  else if (r.statut !== 'salarie') pret.push({ icone: <BadgeCheck size={16} />, texte: 'Vos contrats de prestation sont prêts' });

  return (
    <div className="ob-entree text-center lg:text-left">
      <div className="lg:hidden"><IllustrationHorizon className="-mx-5 -mt-4 mb-2 block w-[calc(100%+40px)]" /></div>
      <div className="relative mx-auto -mt-14 flex h-16 lg:mt-0 w-16 items-center justify-center rounded-full bg-teal text-white shadow-teal lg:mx-0">
        <Check size={30} strokeWidth={3} />
      </div>
      <h2 className="mt-6 text-[28px] font-extrabold leading-tight tracking-tight lg:text-[32px]">
        {prenom ? `Tout est prêt, ${prenom}.` : 'Tout est prêt.'}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        Merci d'avoir pris ces deux minutes. Votre espace vous attend, avec un guide pour vos premiers pas.
      </p>
      <ul className="mt-7 space-y-2.5 text-left">
        {pret.map(p => (
          <li key={p.texte} className="flex items-center gap-3 rounded-md bg-white px-4 py-3 text-sm font-medium shadow-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-teal-light text-teal-dark">{p.icone}</span>
            {p.texte}
          </li>
        ))}
      </ul>
      {bilan.reste.length > 0 && (
        <p className="mt-4 text-left text-[13px] leading-relaxed text-ink-2">
          Pour votre première facture, il restera {bilan.reste.join(' et ')} à indiquer dans « Profil de facturation ». Le guide vous y mènera.
        </p>
      )}
      <button type="button" onClick={onEntrer} data-testid="onboarding-entrer"
        className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-teal px-7 text-[15px] font-bold text-white shadow-teal transition hover:bg-teal-dark lg:w-auto">
        Découvrir mon espace <ArrowRight size={18} />
      </button>
    </div>
  );
}
