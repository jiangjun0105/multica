import type {
  PlanningTask,
  PlanningTaskStatus,
  PlanningTaskStatusBucket,
  ListPlanningTasksCache,
} from "../types";
import { TASK_BOARD_STATUSES } from "./config";

const EMPTY_BUCKET: PlanningTaskStatusBucket = { tasks: [], total: 0 };

export function getTaskBucket(
  resp: ListPlanningTasksCache,
  status: PlanningTaskStatus,
): PlanningTaskStatusBucket {
  return resp.byStatus[status] ?? EMPTY_BUCKET;
}

export function setTaskBucket(
  resp: ListPlanningTasksCache,
  status: PlanningTaskStatus,
  bucket: PlanningTaskStatusBucket,
): ListPlanningTasksCache {
  return { ...resp, byStatus: { ...resp.byStatus, [status]: bucket } };
}

export function findTaskLocation(
  resp: ListPlanningTasksCache,
  id: string,
): { status: PlanningTaskStatus; task: PlanningTask } | null {
  for (const status of TASK_BOARD_STATUSES) {
    const bucket = resp.byStatus[status];
    const found = bucket?.tasks.find((t) => t.id === id);
    if (found) return { status, task: found };
  }
  return null;
}

export function addTaskToBuckets(
  resp: ListPlanningTasksCache,
  task: PlanningTask,
): ListPlanningTasksCache {
  const bucket = getTaskBucket(resp, task.status);
  if (bucket.tasks.some((t) => t.id === task.id)) return resp;
  return setTaskBucket(resp, task.status, {
    tasks: [...bucket.tasks, task],
    total: bucket.total + 1,
  });
}

export function removeTaskFromBuckets(
  resp: ListPlanningTasksCache,
  id: string,
): ListPlanningTasksCache {
  const loc = findTaskLocation(resp, id);
  if (!loc) return resp;
  const bucket = getTaskBucket(resp, loc.status);
  return setTaskBucket(resp, loc.status, {
    tasks: bucket.tasks.filter((t) => t.id !== id),
    total: Math.max(0, bucket.total - 1),
  });
}

export function patchTaskInBuckets(
  resp: ListPlanningTasksCache,
  id: string,
  patch: Partial<PlanningTask>,
): ListPlanningTasksCache {
  const loc = findTaskLocation(resp, id);
  if (!loc) return resp;
  const merged: PlanningTask = { ...loc.task, ...patch };
  const nextStatus = patch.status ?? loc.status;

  if (nextStatus === loc.status) {
    const bucket = getTaskBucket(resp, loc.status);
    return setTaskBucket(resp, loc.status, {
      ...bucket,
      tasks: bucket.tasks.map((t) => (t.id === id ? merged : t)),
    });
  }

  const fromBucket = getTaskBucket(resp, loc.status);
  const toBucket = getTaskBucket(resp, nextStatus);
  let next = setTaskBucket(resp, loc.status, {
    tasks: fromBucket.tasks.filter((t) => t.id !== id),
    total: Math.max(0, fromBucket.total - 1),
  });
  next = setTaskBucket(next, nextStatus, {
    tasks: [...toBucket.tasks, merged],
    total: toBucket.total + 1,
  });
  return next;
}
