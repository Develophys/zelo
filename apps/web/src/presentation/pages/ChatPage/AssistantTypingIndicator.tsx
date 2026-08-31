import { OTHER_BUBBLE } from '@/presentation/ui/message-bubble';

export function AssistantTypingIndicator() {
  return (
    <div
      aria-hidden="true"
      data-testid="assistant-typing"
      className={`flex items-center gap-1.5 ${OTHER_BUBBLE} p-[15px_17px] text-brand`}
    >
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{ animationDelay: `${dot * 0.15}s` }}
          className="motion-essential animate-letter-wave h-1.5 w-1.5 rounded-full bg-current"
        />
      ))}
    </div>
  );
}
