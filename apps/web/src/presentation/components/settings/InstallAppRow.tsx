import { useState } from 'react';
import { EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import { Button } from '@/presentation/ui/Button';
import { useInstallPrompt } from '@/presentation/hooks/useInstallPrompt';
import { InstallInstructionsModal } from './InstallInstructionsModal';
import { SettingsRow } from './SettingsRow';

export function InstallAppRow() {
  const { status, promptInstall } = useInstallPrompt();
  const [showInstructions, setShowInstructions] = useState(false);

  // 'unsupported' means there's no install path we can point to with
  // confidence (desktop Firefox, desktop Safari, a Chromium desktop browser
  // that hasn't offered the prompt yet) — silence beats a guess.
  if (status === 'installed' || status === 'unsupported') {
    return null;
  }

  return (
    // Wrapped in its own top border rather than leaning on the previous
    // component's bottom border: SettingsRow only draws border-b when it
    // isn't the last child of its own parent, and this row's parent varies
    // by settings page (sometimes it's the final row, sometimes not).
    <div className="border-t border-line">
      <SettingsRow
        title="Instalar o app"
        description="Adiciona um atalho do Zelo na tela inicial do aparelho, como um aplicativo."
      >
        {status === 'installable' && (
          <Button size="sm" full={false} onClick={promptInstall}>
            Adicionar à tela inicial
          </Button>
        )}
        {status === 'ios' && (
          <>
            <Button size="sm" full={false} onClick={() => setShowInstructions(true)}>
              Adicionar à tela inicial
            </Button>
            <InstallInstructionsModal
              isOpen={showInstructions}
              onClose={() => setShowInstructions(false)}
              intro='O iOS não deixa os aplicativos adicionarem um atalho sozinhos — é só a Apple quem controla esse passo, direto pelo Safari.'
              steps={[
                { icon: Share, text: 'Toque no ícone de Compartilhar na barra do Safari' },
                { icon: SquarePlus, text: 'Escolha "Adicionar à Tela de Início"' },
              ]}
            />
          </>
        )}
        {status === 'ios-other-browser' && (
          <Button
            size="sm"
            full={false}
            onClick={() => {
              // The only cross-app way to reach Safari's Share-sheet flow:
              // iOS itself (not Safari) owns this URL scheme and hands the
              // current page to Safari, which is the one browser Apple lets
              // add a Home Screen icon.
              window.location.href = `x-safari-${window.location.href}`;
            }}
          >
            Abrir no Safari
          </Button>
        )}
        {status === 'android' && (
          <>
            <Button size="sm" full={false} onClick={() => setShowInstructions(true)}>
              Adicionar à tela inicial
            </Button>
            <InstallInstructionsModal
              isOpen={showInstructions}
              onClose={() => setShowInstructions(false)}
              intro="Esse navegador ainda não liberou a instalação direta — o passo fica no menu dele."
              steps={[
                { icon: EllipsisVertical, text: 'Toque no menu (⋮) do navegador' },
                { icon: SquarePlus, text: 'Escolha "Instalar app" ou "Adicionar à tela inicial"' },
              ]}
            />
          </>
        )}
      </SettingsRow>
    </div>
  );
}
