import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { PeerChatRoom } from "@/presentation/components/PeerChatRoom";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { usePeerPartnerConnection } from "@/presentation/hooks/usePeerPartnerConnection";

export function PeerPartnerInboxPage() {
  const navigate = useNavigate();
  const token = usePeerPartnerSessionStore((state) => state.token);
  const clearSession = usePeerPartnerSessionStore((state) => state.clearSession);
  const { state, incomingRequest, secondsRemaining, messages, peerLeft, accept, decline, sendMessage, leave, reconnect } = usePeerPartnerConnection(token);

  const handleLogout = () => {
    clearSession();
    navigate(routes.peerPartnerLogin);
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="flex items-center justify-between">
          <h1 className="text-h1 text-ink">Pares anônimos</h1>
          <Button variant="outline" full={false} onClick={handleLogout}>
            Sair
          </Button>
        </div>

        {state === "connecting" && <p className="mt-4 text-label text-muted">Conectando...</p>}
        {state === "idle" && <p className="mt-4 text-label text-muted">Conectado, aguardando solicitações.</p>}

        {state === "error" && (
          <div className="mt-4">
            <p role="alert" className="text-label text-danger">
              Não foi possível conectar. Você não está recebendo pedidos agora.
            </p>
            <div className="mt-3">
              <Button variant="outline" full={false} onClick={reconnect}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {state === "incoming_request" && incomingRequest && (
          <Card className="mt-4">
            <p className="text-body font-extrabold text-ink">Novo pedido de conversa</p>
            {incomingRequest.sectorName && <p className="mt-1 text-caption text-muted">Setor: {incomingRequest.sectorName}</p>}
            <p className="mt-1 font-mono text-[12px] text-muted-2">{secondsRemaining}s para responder</p>
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
          <div className="mt-4">
            <PeerChatRoom messages={messages} onSend={sendMessage} onLeave={leave} peerLeft={peerLeft} />
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
