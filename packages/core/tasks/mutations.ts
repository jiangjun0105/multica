import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { planningTaskKeys, TASK_PAGE_SIZE } from "./queries";
import {
  addTaskToBuckets,
  findTaskLocation,
  getTaskBucket,
  patchTaskInBuckets,
  removeTaskFromBuckets,
  setTaskBucket,
} from "./cache-helpers";
import { useWorkspaceId } from "../hooks";
import type {
  PlanningTask,
  PlanningTaskStatus,
  CreatePlanningTaskRequest,
  UpdatePlanningTaskRequest,
  ListPlanningTasksCache,
} from "../types";

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

export function useCreatePlanningTask() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreatePlanningTaskRequest) => api.createPlanningTask(data),
    onSuccess: (newTask) => {
      qc.setQueryData<ListPlanningTasksCache>(planningTaskKeys.list(wsId), (old) =>
        old ? addTaskToBuckets(old, newTask) : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: planningTaskKeys.list(wsId) });
    },
  });
}

export function useUpdatePlanningTask() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdatePlanningTaskRequest) =>
      api.updatePlanningTask(id, data),
    onMutate: ({ id, ...data }) => {
      qc.cancelQueries({ queryKey: planningTaskKeys.list(wsId) });
      const prevList = qc.getQueryData<ListPlanningTasksCache>(planningTaskKeys.list(wsId));
      const prevDetail = qc.getQueryData<PlanningTask>(planningTaskKeys.detail(wsId, id));

      qc.setQueryData<ListPlanningTasksCache>(planningTaskKeys.list(wsId), (old) =>
        old ? patchTaskInBuckets(old, id, data) : old,
      );
      qc.setQueryData<PlanningTask>(planningTaskKeys.detail(wsId, id), (old) =>
        old ? { ...old, ...data } : old,
      );
      return { prevList, prevDetail, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList) qc.setQueryData(planningTaskKeys.list(wsId), ctx.prevList);
      if (ctx?.prevDetail)
        qc.setQueryData(planningTaskKeys.detail(wsId, ctx.id), ctx.prevDetail);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: planningTaskKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: planningTaskKeys.list(wsId) });
    },
  });
}

export function useDeletePlanningTask() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deletePlanningTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: planningTaskKeys.list(wsId) });
      const prevList = qc.getQueryData<ListPlanningTasksCache>(planningTaskKeys.list(wsId));
      qc.setQueryData<ListPlanningTasksCache>(planningTaskKeys.list(wsId), (old) =>
        old ? removeTaskFromBuckets(old, id) : old,
      );
      qc.removeQueries({ queryKey: planningTaskKeys.detail(wsId, id) });
      return { prevList };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(planningTaskKeys.list(wsId), ctx.prevList);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: planningTaskKeys.list(wsId) });
    },
  });
}
