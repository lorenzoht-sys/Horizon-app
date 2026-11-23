import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import '../index.css';
import Dashboard from '../pages/Dashboard';
import { EcranAujourdhui } from '../pages/mobile/ecrans/EcranAujourdhui';

const mobile = new URLSearchParams(location.search).has('mobile');
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <Toaster />
    {mobile ? <EcranAujourdhui onVoirFiche={() => {}} /> : (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <div style={{ width: 232, background: '#1A2332', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, background: '#EEF4F7' }}><Dashboard /></div>
      </div>
    )}
  </MemoryRouter>,
);
