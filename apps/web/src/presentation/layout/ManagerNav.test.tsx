import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManagerSidebar } from './ManagerSidebar';
import { ManagerBottomNav } from './ManagerBottomNav';
import { MANAGER_ADMIN_NAV, MANAGER_PRIMARY_NAV, MANAGER_SETTINGS_NAV } from './manager-nav';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';
import { useManagerSessionStore } from '@/stores/manager-session.store';
import { routes } from '@/presentation/lib/routes';
import * as container from '@/app/container';

const ALL_DESTINATIONS = [...MANAGER_PRIMARY_NAV, ...MANAGER_ADMIN_NAV, MANAGER_SETTINGS_NAV];

function unread(count: number) {
  vi.spyOn(container.listManagerNotificationsUseCase, 'unreadCount').mockResolvedValue(count);
}

function mount(node: React.ReactNode, at = '/manager') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[at]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  useManagerSessionStore
    .getState()
    .setSession('token', new Date(Date.now() + 60_000).toISOString(), 'HOSPITAL_ADMIN');
  vi.spyOn(container.listManagerNotificationsUseCase, 'unreadCount').mockResolvedValue(0);
});

afterEach(() => {
  window.localStorage.clear();
  useManagerPrefsStore.setState({
    density: 'comfortable',
    accent: 'sage',
    corners: 'sharp',
    sidebarCollapsed: false,
  });
  vi.restoreAllMocks();
});

