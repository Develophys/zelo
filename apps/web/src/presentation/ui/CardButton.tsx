import type { ButtonHTMLAttributes } from 'react';

interface CardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'md' | 'lg';
  tone?: 'surface' | 'accent';
}

// "accent" reuses the same border-brand + bg-brand/5 pair the admin picker
// rows and manager notifications already use for "this one matters" — see
// AdminInstitutionsPage/ManagerAdminSectorsPage/ManagerNotificationsPage —
// so a tile that leads to a person doesn't sit at the same visual weight as
// a card that only reports.
const TONE_CLASS: Record<NonNullable<CardButtonProps['tone']>, string> = {
  surface: 'bg-surface shadow-card',
  accent: 'border border-brand bg-brand/5 shadow-card',
};

export function CardButton({
  size = 'md',
  tone = 'surface',
  className = '',
  children,
  ...rest
}: CardButtonProps) {
  const radius = size === 'lg' ? 'rounded-card-lg' : 'rounded-card';
  const padding = size === 'lg' ? 'p-[22px]' : 'p-[18px]';
  return (
    <button
      type="button"
      className={[
        radius,
        padding,
        TONE_CLASS[tone],
        'text-left',
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
