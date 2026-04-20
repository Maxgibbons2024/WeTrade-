import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Closers from './pages/Closers';
import Setters from './pages/Setters';
import Deals from './pages/Deals';
import Sources from './pages/Sources';
import PaymentPlans from './pages/PaymentPlans';
import Fathom from './pages/Fathom';
import Community from './pages/Community';
import ManualEntry from './pages/ManualEntry';
import Calculator from './pages/Calculator';
import Ads from './pages/Ads';

const PAGES = {
  overview: Overview,
  closers: Closers,
  setters: Setters,
  deals: Deals,
  sources: Sources,
  ads: Ads,
  community: Community,
  payments: PaymentPlans,
  fathom: Fathom,
  calculator: Calculator,
  entry: ManualEntry,
};

const PASSCODE = 'wetrade2026';

function LoginGate({ onAuth }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code === PASSCODE) {
      sessionStorage.setItem('wetrade_auth', '1');
      onAuth();
    } else {
      setError(true);
      setCode('');
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4">
      <div className="bg-brand-darker rounded-xl border border-gray-800 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/wetrade_color_darkgrey%20bg.png" alt="WeTrade" className="h-10 mx-auto mb-4" />
          <p className="text-sm text-gray-400">Enter passcode to access the dashboard</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(false); }}
            placeholder="Passcode"
            className="w-full bg-brand-dark border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-cyan mb-3"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs mb-3">Incorrect passcode</p>}
          <button
            type="submit"
            className="w-full bg-brand-cyan text-brand-dark font-semibold rounded-lg py-3 text-sm hover:bg-brand-cyan/90 transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('wetrade_auth') === '1');
  const [activePage, setActivePage] = useState('overview');
  const ActiveComponent = PAGES[activePage];

  if (!authed) return <LoginGate onAuth={() => setAuthed(true)} />;

  return (
    <div className="flex min-h-screen bg-brand-dark">
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'toast-custom',
          style: {
            background: '#1a1d20',
            color: '#fff',
            border: '1px solid #3a3f44',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          },
          success: { iconTheme: { primary: '#27CCE7', secondary: '#fff' } },
          error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
        }}
      />
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 min-h-screen overflow-auto p-4 md:p-6 lg:p-8">
        <ActiveComponent />
      </main>
    </div>
  );
}
