import { ThemeToggle } from '@/presentation/ui/ThemeToggle';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';
import { AccentField } from './AccentField';
import { DensityPreview } from './DensityPreview';
import { SegmentedField } from './SegmentedField';
import { SettingsRow } from './SettingsRow';
import { CORNERS_OPTIONS, DENSITY_OPTIONS } from './settings-options';

interface AppearanceSettingsProps {
  /** Density only moves tokens the manager panel uses, so only it offers the row. */
  includeDensity?: boolean;
}

export function AppearanceSettings({ includeDensity = false }: AppearanceSettingsProps) {
  const density = useManagerPrefsStore((state) => state.density);
  const accent = useManagerPrefsStore((state) => state.accent);
  const corners = useManagerPrefsStore((state) => state.corners);
  const setDensity = useManagerPrefsStore((state) => state.setDensity);
  const setAccent = useManagerPrefsStore((state) => state.setAccent);
  const setCorners = useManagerPrefsStore((state) => state.setCorners);

  return (
    <div data-testid="appearance-settings" className="flex flex-col">
      <SettingsRow title="Tema" description="Escolhe entre claro, escuro ou o tema do sistema.">
        <ThemeToggle />
      </SettingsRow>

      <SettingsRow
        title="Cor de destaque"
        description="Usada em botões, links e no item ativo do menu."
      >
        <AccentField value={accent} onChange={setAccent} />
      </SettingsRow>

      <SettingsRow
        title="Cantos"
        description="Define o arredondamento de botões, campos e cartões."
      >
        <SegmentedField
          name="manager-corners"
          ariaLabel="Cantos"
          options={CORNERS_OPTIONS}
          value={corners}
          onChange={setCorners}
        />
      </SettingsRow>

      {includeDensity && (
        <SettingsRow
          title="Densidade"
          description="Controla o espaçamento das tabelas e do menu. Mais compacta, mais linhas cabem na mesma altura."
        >
          <div className="flex flex-col gap-3">
            <SegmentedField
              name="manager-density"
              ariaLabel="Densidade"
              options={DENSITY_OPTIONS}
              value={density}
              onChange={setDensity}
            />
            <DensityPreview />
          </div>
        </SettingsRow>
      )}
    </div>
  );
}
