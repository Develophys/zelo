import { useApiHealth } from "@/presentation/hooks/useApiHealth";
import { useUiStore } from "@/stores/ui.store";

export function HealthBanner() {
  const { data, isLoading } = useApiHealth();
  const isDismissed = useUiStore((state) => state.isHealthBannerDismissed);
  const dismiss = useUiStore((state) => state.dismissHealthBanner);

  if (isDismissed || isLoading || !data) {
    return null;
  }

  return (
    <div className="flex items-center justify-between bg-canvas-alt p-2 text-caption text-muted">
      <span>api: {data.status}</span>
      <button onClick={dismiss} className="underline">
        dismiss
      </button>
    </div>
  );
}
