import type { ReactNode } from "react";

interface ManagerPageHeaderProps {
  title: string;
  intro: string;
  actions?: ReactNode;
}

export function ManagerPageHeader({ title, intro, actions }: ManagerPageHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      <p className="font-mono text-eyebrow text-muted uppercase">Painel do gestor</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-h2 text-ink lg:text-h1">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <p className="max-w-[62ch] text-label text-muted">{intro}</p>
    </header>
  );
}
