import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ManagerPageHeader } from "@/presentation/layout/ManagerPageHeader";
import { Card } from "@/presentation/ui/Card";
import { CardTitle } from "@/presentation/ui/CardTitle";
import { ThemeToggle } from "@/presentation/ui/ThemeToggle";
import {
  MANAGER_ACCENTS,
  useManagerPrefsStore,
  type ManagerAccent,
  type ManagerCorners,
  type ManagerDensity,
} from "@/stores/manager-prefs.store";

const ACCENT_LABEL: Record<ManagerAccent, string> = {
  sage: "Sage",
  teal: "Teal",
  indigo: "Índigo",
  clay: "Argila",
};

const DENSITY_OPTIONS: readonly { value: ManagerDensity; label: string }[] = [
  { value: "comfortable", label: "Confortável" },
  { value: "compact", label: "Compacta" },
];

const CORNERS_OPTIONS: readonly { value: ManagerCorners; label: string }[] = [
  { value: "sharp", label: "Retos" },
  { value: "rounded", label: "Arredondados" },
];

function SettingsSection({
  title,
  description,
  contentClassName = "mt-3.5",
  children,
}: {
  title: string;
  description: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card size="md" className="h-full">
      <CardTitle>{title}</CardTitle>
      <p className="mt-1 text-caption text-muted">{description}</p>
      <div className={contentClassName}>{children}</div>
    </Card>
  );
}

function SegmentedField<T extends string>({
  name,
  ariaLabel,
  options,
  value,
  onChange,
}: {
  name: string;
  ariaLabel: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1 rounded-control bg-canvas-alt p-1">
      {options.map(({ value: optionValue, label }) => {
        const isSelected = value === optionValue;
        return (
          <label
            key={optionValue}
            className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control text-label font-semibold transition-colors duration-150 has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-brand ${
              isSelected
                ? "border border-fill-edge bg-brand-fill text-on-fill shadow-card"
                : "border border-transparent text-muted hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={isSelected}
              onChange={() => onChange(optionValue)}
              className="sr-only"
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

function AccentField({ value, onChange }: { value: ManagerAccent; onChange: (value: ManagerAccent) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor de destaque" className="flex flex-wrap gap-2">
      {MANAGER_ACCENTS.map((accent) => {
        const isSelected = value === accent;
        const isSage = accent === "sage";
        return (
          <label
            key={accent}
            className={`flex min-h-11 flex-1 basis-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border p-2.5 text-label font-semibold transition-colors duration-150 has-focus-visible:outline-none has-focus-visible:ring-2 has-focus-visible:ring-brand ${
              isSelected ? "border-brand-fill bg-surface-brand text-ink" : "border-line text-muted hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name="manager-accent"
              value={accent}
              checked={isSelected}
              onChange={() => onChange(accent)}
              className="sr-only"
            />
            <span
              data-accent={isSage ? undefined : accent}
              data-testid={`accent-swatch-${accent}`}
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-full text-on-fill ${
                isSage ? "bg-accent-sage-fill" : "bg-brand-fill"
              }`}
            >
              {isSelected && <Check size={14} strokeWidth={3} />}
            </span>
            {ACCENT_LABEL[accent]}
          </label>
        );
      })}
    </div>
  );
}

export function ManagerSettingsPage() {
  const density = useManagerPrefsStore((state) => state.density);
  const accent = useManagerPrefsStore((state) => state.accent);
  const corners = useManagerPrefsStore((state) => state.corners);
  const setDensity = useManagerPrefsStore((state) => state.setDensity);
  const setAccent = useManagerPrefsStore((state) => state.setAccent);
  const setCorners = useManagerPrefsStore((state) => state.setCorners);

  return (
    <div className="flex flex-col gap-5 pt-6">
      <ManagerPageHeader
        title="Configurações"
        intro="Preferências de aparência do painel. Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do hospital."
      />

      <div data-testid="settings-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SettingsSection title="Cor de destaque" description="Usada em botões, links e no item ativo do menu.">
          <AccentField value={accent} onChange={setAccent} />
        </SettingsSection>

        <SettingsSection title="Densidade" description="Controla o espaçamento das tabelas e do menu.">
          <SegmentedField
            name="manager-density"
            ariaLabel="Densidade"
            options={DENSITY_OPTIONS}
            value={density}
            onChange={setDensity}
          />
        </SettingsSection>

        <SettingsSection title="Cantos" description="Define o arredondamento de botões, campos e cartões.">
          <SegmentedField
            name="manager-corners"
            ariaLabel="Cantos"
            options={CORNERS_OPTIONS}
            value={corners}
            onChange={setCorners}
          />
        </SettingsSection>

        <SettingsSection
          title="Tema"
          description="Escolhe entre claro, escuro ou o tema do sistema."
          contentClassName=""
        >
          <ThemeToggle />
        </SettingsSection>
      </div>
    </div>
  );
}
