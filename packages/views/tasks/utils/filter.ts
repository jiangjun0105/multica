import type { PlanningTask, PlanningTaskStatus, PlanningTaskPriority } from "@multica/core/types";

export interface TaskFilters {
  statusFilters: PlanningTaskStatus[];
  priorityFilters: PlanningTaskPriority[];
}

export function filterTasks(tasks: PlanningTask[], filters: TaskFilters): PlanningTask[] {
  const { statusFilters, priorityFilters } = filters;

  return tasks.filter((task) => {
    if (statusFilters.length > 0 && !statusFilters.includes(task.status))
      return false;

    if (priorityFilters.length > 0 && !priorityFilters.includes(task.priority))
      return false;

    return true;
  });
}
