import type { PlanningTaskStatus } from "@multica/core/types";
import { TASK_STATUS_CONFIG } from "@multica/core/tasks/config";
import { TaskStatusIcon } from "./task-status-icon";

export function TaskStatusHeading({
  status,
  count,
}: {
  status: PlanningTaskStatus;
  count: number;
}) {
  const cfg = TASK_STATUS_CONFIG[status];
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <TaskStatusIcon status={status} className="h-3 w-3" />
        {cfg.label}
      </span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}
