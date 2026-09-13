import { Download } from 'lucide-react';
import { SettingsRow } from './SettingsRow';

interface GuideDownloadsRowProps {
  pocketHref: string;
  completeHref: string;
}

const LINK_CLASS =
  'flex items-center gap-3 rounded-control border border-line bg-surface px-4 py-3 text-label font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function GuideDownloadsRow({ pocketHref, completeHref }: GuideDownloadsRowProps) {
  return (
    <SettingsRow
      title="Guias em PDF"
      description="O de bolso cobre o essencial em poucas páginas; o completo aprofunda os pontos mais complexos. Ficam salvos no aparelho, então funcionam mesmo sem internet."
    >
      <div className="flex flex-col gap-2">
        <a href={pocketHref} download className={LINK_CLASS}>
          <Download size={18} aria-hidden="true" />
          Guia de bolso (PDF)
        </a>
        <a href={completeHref} download className={LINK_CLASS}>
          <Download size={18} aria-hidden="true" />
          Guia completo (PDF)
        </a>
      </div>
    </SettingsRow>
  );
}
