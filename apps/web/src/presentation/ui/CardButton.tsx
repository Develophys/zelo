import type { ButtonHTMLAttributes } from 'react';

interface CardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'md' | 'lg';
}

export function CardButton({ size = 'md', className = '', children, ...rest }: CardButtonProps) {
  const radius = size === 'lg' ? 'rounded-card-lg' : 'rounded-card';
  const padding = size === 'lg' ? 'p-[22px]' : 'p-[18px]';
  return (
    <button
      type="button"
      className={[
        radius,
        padding,
        'bg-surface text-left shadow-card',
        'hover:shadow-[0_2px_4px_rgba(33,48,43,0.12),0_18px_32px_-10px_rgba(33,48,43,0.3)] transition-shadow duration-300 ease-out',
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
