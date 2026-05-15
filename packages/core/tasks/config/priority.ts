import type { PlanningTaskPriority } from "../../types";

export const TASK_PRIORITY_ORDER: PlanningTaskPriority[] = [
  "high",
  "medium",
  "low",
];

export const TASK_PRIORITY_CONFIG: Record<
  PlanningTaskPriority,
  { label: string; bars: number; color: string; badgeBg: string; badgeText: string }
> = {
  high: { label: "High", bars: 3, color: "text-warning", badgeBg: "bg-priority/80", badgeText: "text-white" },
  medium: { label: "Medium", bars: 2, color: "text-warning", badgeBg: "bg-priority/15", badgeText: "text-priority" },
  low: { label: "Low", bars: 1, color: "text-info", badgeBg: "bg-priority/10", badgeText: "text-priority" },
};
