import { Wifi, WifiOff } from "lucide-react";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { PeerPartnerBottomNav } from "@/presentation/layout/PeerPartnerBottomNav";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { Pill } from "@/presentation/ui/Pill";
import { IconBadge } from "@/presentation/ui/IconBadge";
import { Skeleton } from "@/presentation/ui/Skeleton";
import { PeerChatRoom } from "@/presentation/components/PeerChatRoom";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { usePeerPartnerConnection } from "@/presentation/hooks/usePeerPartnerConnection";

export function PeerPartnerInboxPage() {
  const token = usePeerPartnerSessionStore((state) => state.token);
  const { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave, reconnect } = usePeerPartnerConnection(token);

  return (
    <PhoneShell
      centered
      chrome="manager"
      backTo={routes.peerPartnerInbox}
      bottomNav={state === "matched" ? false : <PeerPartnerBottomNav />}
    >
      {state === "connecting" && (
        <div aria-busy="true" className="space-y-3">
          <p className="text-label text-muted">Conectando...</p>
          <div className="flex items-center gap-3 rounded-card bg-surface p-4.5 shadow-card">
            <Skeleton className="h-9.5 w-9.5 rounded-icon" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-3 w-2/3 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {state === "idle" && (
        <Card className="flex items-center gap-3">
          <IconBadge icon={Wifi} tone="brand" />
          <div className="min-w-0">
            <Pill tone="positive">Conectado</Pill>
            <p className="mt-1 text-label text-muted">Conectado, aguardando solicitações.</p>
          </div>
        </Card>
      )}

      {state === "error" && (
        <Card className="flex items-start gap-3">
          <IconBadge icon={WifiOff} tone="danger" />
          <div className="min-w-0 flex-1">
            <Pill tone="danger">Desconectado</Pill>
            <p role="alert" className="mt-1 text-label text-danger">
              Não foi possível conectar. Você não está recebendo pedidos agora.
            </p>
            <div className="mt-3">
              <Button variant="outline" full={false} onClick={reconnect}>
                Tentar novamente
              </Button>
            </div>
          </div>
        </Card>
      )}

      {state === "incoming_request" && incomingRequest && (
        <Card>
          <p className="text-body font-extrabold text-ink">Novo pedido de conversa</p>
          {incomingRequest.sectorName && <p className="mt-1 text-caption text-muted">Setor: {incomingRequest.sectorName}</p>}
          <p className="mt-1 font-mono text-mono-data text-muted-2">{secondsRemaining}s para responder</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" full={false} onClick={accept}>
              Aceitar
            </Button>
            <Button variant="outline" full={false} onClick={decline}>
              Recusar
            </Button>
          </div>
        </Card>
      )}

      {state === "matched" && (
        <PeerChatRoom messages={messages} onSend={sendMessage} onLeave={leave} peerLeft={peerLeft} />
      )}
    </PhoneShell>
  );
}
