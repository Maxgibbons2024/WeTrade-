import { useEffect, useId, useRef } from 'react';

/**
 * SlideOver — right-side modal drawer for details and forms.
 *
 * Accessibility improvements over the original:
 * - role="dialog" + aria-modal + aria-labelledby pointing to the heading
 * - Escape key closes the panel
 * - Body scroll is locked while open
 * - First interactive element receives focus on open; focus returns to the
 *   previously-focused element on close
 * - Backdrop gets aria-hidden so SR doesn't announce it
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} title
 * @param {React.ReactNode} children
 */
export default function SlideOver({ open, onClose, title, children }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Lock body scroll + handle ESC + focus management
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Move focus into the panel — first focusable element, or the panel itself
    const panel = panelRef.current;
    if (panel) {
      const firstFocusable = panel.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable || panel).focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the element that opened the drawer
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-brand-darker h-full overflow-y-auto shadow-xl border-l border-gray-800 focus:outline-none"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-800 sticky top-0 bg-brand-darker z-10">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
