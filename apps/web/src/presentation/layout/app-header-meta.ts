import { routes } from '@/presentation/lib/routes';

export interface AppHeaderMeta {
  title: string;
  subtitle?: string;
}

export type AppHeaderOverride = Partial<AppHeaderMeta>;

export const APP_HEADER_META: Record<string, AppHeaderMeta> = {
  // No subtitle: HomePage overrides the title with a time-aware greeting, and
  // a second greeting under it just says the same thing twice.
  [routes.home]: { title: 'Início' },
  [routes.chat]: { title: 'Acolhimento', subtitle: 'CRM, e-mail e telefone removidos' },
  [routes.assessment]: { title: 'Autoavaliação', subtitle: 'Leva cerca de 5 minutos.' },
  [routes.phq9]: { title: 'PHQ-9', subtitle: 'Humor e sinais de depressão' },
  [routes.gad7]: { title: 'GAD-7', subtitle: 'Ansiedade' },
  [routes.result]: { title: 'Resultado' },
  // Neutral labels on purpose. The header renders its title at 15px sans beside
  // a theme toggle; an emotional headline squeezed into that slot reads as
  // chrome. Each crisis screen owns its own serif headline in the body instead.
  [routes.crisis]: { title: 'Apoio' },
  [routes.crisisConnect]: { title: 'Falar com alguém' },
  [routes.crisisLine]: { title: 'Linha de crise' },
  [routes.peers]: { title: 'Pares anônimos', subtitle: 'Médicos treinados para ouvir.' },
  [routes.you]: { title: 'Você', subtitle: 'Consentimento e privacidade' },
  [routes.linkInstitution]: { title: 'Vincular ao hospital' },
  [routes.settings]: { title: 'Configurações', subtitle: 'Aparência do app e acesso da equipe.' },
  [routes.manager]: {
    title: 'Tendências',
    subtitle: 'Indicadores agregados e anônimos.',
  },
  [routes.managerNotifications]: {
    title: 'Notificações',
    subtitle: 'Alertas sobre sinais agregados e convites.',
  },
  [routes.managerHistory]: {
    title: 'Análises com IA',
    subtitle: 'Histórico das análises dos indicadores agregados.',
  },
  [routes.managerSettings]: {
    title: 'Configurações',
    subtitle: 'Preferências de aparência do painel.',
  },
  [routes.managerAdminManagers]: {
    title: 'Gestores',
    subtitle: 'Acesso ao painel por setor.',
  },
  [routes.managerAdminSectors]: {
    title: 'Setores',
    subtitle: 'Áreas do hospital acompanhadas pelo Zelo.',
  },
  [routes.managerAdminPeers]: {
    title: 'Pares anônimos',
    subtitle: 'Profissionais disponíveis para acolhimento.',
  },
  [routes.peerPartnerInbox]: {
    title: 'Pares anônimos',
    subtitle: 'Quem pede ajuda nunca se identifica.',
  },
  [routes.peerPartnerSettings]: { title: 'Configurações', subtitle: 'Aparência do app.' },
};

export function resolveAppHeaderMeta(pathname: string): AppHeaderMeta | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return APP_HEADER_META[normalized] ?? null;
}
