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
        'hover:shadow-lift transition-shadow duration-300 ease-out',
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
