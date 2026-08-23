import type { ComponentType, ReactElement } from 'react';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as container from '@/app/container';
import { SplashPage } from './SplashPage';
import { PrivacyPage } from './PrivacyPage';
import { ConsentPage } from './ConsentPage';
import { HomePage } from './HomePage';
import { AssessmentSelectPage } from './AssessmentSelectPage';
import { ScaleAssessmentPage } from './ScaleAssessmentPage';
import { PHQ9_SCALE, GAD7_SCALE } from '@/domain/assessment-scales/scales';
import { AssessmentResultPage } from './AssessmentResultPage';
import { CrisisOfferPage } from './CrisisOfferPage';
import { CrisisAcceptPage } from './CrisisAcceptPage';
import { CrisisDeclinePage } from './CrisisDeclinePage';
import { ChatPage } from './ChatPage';
import { PeersPage } from './PeersPage';
import { ManagerDashboardPage } from './ManagerDashboardPage';
import { ManagerLoginPage } from './ManagerLoginPage';
import { YouPage } from './YouPage';
import { ManagerInsightHistoryPage } from './ManagerInsightHistoryPage';
import { ManagerNotificationsPage } from './ManagerNotificationsPage';
import { useConsentStore } from '@/stores/consent.store';

const RESULT_STATE = { scaleType: 'PHQ-9' as const, totalScore: 12, max: 27, riskSignal: true };

const SCREENS: { name: string; Component: ComponentType; path: string; state?: unknown }[] = [
  { name: 'Splash', Component: SplashPage, path: '/' },
  { name: 'Privacy', Component: PrivacyPage, path: '/privacy' },
  { name: 'Consent', Component: ConsentPage, path: '/consent' },
  { name: 'Home', Component: HomePage, path: '/home' },
  { name: 'AssessmentSelect', Component: AssessmentSelectPage, path: '/assessment' },
  {
    name: 'Phq9Assessment',
    Component: () => <ScaleAssessmentPage scale={PHQ9_SCALE} />,
    path: '/assessment/phq9',
  },
  {
    name: 'Gad7Assessment',
    Component: () => <ScaleAssessmentPage scale={GAD7_SCALE} />,
    path: '/assessment/gad7',
  },
  {
    name: 'AssessmentResult',
    Component: AssessmentResultPage,
    path: '/assessment/result',
    state: RESULT_STATE,
  },
  { name: 'CrisisOffer', Component: CrisisOfferPage, path: '/crisis' },
  { name: 'CrisisAccept', Component: CrisisAcceptPage, path: '/crisis/connect' },
  { name: 'CrisisDecline', Component: CrisisDeclinePage, path: '/crisis/line' },
  { name: 'Chat', Component: ChatPage, path: '/chat' },
  { name: 'Peers', Component: PeersPage, path: '/peers' },
  { name: 'ManagerLogin', Component: ManagerLoginPage, path: '/manager/login' },
  { name: 'ManagerDashboard', Component: ManagerDashboardPage, path: '/manager' },
  { name: 'You', Component: YouPage, path: '/you' },
  { name: 'ManagerInsightHistory', Component: ManagerInsightHistoryPage, path: '/manager/history' },
  { name: 'ManagerNotifications', Component: ManagerNotificationsPage, path: '/manager/notifications' },
];

function mount(element: ReactElement, path: string, state?: unknown) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// "region" is disabled deliberately: axe flags content-not-in-a-landmark when
// scanning an isolated fragment (no <main>/<nav> wrapper exists at this scope,
// that's App.tsx's job) — a fragment-testing false positive, not a real issue.
// Every other rule stays enabled; a violation there must be fixed at the source.
async function expectNoViolations(container: HTMLElement) {
  const results = await axe(container, { rules: { region: { enabled: false } } });
  expect(results).toHaveNoViolations();
}

describe('automated accessibility pass (axe-core)', () => {
  beforeEach(() => {
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
  });

  it.each(SCREENS)('$name has no axe violations', async ({ Component, path, state }) => {
    const { container } = mount(<Component />, path, state);
    await expectNoViolations(container);
  });
});

const CHAT_CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';
const COMPOSER_LABEL = 'Mensagem';
const SEND_LABEL = 'Enviar';

function errorStream(error: 'ai_unavailable' | 'crisis_fallback_required') {
  return () => {
    async function* onlyError() {
      yield { error };
    }
    return onlyError();
  };
}

function gatedStream() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    open: () => {
      async function* stream() {
        yield { conversationId: CHAT_CONVERSATION_ID, delta: 'Primeira parte.', done: false };
        await gate;
        yield { conversationId: CHAT_CONVERSATION_ID, delta: ' Segunda parte.', done: true };
      }
      return stream();
    },
    release: () => release(),
  };
}

async function sendFromComposer() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Estou exausto');
  await user.click(screen.getByRole('button', { name: SEND_LABEL }));
  return user;
}

// The route-level sweep above only ever scans Chat's first paint. Its alerts,
// its streaming chrome and its collapsed tray are all markup axe would
// otherwise never see.
describe('automated accessibility pass (axe-core) — chat runtime states', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provider-error alert has no axe violations', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      errorStream('ai_unavailable'),
    );
    const { container: dom } = mount(<ChatPage />, '/chat');

    await sendFromComposer();
    expect(await screen.findByRole('alert')).toHaveTextContent(/não respondeu/i);

    await expectNoViolations(dom);
  });

  it('offline alert has no axe violations', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { container: dom } = mount(<ChatPage />, '/chat');

    await sendFromComposer();
    expect(await screen.findByRole('alert')).toHaveTextContent(/sem conexão/i);

    await expectNoViolations(dom);
  });

  it('crisis-fallback alert has no axe violations', async () => {
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(
      errorStream('crisis_fallback_required'),
    );
    const { container: dom } = mount(<ChatPage />, '/chat');

    await sendFromComposer();
    expect(await screen.findByRole('link', { name: /ligar para o cvv/i })).toBeInTheDocument();

    await expectNoViolations(dom);
  });

  it('typing indicator awaiting the first token has no axe violations', async () => {
    const neverArrives = new Promise<void>(() => {});
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(() => {
      async function* pending() {
        await neverArrives;
        yield { conversationId: CHAT_CONVERSATION_ID, delta: 'Oi.', done: true };
      }
      return pending();
    });
    const { container: dom } = mount(<ChatPage />, '/chat');

    await sendFromComposer();
    expect(await screen.findByTestId('assistant-typing')).toBeInTheDocument();

    await expectNoViolations(dom);
  });

  it('mid-reply streaming state has no axe violations', async () => {
    const gated = gatedStream();
    vi.spyOn(container.sendChatMessageUseCase, 'execute').mockImplementation(gated.open);
    const { container: dom } = mount(<ChatPage />, '/chat');

    await sendFromComposer();
    await screen.findByText('Primeira parte.');
    expect(screen.getByRole('button', { name: 'Parar resposta' })).toBeInTheDocument();

    await expectNoViolations(dom);
    gated.release();
  });

  it('collapsed action tray has no axe violations', async () => {
    const user = userEvent.setup();
    const { container: dom } = mount(<ChatPage />, '/chat');

    await user.click(screen.getByRole('button', { name: /recolher atalhos/i }));
    expect(screen.getByRole('button', { name: /expandir atalhos/i })).toBeInTheDocument();

    await expectNoViolations(dom);
  });
});
