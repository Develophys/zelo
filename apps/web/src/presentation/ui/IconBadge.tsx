import type { ComponentType } from "react";

interface IconBadgeProps {
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  size?: number;
  tone?: "brand" | "danger" | "neutral";
}

const TONE_CLASS: Record<NonNullable<IconBadgeProps["tone"]>, string> = {
  brand: "bg-surface-brand text-brand",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-canvas-alt text-muted",
};

export function IconBadge({ icon: Icon, size = 38, tone = "brand" }: IconBadgeProps) {
  return (
    <div
      data-testid="icon-badge"
      className={`flex items-center justify-center rounded-icon ${TONE_CLASS[tone]}`}
      style={{ width: size, height: size }}
    >
      <Icon aria-hidden="true" size={Math.round(size * 0.55)} />
    </div>
  );
}
