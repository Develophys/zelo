import { useState } from "react";
import { Modal } from "@/presentation/ui/Modal";
import { useHotkey } from "@/presentation/hooks/useHotkey";
import { useHotkeyStore } from "@/stores/hotkey.store";

function HotkeyRow({ hotkeyKey, label }: { hotkeyKey: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-label text-ink-2">{label}</span>
      <kbd className="rounded-control border border-line bg-canvas-alt px-2 py-0.5 font-mono text-label text-muted">
        {hotkeyKey}
      </kbd>
    </li>
  );
}

export function HotkeyHelpModal() {
  const [isOpen, setIsOpen] = useState(false);
  useHotkey("?", () => setIsOpen(true), "Ver atalhos", { scope: "global" });

  const entries = useHotkeyStore((state) => state.entries);
  const globalEntries = [...entries].filter(([, entry]) => entry.scope === "global");
  const pageEntries = [...entries].filter(([, entry]) => entry.scope === "page");

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Atalhos de teclado" size="sm">
      <section aria-label="Atalhos globais">
        <h3 className="text-label font-semibold text-ink-2">Atalhos globais</h3>
        <ul className="mt-2">
          {globalEntries.map(([hotkeyKey, entry]) => (
            <HotkeyRow key={hotkeyKey} hotkeyKey={hotkeyKey} label={entry.label} />
          ))}
        </ul>
      </section>
      <section aria-label="Nesta página" className="mt-4">
        <h3 className="text-label font-semibold text-ink-2">Nesta página</h3>
        {pageEntries.length === 0 ? (
          <p className="mt-2 text-label text-muted">Nenhum atalho nesta página.</p>
        ) : (
          <ul className="mt-2">
            {pageEntries.map(([hotkeyKey, entry]) => (
              <HotkeyRow key={hotkeyKey} hotkeyKey={hotkeyKey} label={entry.label} />
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
