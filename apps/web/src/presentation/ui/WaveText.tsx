interface WaveTextProps {
  text: string;
  className?: string;
}

const STAGGER_MS = 60;

export function WaveText({ text, className = "" }: WaveTextProps) {
  return (
    <span data-testid="wave-text" className={className}>
      <span className="sr-only">{text}</span>
      <span data-testid="wave-text-letters" aria-hidden="true" className="whitespace-pre">
        {[...text].map((char, index) => (
          <span
            key={index}
            className="animate-letter-wave"
            style={{ animationDelay: `${index * STAGGER_MS}ms` }}
          >
            {char}
          </span>
        ))}
      </span>
    </span>
  );
}
