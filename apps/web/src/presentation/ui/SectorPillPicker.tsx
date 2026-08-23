import { Link } from 'react-router';

interface SectorPillPickerProps {
  sectors: { id: string; name: string }[];
  selectedIds: string[];
  onToggle(id: string): void;
  emptyHref: string;
  emptyLabel: string;
}

export function SectorPillPicker({
  sectors,
  selectedIds,
  onToggle,
  emptyHref,
  emptyLabel,
}: SectorPillPickerProps) {
  if (sectors.length === 0) {
    return (
      <p className="text-label text-muted">
        Nenhum setor cadastrado ainda.{' '}
        <Link to={emptyHref} className="font-semibold text-brand underline">
          {emptyLabel}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sectors.map((sector) => {
        const selected = selectedIds.includes(sector.id);
        return (
          <button
            key={sector.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(sector.id)}
            className={`min-h-11 cursor-pointer rounded-status border px-3 py-1.5 font-sans text-label font-semibold whitespace-nowrap motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
              selected
                ? 'border-brand bg-brand text-on-fill'
                : 'border-line bg-surface text-ink hover:bg-canvas'
            }`}
          >
            {sector.name}
          </button>
        );
      })}
    </div>
  );
}
