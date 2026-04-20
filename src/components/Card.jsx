/**
 * Card — the dashboard's primary container surface.
 *
 * Replaces the `bg-brand-darker rounded-xl border border-gray-800 p-5` pattern
 * that appeared 30+ times across pages.
 *
 * @param {object} props
 * @param {'sm'|'md'|'lg'|'xl'|'xxl'|'none'} [props.padding='lg']
 *   Padding preset → sm: p-3, md: p-4, lg: p-5 (default), xl: p-6, xxl: p-8.
 *   Use 'none' when you need custom spacing.
 * @param {'danger'|'success'|'warning'|'accent'} [props.accent]
 *   Coloured border to signal intent (red/green/amber/cyan). Default is neutral gray.
 * @param {boolean} [props.interactive=false]
 *   Adds cursor-pointer + hover border affordance. Pair with `onClick`.
 * @param {string} [props.as='div']   — element tag (e.g. 'form', 'section')
 * @param {string} [props.className]  — extra classes appended at the end (wins on conflict)
 * @param {React.ReactNode} props.children
 */
export default function Card({
  children,
  padding = 'lg',
  accent,
  interactive = false,
  as: Tag = 'div',
  className = '',
  ...rest
}) {
  const padClass = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
    xl: 'p-6',
    xxl: 'p-8',
  }[padding] ?? 'p-5';

  const borderClass = {
    danger:  'border-red-500/20',
    success: 'border-green-500/20',
    warning: 'border-amber-500/20',
    accent:  'border-brand-cyan/40',
  }[accent] ?? 'border-gray-800';

  const interactiveClass = interactive
    ? 'cursor-pointer transition-colors hover:border-gray-700'
    : '';

  return (
    <Tag
      className={[
        'bg-brand-darker rounded-xl border',
        borderClass,
        padClass,
        interactiveClass,
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
