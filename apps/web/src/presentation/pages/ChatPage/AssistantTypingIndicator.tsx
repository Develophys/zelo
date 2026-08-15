export function AssistantTypingIndicator() {
  return (
    <div
      aria-hidden="true"
      data-testid="assistant-typing"
      className="flex items-center gap-1.5 self-start rounded-[20px] rounded-bl-md bg-surface p-[15px_17px] text-muted shadow-card"
    >
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{ animationDelay: `${dot * 0.15}s` }}
          className="animate-letter-wave h-1.5 w-1.5 rounded-full bg-current"
        />
      ))}
    </div>
  );
}
