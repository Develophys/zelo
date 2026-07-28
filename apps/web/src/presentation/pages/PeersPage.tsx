import { Lock } from "lucide-react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { PrivacyBadge } from "@/presentation/ui/PrivacyBadge";
import { routes } from "@/presentation/lib/routes";

// TODO(week2): peer-matching gateway — this screen is designed UI over placeholder data.
const PEERS = [
  { initial: "C", name: "Colega · Clínica médica", status: "plantão noturno · ● disponível" },
  { initial: "C", name: "Colega · Residência", status: "responde em ~1h" },
] as const;

export function PeersPage() {
  const navigate = useNavigate();

  return (
    <PhoneShell centered>
      <div className="pt-[26px]">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <PrivacyBadge />
        </div>
        <h1 className="mt-4 text-h1 text-ink">Pares anônimos</h1>
        <p className="mt-1 text-caption text-muted">
          Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.
        </p>

        <div className="mt-5 flex flex-col gap-[12px]">
          {PEERS.map((peer, index) => (
            <button
              key={index}
              type="button"
              onClick={() => navigate(routes.chat)}
              className="flex items-center justify-between rounded-card bg-surface p-[18px] text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-[38px] w-[38px] items-center justify-center rounded-icon bg-surface-brand font-serif text-brand">
                  {peer.initial}
                </div>
                <div>
                  <p className="text-body font-extrabold text-ink">{peer.name}</p>
                  <p className="text-caption text-muted-2">{peer.status}</p>
                </div>
              </div>
              <span className="text-brand">→</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-1 rounded-2xl bg-surface-brand p-[13px]">
          <Lock size={14} className="text-brand" />
          <span className="font-mono text-[12.5px] text-brand">conexão sem troca de identidade</span>
        </div>
      </div>
    </PhoneShell>
  );
}
