interface SectorMultiSelectProps {
  sectors: { id: string; name: string }[];
  selected: string[] | undefined; // undefined = implicitly "all"
  onChange: (selected: string[]) => void;
}

export function SectorMultiSelect({ sectors, selected, onChange }: SectorMultiSelectProps) {
  const effectiveSelected = selected ?? sectors.map((sector) => sector.id);

  const toggle = (id: string) => {
    const next = effectiveSelected.includes(id)
      ? effectiveSelected.filter((sectorId) => sectorId !== id)
      : [...effectiveSelected, id];
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-3">
      {sectors.map((sector) => (
        <label key={sector.id} className="flex items-center gap-1.5 text-label text-ink-2">
          <input type="checkbox" checked={effectiveSelected.includes(sector.id)} onChange={() => toggle(sector.id)} />
          {sector.name}
        </label>
      ))}
    </div>
  );
}
