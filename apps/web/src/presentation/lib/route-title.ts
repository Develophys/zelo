import { routes } from '@/presentation/lib/routes';

export const ROUTE_TITLES: Record<string, string> = {
  [routes.privacy]: 'Privacidade',
  [routes.consent]: 'Consentimento',
  [routes.home]: 'Início',
  [routes.assessment]: 'Autoavaliação',
  [routes.phq9]: 'PHQ-9',
  [routes.gad7]: 'GAD-7',
  [routes.result]: 'Resultado',
  [routes.crisis]: 'Apoio',
  [routes.crisisConnect]: 'Falar com alguém',
  [routes.crisisLine]: 'Linha de crise',
  [routes.chat]: 'Acolhimento',
  [routes.peers]: 'Pares anônimos',
  [routes.manager]: 'Tendências',
  [routes.managerAdminManagers]: 'Gestores',
  [routes.managerAdminSectors]: 'Setores',
  [routes.managerAdminPeers]: 'Pares anônimos',
  [routes.managerNotifications]: 'Notificações',
  [routes.managerSettings]: 'Configurações',
  [routes.managerLogin]: 'Acesso do gestor',
  [routes.you]: 'Você',
  [routes.settings]: 'Configurações',
  [routes.managerHistory]: 'Análises com IA',
  [routes.linkInstitution]: 'Vincular ao hospital',
  [routes.adminLogin]: 'Acesso administrativo',
  [routes.admin]: 'Instituições',
  [routes.peerPartnerLogin]: 'Acesso do par anônimo',
  [routes.peerPartnerInbox]: 'Pares anônimos',
  [routes.peerPartnerSettings]: 'Configurações',
};

export function titleForPathname(pathname: string): string {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const page = ROUTE_TITLES[normalized];
  return page ? `${page} · Zelo` : 'Zelo';
}
