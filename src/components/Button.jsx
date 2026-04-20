/**
 * Button — consistent button primitive for the dashboard.
 *
 * Replaces the ad-hoc button styling that appeared all over the app with
 * inconsistent padding, focus states, and hover colours.
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary']
 *   primary: brand cyan (default CTA)
 *   secondary: dark surface with border (supporting actions)
 *   danger: red tint (destructive actions)
 *   ghost: transparent with hover (tertiary / cancel)
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.loading=false] — shows a spinner and disables interaction
 * @param {boolean} [props.fullWidth=false]
 * @param {React.ReactNode} [props.leftIcon]
 * @param {React.ReactNode} [props.rightIcon]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 * All other props (onClick, disabled, type, aria-*) are forwarded to the <button>.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  children,
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClass = {
    primary:   'bg-brand-cyan text-white hover:bg-brand-mid',
    secondary: 'bg-brand-darker text-gray-200 border border-gray-700 hover:border-brand-cyan hover:text-white',
    danger:    'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20',
    ghost:     'bg-transparent text-gray-400 hover:text-white hover:bg-white/5',
  }[variant];

  const sizeClass = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }[size];

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      type={rest.type || 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[base, variantClass, sizeClass, widthClass, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? (
        <svg
          className="w-4 h-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path
            d="M12 2a10 10 0 0110 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
}
