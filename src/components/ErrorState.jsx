/**
 * ErrorState — inline error placeholder for page-level failures.
 *
 * @param {object} props
 * @param {string} [props.message='Something went wrong']  Primary error message
 * @param {string} [props.hint='Check your Supabase connection and try again.']
 *   Secondary guidance. Override for non-Supabase contexts.
 * @param {() => void} [props.onRetry]
 *   If provided, renders a "Try again" button.
 */
export default function ErrorState({
  message = 'Something went wrong',
  hint = 'Check your Supabase connection and try again.',
  onRetry,
}) {
  return (
    <div role="alert" aria-live="assertive" className="flex items-center justify-center py-12">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md text-center">
        <svg
          className="w-8 h-8 text-red-400 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-red-400 text-sm font-medium">{message}</p>
        {hint && <p className="text-gray-500 text-xs mt-1">{hint}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
