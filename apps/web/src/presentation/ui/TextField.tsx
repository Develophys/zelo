import type { InputHTMLAttributes, Ref, SelectHTMLAttributes } from 'react';

export const FIELD_SURFACE =
  'w-full rounded-control border border-control-edge bg-surface p-[13px_18px] text-[16px] text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ className = '', ...rest }: TextFieldProps) {
  return <input className={`${FIELD_SURFACE} ${className}`} {...rest} />;
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({ className = '', ...rest }: SelectFieldProps) {
  return <select className={`${FIELD_SURFACE} ${className}`} {...rest} />;
}