describe('ManagerSidebar', () => {
  it('lists every destination the panel has, replacing the Administração dead end', () => {
    mount(<ManagerSidebar />);
    for (const { label, route } of ALL_DESTINATIONS) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', route);
    }
  });

  it('uses real links, so middle-click and copy-link work', () => {
    mount(<ManagerSidebar />);
    for (const { label } of MANAGER_PRIMARY_NAV) {
      expect(screen.getByRole('link', { name: label }).tagName).toBe('A');
    }
  });

  it('marks the current destination for assistive tech, not just visually', () => {
    mount(<ManagerSidebar />, '/manager/admin/sectors');
    expect(screen.getByRole('link', { name: 'Setores' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Gestores' })).not.toHaveAttribute('aria-current');
  });

  it('reaches Sair without leaving the sidebar — it was missing from the panel entirely', () => {
    mount(<ManagerSidebar />);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('puts the collapse toggle in the sidebar header, beside the Zelo mark', () => {
    mount(<ManagerSidebar />);
    const header = screen.getByTestId('manager-sidebar-header');
    expect(within(header).getByRole('link', { name: 'Zelo' })).toHaveAttribute(
      'href',
      routes.manager,
    );
    expect(within(header).getByRole('button', { name: 'Recolher menu' })).toBeInTheDocument();
  });

  it('stays pinned to the viewport with no top bar to clear', () => {
    mount(<ManagerSidebar />);
    expect(screen.getByTestId('manager-sidebar').className).toContain('md:sticky');
    expect(screen.getByTestId('manager-sidebar').className).toContain('md:top-0');
    expect(screen.getByTestId('manager-sidebar').className).toContain('md:h-dvh');
  });

  it('collapses to a rail and back, and the choice survives a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = mount(<ManagerSidebar />);
    expect(screen.getByTestId('manager-sidebar').className).toContain('lg:w-55');

    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(screen.getByTestId('manager-sidebar').className).not.toContain('lg:w-55');

    unmount();
    mount(<ManagerSidebar />);
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('manager-sidebar').className).not.toContain('lg:w-55');
  });

  // The bubble is aria-hidden by design when it only restates the trigger's own
  // accessible name, so these find it by testid rather than by role.
  it('names the first rail nav item on keyboard focus, after the header link and toggle', async () => {
    const user = userEvent.setup();
    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    mount(<ManagerSidebar />);

    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Tendências');
  });

  it.each([
    ['link', 'Setores', 'Setores'],
    ['button', 'Sair', 'Sair'],
  ])('names the %s "%s" on hover in the rail', async (role, name, expected) => {
    const user = userEvent.setup();
    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    mount(<ManagerSidebar />);

    await user.hover(screen.getByRole(role as 'link', { name }));
    expect(screen.getByTestId('tooltip')).toHaveTextContent(expected);
  });

  it('names the signed-in account in the rail, where the avatar stands alone', async () => {
    const user = userEvent.setup();
    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    mount(<ManagerSidebar />);

    await user.hover(screen.getByTestId('manager-account'));
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Administração do hospital');
  });

  it('shrinks the unread badge to a dot in the rail, where a number would not fit', async () => {
    unread(3);
    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    mount(<ManagerSidebar />);
    const badge = await screen.findByRole('status', { name: '3 notificações não lidas' });
    expect(badge).not.toHaveTextContent('3');
  });

  it('caps the badge at 99+ while keeping the real count in the accessible name', async () => {
    unread(104);
    mount(<ManagerSidebar />);
    const badge = await screen.findByRole('status', { name: '104 notificações não lidas' });
    expect(badge).toHaveTextContent('99+');
  });

  it('has no axe violations, collapsed or expanded', async () => {
    const expanded = mount(<ManagerSidebar />);
    expect(await axe(expanded.container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
    expanded.unmount();

    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    const collapsed = mount(<ManagerSidebar />);
    expect(await axe(collapsed.container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe('ManagerBottomNav', () => {
  it('keeps four slots, because a fifth would break the 44px tap minimum at 375px', () => {
    mount(<ManagerBottomNav />);
    const nav = screen.getByTestId('manager-bottom-nav');
    const slots = within(nav).getAllByRole('link').length + 1; // + "Mais"
    expect(slots).toBe(4);
  });

  it('reaches Sair in two taps: Mais, then Sair', async () => {
    const user = userEvent.setup();
    mount(<ManagerBottomNav />);

    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mais/ }));
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('puts every destination the bottom slots cannot hold inside the sheet', async () => {
    const user = userEvent.setup();
    mount(<ManagerBottomNav />);
    await user.click(screen.getByRole('button', { name: /Mais/ }));

    const sheet = screen.getByRole('dialog');
    for (const { label, route } of [...MANAGER_ADMIN_NAV, MANAGER_SETTINGS_NAV]) {
      expect(within(sheet).getByRole('link', { name: label })).toHaveAttribute('href', route);
    }
  });

  it('closes the sheet on Escape and hands focus back to the Mais button', async () => {
    const user = userEvent.setup();
    const { container } = mount(<ManagerBottomNav />);
    const more = screen.getByRole('button', { name: /Mais/ });
    const sheet = container.querySelector('dialog') as HTMLDialogElement;

    await user.click(more);
    expect(sheet.open).toBe(true);
    expect(sheet.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(sheet.open).toBe(false);
    expect(more).toHaveFocus();
  });

  it('closes the sheet when the backdrop is tapped', async () => {
    const user = userEvent.setup();
    const { container } = mount(<ManagerBottomNav />);
    const sheet = container.querySelector('dialog') as HTMLDialogElement;

    await user.click(screen.getByRole('button', { name: /Mais/ }));
    expect(sheet.open).toBe(true);

    await user.click(sheet);
    expect(sheet.open).toBe(false);
  });

  it('announces the sheet state on the trigger', async () => {
    const user = userEvent.setup();
    mount(<ManagerBottomNav />);
    const more = screen.getByRole('button', { name: /Mais/ });

    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no axe violations with the sheet open', async () => {
    const user = userEvent.setup();
    const { container } = mount(<ManagerBottomNav />);
    await user.click(screen.getByRole('button', { name: /Mais/ }));
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe('manager sidebar caption', () => {
  it('names the panel once, under the logo, instead of on every page', () => {
    mount(<ManagerSidebar />);
    const caption = screen.getByTestId('manager-sidebar-caption');
    const header = screen.getByTestId('manager-sidebar-header');

    expect(caption).toHaveTextContent('Painel do gestor');
    expect(header.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the caption out of the logo block, which is capped at the shared header height', () => {
    mount(<ManagerSidebar />);
    const header = screen.getByTestId('manager-sidebar-header');
    expect(header).not.toContainElement(screen.getByTestId('manager-sidebar-caption'));
    expect(header.className).toContain('md:min-h-app-header');
  });

  it('leaves the caption to screen readers only while the rail is collapsed', () => {
    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    mount(<ManagerSidebar />);
    const caption = screen.getByTestId('manager-sidebar-caption');
    expect(caption.className).toContain('sr-only');
    expect(caption.className).not.toContain('lg:not-sr-only');
  });

  it('shows the caption once the sidebar is expanded', () => {
    useManagerPrefsStore.setState({ sidebarCollapsed: false });
    mount(<ManagerSidebar />);
    expect(screen.getByTestId('manager-sidebar-caption').className).toContain('lg:not-sr-only');
  });
});
