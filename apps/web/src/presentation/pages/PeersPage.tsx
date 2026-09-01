import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { PeerChatRoom } from '@/presentation/components/PeerChatRoom';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
import { getCrisisLine } from '@/presentation/lib/crisis-line';
import { routes } from '@/presentation/lib/routes';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';
import { usePeerRequest } from '@/presentation/hooks/usePeerRequest';

// Long enough not to nag someone whose match is simply a few seconds away,
// short enough that a 03:40 search does not sit silent while they wait.
const SLOW_SEARCH_MS = 15_000;

/**
 * The anonymity guarantee and the crisis line, stated once for every state of
 * this screen. The line is quiet rather than alarming, but it is always here:
 * this is where someone comes to reach a person, and both the empty result and
 * a long search leave them without one.
 */
function PeerFooter() {
  const line = getCrisisLine();

  return (
    <div className="mt-6">
      <div className="flex items-center justify-center gap-1 rounded-card bg-surface-brand p-3.25">
        <Lock size={14} className="text-brand" />
        <span className="font-mono text-mono-data text-brand">conexão sem troca de identidade</span>
      </div>
      <div className="mt-3 flex justify-center">
        <CrisisCallLink line={line} className="text-brand" />
      </div>
    </div>
  );
}

export function PeersPage() {
  const navigate = useNavigate();
  const institutionId = useInstitutionLinkStore((state) => state.institutionId);
  const sectorName = useInstitutionLinkStore((state) => state.sectorName);
  const { state, specialty, messages, peerLeft, requestPeer, sendMessage, leave } =
    usePeerRequest();
  const [searchIsSlow, setSearchIsSlow] = useState(false);
  const line = getCrisisLine();

  useEffect(() => {
    if (state !== 'searching') {
      setSearchIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setSearchIsSlow(true), SLOW_SEARCH_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (!institutionId) {
    return (
      <PhoneShell
        sidebar
        bottomNav
        centered
        headerOverride={{ subtitle: 'Vincule-se ao seu hospital para falar com um colega.' }}
      >
        <div>
          <Button variant="outline" onClick={() => navigate(routes.linkInstitution)}>
            Vincular ao hospital
          </Button>
          <PeerFooter />
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell sidebar bottomNav centered>
      <div>
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
            <Button variant="primary" isLoading disabled>
              Procurando um colega disponível...
            </Button>
            {searchIsSlow && (
              <p role="status" className="mt-3 text-pretty text-caption text-muted">
                Isso está demorando mais que o normal. Seguimos procurando — e você pode ligar para
                o {line.label} a qualquer momento.
              </p>
            )}
          </div>
        )}

        {state === 'error' && (
          <div className="mt-5">
            <p role="alert" className="mb-2 text-pretty text-label text-danger">
              Não foi possível conectar agora. Você não está na fila de espera.
            </p>
            <div data-testid="peer-error-actions" className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => requestPeer(institutionId, sectorName ?? undefined)}
              >
                Tentar novamente
              </Button>
              <CrisisCallLink
                line={line}
                className="w-full justify-center border border-fill-edge bg-brand-fill text-on-fill"
              />
            </div>
          </div>
        )}

        {state === 'no_peer_available' && (
          <div className="mt-5">
            <p role="alert" className="mb-2 text-label text-danger">
              Nenhum colega disponível agora.
            </p>
            <div data-testid="no-peer-actions" className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => requestPeer(institutionId, sectorName ?? undefined)}
              >
                Tentar novamente
              </Button>
              <CrisisCallLink
                line={line}
                className="w-full justify-center border border-fill-edge bg-brand-fill text-on-fill"
              />
            </div>
          </div>
        )}

        {(state === 'matched' || state === 'connection_lost') && (
          <div className="mt-5">
            <p className="mb-3 text-label text-muted">Conectado com um colega de {specialty}.</p>
            {/* The transcript stays on screen after a drop. Clearing it would
                take away the one record of what was said. */}
            <PeerChatRoom
              messages={messages}
              onSend={sendMessage}
              onLeave={leave}
              peerLeft={peerLeft}
              connectionLost={state === 'connection_lost'}
              onRetry={() => institutionId && requestPeer(institutionId, sectorName ?? undefined)}
            />
          </div>
        )}

        <PeerFooter />
      </div>
    </PhoneShell>
  );
}
