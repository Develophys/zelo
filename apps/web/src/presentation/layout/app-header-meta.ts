import { routes } from '@/presentation/lib/routes';

export interface AppHeaderMeta {
  title: string;
  subtitle?: string;
}

export type AppHeaderOverride = Partial<AppHeaderMeta>;

export const APP_HEADER_META: Record<string, AppHeaderMeta> = {
  [routes.home]: { title: 'Início', subtitle: 'Bom te ver por aqui' },
  [routes.chat]: { title: 'Acolhimento', subtitle: 'anonimizado antes do envio' },
  [routes.assessment]: {
    title: 'Autoavaliação',
    subtitle: 'Escolha uma escala validada. Leva cerca de 5 minutos.',
  },
  [routes.phq9]: { title: 'PHQ-9', subtitle: 'Humor e sinais de depressão' },
  [routes.gad7]: { title: 'GAD-7', subtitle: 'Ansiedade' },
  [routes.result]: { title: 'Resultado' },
  [routes.crisis]: { title: 'Você não está sozinho(a).' },
  [routes.crisisConnect]: { title: 'Vamos te direcionar' },
  [routes.crisisLine]: { title: 'Tudo bem. A escolha é sua.' },
  [routes.peers]: {
    title: 'Pares anônimos',
    subtitle: 'Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.',
  },
  [routes.you]: { title: 'Você', subtitle: 'Seu consentimento e sua privacidade.' },
  [routes.linkInstitution]: { title: 'Vincular ao hospital' },
  [routes.settings]: { title: 'Configurações', subtitle: 'Aparência do app neste dispositivo.' },
  [routes.manager]: {
    title: 'Tendências',
    subtitle: 'Indicadores agregados e anônimos do seu hospital.',
  },
  [routes.managerNotifications]: {
    title: 'Notificações',
    subtitle: 'Alertas do sistema sobre sinais agregados, convites e integrações.',
  },
  [routes.managerHistory]: {
    title: 'Análises com IA',
    subtitle: 'Histórico das análises geradas a partir dos indicadores agregados.',
  },
  [routes.managerSettings]: {
    title: 'Configurações',
    subtitle: 'Preferências de aparência do painel.',
  },
  [routes.managerAdminManagers]: {
    title: 'Gestores',
    subtitle: 'Quem tem acesso ao painel e a quais setores.',
  },
  [routes.managerAdminSectors]: {
    title: 'Setores',
    subtitle: 'Áreas do hospital acompanhadas pelo Zelo.',
  },
  [routes.managerAdminPeers]: {
    title: 'Pares anônimos',
    subtitle: 'Profissionais disponíveis para acolhimento entre pares.',
  },
};

export function resolveAppHeaderMeta(pathname: string): AppHeaderMeta | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return APP_HEADER_META[normalized] ?? null;
}
