// "Senha definida" once a password has been set (distinct from the isActive
// enable/disable toggle rendered alongside it — a deactivated account can still
// have a password); otherwise "Convite pendente" while the set-password token is
// still valid, or "Convite expirado" once it lapses.
export function accountStatusLabel(hasPassword: boolean, setPasswordTokenExpiresAt: string | null): string {
  if (hasPassword) return "Senha definida";
  if (setPasswordTokenExpiresAt && new Date(setPasswordTokenExpiresAt).getTime() > Date.now()) return "Convite pendente";
  return "Convite expirado";
}

