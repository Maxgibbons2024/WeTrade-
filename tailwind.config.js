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
        // Prefer `text-semantic-success` etc. over raw `text-green-400` going forward.
        semantic: {
          success: '#10B981',   // deal closed, payment succeeded, on track
          warning: '#F59E0B',   // due soon, pending, attention needed
          danger:  '#EF4444',   // overdue, failed, cancelled
          info:    '#27CCE7',   // default info (same as brand-cyan)
        },
        // Surface aliases — naming makes intent clearer than `brand-dark` vs `brand-darker`
        surface: {
          DEFAULT: '#252A2E',   // app background
          elevated: '#1a1d20',  // card background
        },
      },
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
      },
      fontSize: {
        // `text-[10px]` was used 56+ times for captions/badges — give it a name
        caption: ['10px', { lineHeight: '14px' }],
      },
    },
  },
  plugins: [],
};
