import type { ReactNode } from 'react';
import { Pill, type PillTone } from '@/presentation/ui/Pill';

export interface DataTableMobileCardField {
  label: string;
  value: ReactNode;
  /** Long unbroken values (an email) have to wrap mid-word or they overflow. */
  breakAll?: boolean;
}

interface DataTableMobileCardProps {
  /**
   * Accessible name for the select toggle. Caller-supplied because the pages
   * word it differently — the institutions table lowercases its status.
   */
  label: string;
  /** Rendered in order; the first is the card's headline and reads bolder. */
  fields: DataTableMobileCardField[];
  status: { tone: PillTone; text: string };
  selected: boolean;
  onToggle(): void;
  /** Row actions, rendered below the toggle — never inside it, or every action click would also select the row. */
  actions: ReactNode;
}

/** The phone-width stand-in for a table row, shared by the admin tables. */
export function DataTableMobileCard({
  label,
  fields,
  status,
  selected,
  onToggle,
  actions,
}: DataTableMobileCardProps) {
  return (
    <li
      className={`overflow-hidden rounded-card border ${
        selected ? 'border-brand bg-brand/5' : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onToggle}
        className="flex w-full flex-col gap-2 rounded-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
      >
        {fields.map((field, index) => (
          <div key={field.label} className="flex justify-between gap-3">
            <span className="text-caption text-muted">{field.label}</span>
            <span
              className={`text-label text-ink ${index === 0 ? 'font-semibold' : ''} ${
                field.breakAll ? 'break-all' : ''
              }`}
            >
              {field.value}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-muted">Status</span>
          <Pill tone={status.tone}>{status.text}</Pill>
        </div>
      </button>
      <div className="flex items-center justify-end gap-1 border-t border-line px-4 py-2">{actions}</div>
    </li>
  );
}
