import type { PipelineStatus } from "../types";

export const PIPELINE_STATUS_CONFIG: Record<
  PipelineStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "text-muted-foreground", bg: "bg-muted" },
  running: { label: "Running", color: "text-warning", bg: "bg-warning/10" },
  completed: { label: "Completed", color: "text-info", bg: "bg-info/10" },
  failed: { label: "Failed", color: "text-destructive", bg: "bg-destructive/10" },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted" },
};
