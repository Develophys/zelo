import type { ComponentType } from 'react';
import { BarChart3, Bell, Brain, Building2, Settings, User, Users } from 'lucide-react';
import { routes } from '@/presentation/lib/routes';

export interface ManagerNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  route: string;
}

// Single source of truth for the panel's information architecture: the sidebar
// and the mobile nav both read it, so the two can never offer different
// destinations. Replaces the old "Administração" button, which was a dead end
// that hid three quarters of what a manager can actually do.
export const MANAGER_PRIMARY_NAV: readonly ManagerNavItem[] = [
  { id: 'trends', label: 'Tendências', icon: BarChart3, route: routes.manager },
  { id: 'notifications', label: 'Notificações', icon: Bell, route: routes.managerNotifications },
  { id: 'insights', label: 'Análises com IA', icon: Brain, route: routes.managerHistory },
];

// Gestores before Setores on purpose: a sector is assigned to a manager, so the
// manager list is the prerequisite task, not the other way around.
export const MANAGER_ADMIN_NAV: readonly ManagerNavItem[] = [
  { id: 'managers', label: 'Gestores', icon: User, route: routes.managerAdminManagers },
  { id: 'sectors', label: 'Setores', icon: Building2, route: routes.managerAdminSectors },
  { id: 'peers', label: 'Pares anônimos', icon: Users, route: routes.managerAdminPeers },
];

export const MANAGER_ADMIN_GROUP_LABEL = 'Administração';

export const MANAGER_SETTINGS_NAV: ManagerNavItem = {
  id: 'settings',
  label: 'Configurações',
  icon: Settings,
  route: routes.managerSettings,
};
