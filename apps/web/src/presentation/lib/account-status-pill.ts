export type AccountStatus = 'active' | 'inactive' | 'pending' | 'expired';

export interface AccountStatusPill {
  status: AccountStatus;
  tone: 'positive' | 'neutral' | 'warning' | 'danger';
  text: string;
}

interface AccountLike {
  isActive: boolean;
  hasPassword: boolean;
  setPasswordTokenExpiresAt: string | null;
}

const PILL: Record<AccountStatus, { tone: AccountStatusPill['tone']; text: string }> = {
  active: { tone: 'positive', text: 'Ativa' },
  inactive: { tone: 'neutral', text: 'Inativa' },
  pending: { tone: 'warning', text: 'Convite pendente' },
  expired: { tone: 'danger', text: 'Convite expirado' },
};

export function accountStatus(account: AccountLike): AccountStatus {
  if (account.hasPassword) return account.isActive ? 'active' : 'inactive';
  const tokenValid =
    account.setPasswordTokenExpiresAt !== null &&
    new Date(account.setPasswordTokenExpiresAt).getTime() > Date.now();
  return tokenValid ? 'pending' : 'expired';
}

export function accountStatusPill(account: AccountLike): AccountStatusPill {
  const status = accountStatus(account);
  return { status, ...PILL[status] };
}
