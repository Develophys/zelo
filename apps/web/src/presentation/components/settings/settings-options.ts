import type {
  HotkeysPref,
  ManagerAccent,
  ManagerCorners,
  ManagerDensity,
  ManagerFontSize,
} from '@/stores/manager-prefs.store';

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

export const HOTKEYS_OPTIONS: readonly { value: HotkeysPref; label: string }[] = [
  { value: 'on', label: 'Ativados' },
  { value: 'off', label: 'Desativados' },
];

export const FONT_SIZE_OPTIONS: readonly { value: ManagerFontSize; label: string }[] = [
  { value: 'default', label: 'Padrão' },
  { value: 'large', label: 'Grande' },
  { value: 'xlarge', label: 'Extra grande' },
];
