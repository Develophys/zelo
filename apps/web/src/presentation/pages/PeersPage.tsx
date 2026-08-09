import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { PeerChatRoom } from '@/presentation/components/PeerChatRoom';
import { routes } from '@/presentation/lib/routes';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';
import { usePeerRequest } from '@/presentation/hooks/usePeerRequest';

export function PeersPage() {
  const navigate = useNavigate();
  const institutionId = useInstitutionLinkStore((state) => state.institutionId);
  const sectorName = useInstitutionLinkStore((state) => state.sectorName);
  const { state, specialty, messages, peerLeft, requestPeer, sendMessage, leave } =
    usePeerRequest();

  const header = (
    <div className="flex items-center justify-between">
      <BackButton label="Início" onClick={() => navigate(routes.home)} />
      <PrivacyBadge />
    </div>
  );

  if (!institutionId) {
    return (
      <PhoneShell centered>
        <div className="pt-6.5">
          {header}
          <h1 className="mt-4 text-h1 text-ink">Pares anônimos</h1>
          <p className="mt-1 text-caption text-muted">
            Vincule-se ao seu hospital para falar com um colega.
          </p>
          <div className="mt-5">
            <Button variant="outline" onClick={() => navigate(routes.linkInstitution)}>
              Vincular ao hospital
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1 rounded-2xl bg-surface-brand p-3.25">
            <Lock size={14} className="text-brand" />
            <span className="font-mono text-[12.5px] text-brand">
              conexão sem troca de identidade
            </span>
          </div>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell centered>
      <div className="pt-6.5">
        {header}
        <h1 className="mt-4 text-h1 text-ink">Pares anônimos</h1>
        <p className="mt-1 text-caption text-muted">
          Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.
        </p>

        {state === 'idle' && (
          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => requestPeer(institutionId, sectorName ?? undefined)}
            >
              Falar com um colega
            </Button>
          </div>
        )}

        {state === 'searching' && (
          <div className="mt-5">
            <Button variant="primary" loading disabled>
              Procurando um colega disponível...
            </Button>
          </div>
        )}

        {state === 'no_peer_available' && (
          <div className="mt-5">
            <p role="alert" className="mb-2 text-label text-danger">
              Nenhum colega disponível agora.
            </p>
            <Button
              variant="outline"
              onClick={() => requestPeer(institutionId, sectorName ?? undefined)}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {state === 'matched' && (
          <div className="mt-5">
            <p className="mb-3 text-label text-muted">Conectado com um colega de {specialty}.</p>
            <PeerChatRoom
              messages={messages}
              onSend={sendMessage}
              onLeave={leave}
              peerLeft={peerLeft}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1 rounded-2xl bg-surface-brand p-3.25">
          <Lock size={14} className="text-brand" />
          <span className="font-mono text-[12.5px] text-brand">
            conexão sem troca de identidade
          </span>
        </div>
      </div>
    </PhoneShell>
  );
}
