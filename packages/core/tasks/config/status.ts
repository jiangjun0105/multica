import type { PlanningTaskStatus } from "../../types";

export const TASK_STATUS_ORDER: PlanningTaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
  "cancelled",
];

export const ALL_TASK_STATUSES: PlanningTaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
  "cancelled",
];

export const TASK_BOARD_STATUSES: PlanningTaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
];

export const TASK_STATUS_CONFIG: Record<
  PlanningTaskStatus,
  {
    label: string;
    iconColor: string;
    hoverBg: string;
    dividerColor: string;
    columnBg: string;
  }
> = {
  pending: { label: "Pending", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent", dividerColor: "bg-muted-foreground/40", columnBg: "bg-muted/40" },
  in_progress: { label: "In Progress", iconColor: "text-warning", hoverBg: "hover:bg-warning/10", dividerColor: "bg-warning", columnBg: "bg-warning/5" },
  done: { label: "Done", iconColor: "text-info", hoverBg: "hover:bg-info/10", dividerColor: "bg-info", columnBg: "bg-info/5" },
  blocked: { label: "Blocked", iconColor: "text-destructive", hoverBg: "hover:bg-destructive/10", dividerColor: "bg-destructive", columnBg: "bg-destructive/5" },
  cancelled: { label: "Cancelled", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent", dividerColor: "bg-muted-foreground/40", columnBg: "bg-muted/40" },
};
