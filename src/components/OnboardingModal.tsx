import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

interface PraticienSettings {
  prenom: string;
  nom: string;
  titre: string;
  siret: string;
  email: string;
}

interface Props {
  onClose: () => void;
}

function Dots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${n === current ? 'bg-primary' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
}

export default function OnboardingModal({ onClose }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PraticienSettings>({
    prenom: '',
    nom: '',
    titre: 'Enseignant en APA',
    siret: '',
    email: '',
  });
  const navigate = useNavigate();

  function complete(openAddParticipant = false) {
    localStorage.setItem('settings_praticien', JSON.stringify(form));
    localStorage.setItem('onboarding_complete', 'true');
    onClose();
    if (openAddParticipant) {
      navigate('/', { state: { openNewParticipant: true } });
    }
  }

  function skip() {
    localStorage.setItem('onboarding_complete', 'true');
    onClose();
  }

  const isStep2Valid =
    form.prenom.trim() &&
    form.nom.trim() &&
    form.titre.trim() &&
    form.siret.trim() &&
    form.email.trim();

  const inputClass =
    'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative">

        {/* Bouton passer / fermer */}
        <button
          onClick={skip}
          className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors"
          aria-label="Passer"
        >
          <X size={20} />
        </button>

        {/* Étape 1 — Bienvenue */}
        {step === 1 && (
          <div className="p-8 text-center">
            <img src="/logo.png" alt="Rehabit" className="h-12 mx-auto mb-6 object-contain" />
            <h1 className="font-heading font-bold text-2xl text-dark mb-2">
              Bienvenue sur Rehabit, Pierre ! 👋
            </h1>
            <p className="text-gray-500 mb-1">Votre outil de suivi patient professionnel est prêt.</p>
            <p className="text-gray-500 mb-8">En 3 étapes rapides, configurons votre espace de travail.</p>
            <Dots current={1} />
            <button
              onClick={() => setStep(2)}
              className="mt-6 w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-dark transition-colors"
            >
              Commencer →
            </button>
          </div>
        )}

        {/* Étape 2 — Profil professionnel */}
        {step === 2 && (
          <div className="p-8">
            <h2 className="font-heading font-bold text-xl text-dark mb-1">⚙️ Votre profil professionnel</h2>
            <p className="text-gray-500 text-sm mb-6">Ces infos apparaîtront sur tous vos documents générés.</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Prénom *</label>
                <input
                  value={form.prenom}
                  onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                  className={inputClass}
                  placeholder="Pierre"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nom *</label>
                <input
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className={inputClass}
                  placeholder="Dupont"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Titre *</label>
              <input
                value={form.titre}
                onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                className={inputClass}
                placeholder="Enseignant en APA"
              />
            </div>

            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600 mb-1 block">SIRET *</label>
              <input
                value={form.siret}
                onChange={e => setForm(f => ({ ...f, siret: e.target.value }))}
                className={inputClass}
                placeholder="123 456 789 00012"
              />
            </div>

            <div className="mb-6">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Email professionnel *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className={inputClass}
                placeholder="pierre@exemple.fr"
              />
            </div>

            <Dots current={2} />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                ← Retour
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!isStep2Valid}
                className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continuer →
              </button>
            </div>
          </div>
        )}

        {/* Étape 3 — Prêt ! */}
        {step === 3 && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="font-heading font-bold text-2xl text-dark mb-6">
              Tout est prêt, Pierre !
            </h2>
            <p className="text-gray-500 text-sm mb-3 text-left">Voici ce que vous pouvez faire maintenant :</p>
            <ul className="text-left space-y-2 mb-6">
              <li className="text-sm text-gray-700">👤 Ajouter votre premier patient</li>
              <li className="text-sm text-gray-700">📋 Saisir un bilan initial</li>
              <li className="text-sm text-gray-700">🏋️ Créer un programme d'exercices</li>
              <li className="text-sm text-gray-700">📄 Générer un PDF professionnel</li>
            </ul>
            <Dots current={3} />
            <button
              onClick={() => complete(true)}
              className="mt-6 w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-dark transition-colors"
            >
              Ajouter mon premier patient →
            </button>
            <button
              onClick={() => complete(false)}
              className="mt-3 w-full text-gray-400 py-2 text-sm hover:text-gray-600 transition-colors"
            >
              Passer cette étape
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
