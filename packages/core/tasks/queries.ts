import { useState, useCallback } from "react";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PlanningTaskStatus, ListPlanningTasksCache } from "../types";
import { TASK_BOARD_STATUSES } from "./config";
import { getTaskBucket, setTaskBucket } from "./cache-helpers";
import { useWorkspaceId } from "../hooks";

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

export function useLoadMoreTasksByStatus(status: PlanningTaskStatus) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  const [isLoading, setIsLoading] = useState(false);

  const queryKey = planningTaskKeys.list(wsId);
  const cache = qc.getQueryData<ListPlanningTasksCache>(queryKey);
  const bucket = cache?.byStatus[status];
  const loaded = bucket?.tasks.length ?? 0;
  const total = bucket?.total ?? 0;
  const hasMore = loaded < total;

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    try {
      const res = await api.listPlanningTasks({
        status,
        limit: TASK_PAGE_SIZE,
        offset: loaded,
      });
      qc.setQueryData<ListPlanningTasksCache>(queryKey, (old) => {
        if (!old) return old;
        const prev = getTaskBucket(old, status);
        const existingIds = new Set(prev.tasks.map((t) => t.id));
        const appended = res.tasks.filter((t) => !existingIds.has(t.id));
        return setTaskBucket(old, status, {
          tasks: [...prev.tasks, ...appended],
          total: res.total,
        });
      });
    } finally {
      setIsLoading(false);
    }
  }, [qc, queryKey, status, loaded, hasMore, isLoading]);

  return { loadMore, hasMore, isLoading, total };
}
