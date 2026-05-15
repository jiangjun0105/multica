import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { planningTaskKeys } from "./queries";
import {
  addTaskToBuckets,
  patchTaskInBuckets,
  removeTaskFromBuckets,
} from "./cache-helpers";
import { useWorkspaceId } from "../hooks";
import type {
  PlanningTask,
  CreatePlanningTaskRequest,
  UpdatePlanningTaskRequest,
  ListPlanningTasksCache,
} from "../types";

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
