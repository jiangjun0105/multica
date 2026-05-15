import type { PlanningTask } from "@multica/core/types";
import { TASK_PRIORITY_ORDER } from "@multica/core/tasks/config";
import type { TaskSortField, TaskSortDirection } from "@multica/core/tasks/stores/view-store";

const PRIORITY_RANK: Record<string, number> = Object.fromEntries(
  TASK_PRIORITY_ORDER.map((p, i) => [p, i]),
);

export function sortTasks(
  tasks: PlanningTask[],
  field: TaskSortField | string,
  direction: TaskSortDirection | string,
): PlanningTask[] {
  const sorted = [...tasks].sort((a, b) => {
    switch (field) {
      case "priority":
        return (
          (PRIORITY_RANK[a.priority] ?? 99) -
          (PRIORITY_RANK[b.priority] ?? 99)
        );
      case "created_at":
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      case "title":
        return a.title.localeCompare(b.title);
      case "position":
      default:
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}
