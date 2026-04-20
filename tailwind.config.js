/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: '#27CCE7',      // primary accent / focus
          dark: '#252A2E',      // app background
          darker: '#1a1d20',    // card / surface background (elevated look on dark bg)
          mid: '#0A80A7',       // deep cyan variant (underused)
        },
        // Semantic status colours — single source of truth for success/warning/danger/info
        semantic: {
          success: '#10B981',
          warning: '#F59E0B',
          danger:  '#EF4444',
          info:    '#27CCE7',
        },
        surface: {
          DEFAULT: '#252A2E',
          elevated: '#1a1d20',
        },
      },
      fontFamily: {
        // Inter is the premium-dashboard default (Linear, Vercel, Stripe, etc.)
        // `sans` is what the body class uses by default now — no need for `font-montserrat` anymore.
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Legacy alias — kept so existing `font-montserrat` usages don't break, but maps to Inter.
        montserrat: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      fontSize: {
        caption: ['10px', { lineHeight: '14px' }],
      },
      boxShadow: {
        // Soft elevation replaces heavy borders for that premium depth feel.
        // Dark-theme tuned: stronger opacity since light bg would wash them out.
        'elev-1': '0 1px 2px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)',
        'elev-2': '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
        'elev-3': '0 12px 32px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.35)',
        'elev-4': '0 24px 64px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 200ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
};
