import type { ManagerAccent, ManagerCorners, ManagerDensity } from '@/stores/manager-prefs.store';

export const ACCENT_LABEL: Record<ManagerAccent, string> = {
  sage: 'Sage',
  teal: 'Teal',
  indigo: 'Índigo',
  clay: 'Argila',
};

export const DENSITY_OPTIONS: readonly { value: ManagerDensity; label: string }[] = [
  { value: 'comfortable', label: 'Confortável' },
  { value: 'compact', label: 'Compacta' },
];

export const CORNERS_OPTIONS: readonly { value: ManagerCorners; label: string }[] = [
  { value: 'sharp', label: 'Retos' },
  { value: 'rounded', label: 'Arredondados' },
];
