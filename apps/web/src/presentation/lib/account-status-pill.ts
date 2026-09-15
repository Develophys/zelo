export type AccountStatus = 'active' | 'inactive' | 'pending' | 'expired' | 'pending_registration';

export interface AccountStatusPill {
  status: AccountStatus;
  tone: 'positive' | 'neutral' | 'warning' | 'danger';
  text: string;
}

interface AccountLike {
  isActive: boolean;
  hasPassword: boolean;
  setPasswordTokenExpiresAt: string | null;
  // A SECTOR_MANAGER created with no sector: no invite has gone out yet, so
  // there is no token to read a 'pending'/'expired' state off of.
  isPendingSectorAssignment?: boolean;
}

const PILL: Record<AccountStatus, { tone: AccountStatusPill['tone']; text: string }> = {
  active: { tone: 'positive', text: 'Ativa' },
  inactive: { tone: 'neutral', text: 'Inativa' },
  pending: { tone: 'warning', text: 'Convite pendente' },
  expired: { tone: 'danger', text: 'Convite expirado' },
  pending_registration: { tone: 'neutral', text: 'Cadastro pendente' },
};

export function accountStatus(account: AccountLike): AccountStatus {
  if (account.hasPassword) return account.isActive ? 'active' : 'inactive';
  if (account.isPendingSectorAssignment) return 'pending_registration';
  const tokenValid =
    account.setPasswordTokenExpiresAt !== null &&
    new Date(account.setPasswordTokenExpiresAt).getTime() > Date.now();
  return tokenValid ? 'pending' : 'expired';
}

export function accountStatusPill(account: AccountLike): AccountStatusPill {
  const status = accountStatus(account);
  return { status, ...PILL[status] };
}
