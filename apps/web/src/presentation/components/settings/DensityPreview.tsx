const PREVIEW_ROWS: readonly [string, string][] = [
  ['w-14', 'w-8'],
  ['w-10', 'w-12'],
  ['w-16', 'w-6'],
  ['w-12', 'w-10'],
  ['w-9', 'w-14'],
  ['w-16', 'w-8'],
];

function Bar({ width, tone = 'bg-line' }: { width: string; tone?: string }) {
  return <span className={`block h-2 rounded-pill ${tone} ${width}`} />;
}

/**
 * The frame is a fixed height and the rows are measured with the same
 * px-cell-x/py-cell-y the real tables use, so tightening the density does not
 * resize the sample — it fits more of the table inside the same box, which is
 * what choosing a density actually buys.
 */
export function DensityPreview() {
  return (
    <div
      data-testid="density-preview"
      aria-hidden="true"
      className="h-36 overflow-hidden rounded-card border border-line bg-surface"
    >
      <div
        data-testid="density-preview-row"
        className="flex items-center gap-3 border-b border-line bg-canvas px-cell-x py-cell-y"
      >
        <Bar width="w-12" tone="bg-muted-2/40" />
        <Bar width="w-8" tone="bg-muted-2/40" />
      </div>
      {PREVIEW_ROWS.map(([first, second], index) => (
        <div
          key={index}
          data-testid="density-preview-row"
          className="flex items-center gap-3 border-b border-line px-cell-x py-cell-y"
        >
          <Bar width={first} />
          <Bar width={second} />
        </div>
      ))}
    </div>
  );
}
