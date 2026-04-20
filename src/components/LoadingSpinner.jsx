/**
 * LoadingSpinner — centered spinner with screen-reader announcement.
 *
 * @param {object} props
 * @param {string} [props.label='Loading…']
 *   Visually hidden text announced to assistive tech. Default suits most pages.
 */
export default function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center py-12"
    >
      <div
        className="w-8 h-8 border-2 border-brand-cyan/30 border-t-brand-cyan rounded-full animate-spin"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
