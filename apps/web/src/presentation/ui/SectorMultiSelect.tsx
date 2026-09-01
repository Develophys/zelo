import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FIELD_SURFACE } from './TextField';
import { Checkbox } from './Checkbox';

interface SectorMultiSelectProps {
  sectors: { id: string; name: string }[];
  selected: string[] | undefined; // undefined = implicitly "all"
  onChange: (selected: string[]) => void;
}

function triggerLabel(sectors: { id: string; name: string }[], effectiveSelected: string[]): string {
  if (effectiveSelected.length === sectors.length) return 'Todos os setores';
  if (effectiveSelected.length === 1) {
    return sectors.find((sector) => sector.id === effectiveSelected[0])?.name ?? 'Todos os setores';
  }
  return `${effectiveSelected.length} setores selecionados`;
}

export function SectorMultiSelect({ sectors, selected, onChange }: SectorMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const effectiveSelected = selected ?? sectors.map((sector) => sector.id);
  const allSelected = effectiveSelected.length === sectors.length;

  const toggle = (id: string) => {
    const next = effectiveSelected.includes(id)
      ? effectiveSelected.filter((sectorId) => sectorId !== id)
      : [...effectiveSelected, id];
    // Unchecking the last one filters everything away, which can only draw an
    // empty screen. Falling back to all keeps the control from having a dead
    // end the manager has to guess their way out of.
    onChange(next.length === 0 ? sectors.map((sector) => sector.id) : next);
  };

  const selectAll = () => onChange(sectors.map((sector) => sector.id));

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`${FIELD_SURFACE} flex min-h-11 items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{triggerLabel(sectors, effectiveSelected)}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`flex-none text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Setores"
          className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-control border border-line bg-surface p-2 shadow-lift"
        >
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-2 text-label font-semibold text-ink-2 hover:bg-canvas">
            <Checkbox checked={allSelected} onChange={() => { if (!allSelected) selectAll(); }} />
            Todos
          </label>
          <div className="my-1 border-t border-line" />
          {sectors.map((sector) => (
            <label
              key={sector.id}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-2 text-label text-ink-2 hover:bg-canvas"
            >
              <Checkbox checked={effectiveSelected.includes(sector.id)} onChange={() => toggle(sector.id)} />
              {sector.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
