import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppHeader } from './AppHeader';
import type { AppHeaderOverride } from './app-header-meta';
import { routes } from '@/presentation/lib/routes';

function mount(path: string, override?: AppHeaderOverride, chrome?: 'doctor' | 'manager') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<AppHeader override={override} chrome={chrome} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  it('renders the title and subtitle from the route table', () => {
    mount(routes.you);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Você');
    expect(screen.getByText('Seu consentimento e sua privacidade.')).toBeInTheDocument();
  });

  it('renders nothing on a route with no header', () => {
    const { container } = mount(routes.splash);
    expect(container).toBeEmptyDOMElement();
  });

  it('omits the subtitle element entirely when the route has none', () => {
    mount(routes.crisisConnect);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Falar com alguém');
    // An empty paragraph still occupies its line box, which pushes the title off
    // optical centre on every route without a subtitle.
    expect(screen.queryByTestId('app-header-subtitle')).not.toBeInTheDocument();
  });

  it('carries no back button, on any route', () => {
    [routes.home, routes.you, routes.phq9, routes.managerSettings].forEach((path) => {
      cleanup();
      mount(path);
      expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
    });
  });

  it('lets the override replace the title while the table keeps the subtitle', () => {
    mount(routes.chat, { title: 'Boa tarde' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Boa tarde');
    expect(screen.getByTestId('app-header-subtitle')).toHaveTextContent(
      'anonimizado antes do envio',
    );
  });

  it('shows an override title on a route the table does not cover', () => {
    mount('/nope', { title: 'Passo dois' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Passo dois');
  });

  it('offers the theme switch and the privacy badge', () => {
    mount(routes.you);
    expect(screen.getByTestId('theme-switch')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Saiba mais sobre a criptografia AES-256' }),
    ).toBeInTheDocument();
  });

  it('withholds the anonymity badge from the manager chrome, whose session is named', () => {
    mount(routes.manager, undefined, 'manager');
    expect(screen.queryByTestId('privacy-badge')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Saiba mais sobre a criptografia AES-256' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the theme switch in the manager chrome', () => {
    mount(routes.manager, undefined, 'manager');
    expect(screen.getByTestId('theme-switch')).toBeInTheDocument();
  });

  it('opens the encryption modal from the privacy badge', async () => {
    mount(routes.you);
    await userEvent.click(
      screen.getByRole('button', { name: 'Saiba mais sobre a criptografia AES-256' }),
    );
    expect(await screen.findByText('Criptografia AES-256')).toBeInTheDocument();
  });

  it('rules itself off against the sidebar with the shared header height', () => {
    mount(routes.you);
    const header = screen.getByTestId('app-header');
    expect(header).toHaveClass('border-b', 'border-surface-brand', 'bg-surface');
    expect(header.className).toContain('md:min-h-app-header');
  });

  it('applies the caller-supplied column class to the inner row', () => {
    render(
      <MemoryRouter initialEntries={[routes.chat]}>
        <Routes>
          <Route path="*" element={<AppHeader column="max-w-chat" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app-header-row').className).toContain('max-w-chat');
  });

  it('applies the caller-supplied positioning class to the bar itself', () => {
    render(
      <MemoryRouter initialEntries={[routes.you]}>
        <Routes>
          <Route path="*" element={<AppHeader className="sticky top-0 z-30" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app-header')).toHaveClass('sticky', 'top-0', 'z-30');
  });
});
