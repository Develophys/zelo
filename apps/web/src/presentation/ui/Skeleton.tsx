interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  // motion-essential, like the spinner and the typing dots: the universal
  // reduced-motion kill would otherwise leave a skeleton perfectly static,
  // removing the only signal that anything is loading.
  return (
    <div
      data-testid="skeleton"
      className={["motion-essential animate-pulse bg-line", className].join(" ")}
    />
  );
}
