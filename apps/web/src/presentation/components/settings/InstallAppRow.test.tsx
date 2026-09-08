import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallAppRow } from './InstallAppRow';

interface FakeBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as FakeBeforeInstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
  window.dispatchEvent(event);
  return event;
}

function stubUserAgent(userAgent: string) {
  vi.stubGlobal('navigator', { ...navigator, userAgent });
}

describe('InstallAppRow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing when there is no install path to point to with confidence', () => {
    render(<InstallAppRow />);

    expect(screen.queryByText('Instalar o app')).not.toBeInTheDocument();
  });

  it('triggers the native install prompt on Chromium', async () => {
    render(<InstallAppRow />);
    const event = fireBeforeInstallPrompt();

    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar à tela inicial' }));

    expect(event.prompt).toHaveBeenCalledOnce();
  });

  it('opens step-by-step instructions on iOS instead of a native prompt', async () => {
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    render(<InstallAppRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar à tela inicial' }));

    expect(screen.getByText('Toque no ícone de Compartilhar na barra do Safari')).toBeInTheDocument();
  });

  it('points Android browsers at their own menu instead of guessing at a button', async () => {
    stubUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0');
    render(<InstallAppRow />);

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar à tela inicial' }));

    expect(screen.getByText('Toque no menu (⋮) do navegador')).toBeInTheDocument();
  });

  it('hides itself once the app is already installed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    render(<InstallAppRow />);

    expect(screen.queryByText('Instalar o app')).not.toBeInTheDocument();
  });
});
