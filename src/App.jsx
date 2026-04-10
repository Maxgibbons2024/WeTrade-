import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Closers from './pages/Closers';
import Deals from './pages/Deals';
import PaymentPlans from './pages/PaymentPlans';
import Fathom from './pages/Fathom';
import Community from './pages/Community';
import ManualEntry from './pages/ManualEntry';

const PAGES = {
  overview: Overview,
  closers: Closers,
  deals: Deals,
  community: Community,
  payments: PaymentPlans,
  fathom: Fathom,
  entry: ManualEntry,
};

export default function App() {
  const [activePage, setActivePage] = useState('overview');
  const ActiveComponent = PAGES[activePage];

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
            fontFamily: 'Montserrat, sans-serif',
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
