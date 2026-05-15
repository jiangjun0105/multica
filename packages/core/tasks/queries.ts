import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { PlanningTaskStatus, ListPlanningTasksCache } from "../types";
import { TASK_BOARD_STATUSES } from "./config";

export const planningTaskKeys = {
  all: (wsId: string) => ["planning-tasks", wsId] as const,
  list: (wsId: string) => [...planningTaskKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) =>
    [...planningTaskKeys.all(wsId), "detail", id] as const,
};

export const TASK_PAGE_SIZE = 50;

export const PAGINATED_TASK_STATUSES: readonly PlanningTaskStatus[] = TASK_BOARD_STATUSES;

export function flattenTaskBuckets(data: ListPlanningTasksCache) {
  const out = [];
  for (const status of PAGINATED_TASK_STATUSES) {
    const bucket = data.byStatus[status];
    if (bucket) out.push(...bucket.tasks);
  }
  return out;
}

async function fetchFirstTaskPages(): Promise<ListPlanningTasksCache> {
  const responses = await Promise.all(
    PAGINATED_TASK_STATUSES.map((status) =>
      api.listPlanningTasks({ status, limit: TASK_PAGE_SIZE, offset: 0 }),
    ),
  );
  const byStatus: ListPlanningTasksCache["byStatus"] = {};
  PAGINATED_TASK_STATUSES.forEach((status, i) => {
    const res = responses[i]!;
    byStatus[status] = { tasks: res.tasks, total: res.total };
  });
  return { byStatus };
}

export function planningTaskListOptions(wsId: string) {
  return queryOptions({
    queryKey: planningTaskKeys.list(wsId),
    queryFn: () => fetchFirstTaskPages(),
    select: flattenTaskBuckets,
  });
}

export function planningTaskDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: planningTaskKeys.detail(wsId, id),
    queryFn: () => api.getPlanningTask(id),
  });
}
