import { getCloser } from '../lib/constants';

export default function CloserAvatar({ closerId, size = 'md' }) {
  const closer = getCloser(closerId);
  const sizes = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: closer.color }}
      title={closer.name}
    >
      {closer.initials}
    </div>
  );
}
