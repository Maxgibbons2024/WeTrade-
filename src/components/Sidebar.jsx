import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Briefcase,
  Mail,
  BarChart3,
  Globe,
  CreditCard,
  Video,
  Calculator,
  Plus,
  Menu,
  X,
} from 'lucide-react';
import { getMonthLabel } from '../lib/constants';

// Icons sourced from Lucide — consistent stroke width, optical weight, visual rhythm.
const NAV_ITEMS = [
  { id: 'overview',   label: 'Overview',        Icon: LayoutDashboard },
  { id: 'closers',    label: 'Closers',         Icon: Users },
  { id: 'setters',    label: 'Setters',         Icon: UserPlus },
  { id: 'deals',      label: 'Deals',           Icon: Briefcase },
  { id: 'sources',    label: 'Email',           Icon: Mail },
  { id: 'ads',        label: 'Ads',             Icon: BarChart3 },
  { id: 'community',  label: 'Community',       Icon: Globe },
  { id: 'payments',   label: 'Payment Plans',   Icon: CreditCard },
  { id: 'fathom',     label: 'Fathom',          Icon: Video },
  { id: 'calculator', label: 'Calculator',      Icon: Calculator },
  { id: 'entry',      label: 'Add Entry',       Icon: Plus },
];

export default function Sidebar({ activePage, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Close navigation' : 'Open navigation'}
        aria-expanded={collapsed}
        aria-controls="primary-nav"
        className="fixed top-4 left-4 z-50 md:hidden bg-brand-darker p-2 rounded-lg border border-gray-800 shadow-elev-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        {collapsed ? (
          <X className="w-5 h-5 text-brand-cyan" aria-hidden="true" />
        ) : (
          <Menu className="w-5 h-5 text-brand-cyan" aria-hidden="true" />
        )}
      </button>

      {/* Overlay for mobile */}
      {collapsed && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-fade-in" onClick={() => setCollapsed(false)} aria-hidden="true" />
      )}

      <aside
        id="primary-nav"
        aria-label="Primary"
        className={`
          fixed md:sticky top-0 left-0 z-40 h-screen
          bg-brand-darker border-r border-white/[0.04]
          flex flex-col transition-all duration-200
          ${collapsed ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          w-64
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-white/[0.04]">
          <img src="/wetrade_color_darkgrey%20bg.png" alt="WeTrade" className="h-9 w-auto" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activePage === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  onNavigate(id);
                  setCollapsed(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan
                  ${active
                    ? 'bg-brand-cyan/[0.08] text-brand-cyan shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                  }
                `}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.04]">
          <p className="text-xs text-gray-500 text-center tabular">{getMonthLabel()}</p>
        </div>
      </aside>
    </>
  );
}
