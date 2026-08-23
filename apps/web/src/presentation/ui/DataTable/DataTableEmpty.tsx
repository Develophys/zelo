interface DataTableEmptyProps {
  title: string;
  hint: string;
}

export function DataTableEmpty({ title, hint }: DataTableEmptyProps) {
  return (
    <div className="px-cell-x py-10 text-center">
      <p className="text-body text-ink">{title}</p>
      <p className="mt-1 text-label text-muted">{hint}</p>
    </div>
  );
}
