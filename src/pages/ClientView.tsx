import { useParams } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import ClientDashboard from '../components/client/ClientDashboard';
import { Activity } from 'lucide-react';

export default function ClientView() {
  const { token } = useParams<{ token: string }>();
  const { getByToken } = useParticipants();

  const participant = token ? getByToken(token) : null;

  if (!participant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-light to-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="bg-dark w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Activity size={28} className="text-secondary" />
          </div>
          <h1 className="font-heading font-bold text-dark text-xl mb-2">Lien invalide</h1>
          <p className="text-gray-500 text-sm">Ce lien de partage n'est pas valide ou a expiré.</p>
        </div>
      </div>
    );
  }

  return <ClientDashboard participant={participant} />;
}
