import { HeartHandshake, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { memo } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { routes } from '@/presentation/lib/routes';
import { CHAT_COLUMN } from './chat-column';

const HANDOFF_LABEL = 'Falar com uma pessoa real';
const ASSESS_LABEL = 'Avaliar como estou';

const COMPACT_ACTION = 'flex-1 md:flex-none md:px-5';

interface ChatActionTrayProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const ChatActionTray = memo(function ChatActionTray({
  collapsed,
  onToggle,
}: ChatActionTrayProps) {
  const navigate = useNavigate();

  return (
    <div className="px-4">
      <div className={`${CHAT_COLUMN} relative`}>
        <Button
          type="button"
          variant="unstyled"
          full={false}
          onClick={onToggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expandir atalhos' : 'Recolher atalhos'}
          className="absolute -top-7 right-0 z-10 flex h-7 w-14 items-end justify-center rounded-t-card border border-b-0 border-surface-brand bg-surface pb-1 text-muted hover:text-brand after:absolute after:inset-x-0 after:-top-2 after:-bottom-2 after:content-['']"
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>

      <div data-testid="chat-action-tray" className="pt-5 short:pt-4">
        {collapsed ? (
          <div className={`${CHAT_COLUMN} animate-rise-in flex gap-2 pb-3 short:pb-2`}>
            <Button
              type="button"
              variant="soft"
              size="sm"
              full={false}
              aria-label={HANDOFF_LABEL}
              onClick={() => navigate(routes.crisis)}
              className={`${COMPACT_ACTION} border border-track`}
            >
              <HeartHandshake size={16} className="shrink-0" />
              Pessoa real
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              full={false}
              aria-label={ASSESS_LABEL}
              onClick={() => navigate(routes.assessment)}
              className={`${COMPACT_ACTION} enabled:hover:text-brand`}
            >
              <ClipboardList size={16} className="shrink-0" />
              Avaliar
            </Button>
          </div>
        ) : (
          <div
            className={`${CHAT_COLUMN} flex flex-col gap-3 pb-3 short:gap-2 short:pb-2 short-wide:flex-row`}
          >
            <Button
              type="button"
              variant="soft"
              full={false}
              onClick={() => navigate(routes.crisis)}
              className="border border-track short:min-h-11 short:py-2.5 short-wide:flex-1"
            >
              <HeartHandshake size={18} className="shrink-0" />
              {HANDOFF_LABEL}
            </Button>

            <Button
              type="button"
              variant="ghost"
              full={false}
              onClick={() => navigate(routes.assessment)}
              className="enabled:hover:text-brand short:min-h-11 short:py-2.5 short-wide:flex-1"
            >
              <ClipboardList size={18} className="shrink-0" />
              {ASSESS_LABEL}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});
