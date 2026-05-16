import { describe, it, expect } from "vitest";
import type {
  PlanningTask,
  PlanningTaskStatus,
  ListPlanningTasksCache,
} from "../types";
import {
  getTaskBucket,
  setTaskBucket,
  findTaskLocation,
  addTaskToBuckets,
  removeTaskFromBuckets,
  patchTaskInBuckets,
} from "./cache-helpers";

function makeTask(
  id: string,
  status: PlanningTaskStatus,
  overrides: Partial<PlanningTask> = {},
): PlanningTask {
  return {
    id,
    workspace_id: "ws-1",
    number: 1,
    title: `Task ${id}`,
    description: "",
    status,
    priority: "medium",
    creator_type: "member",
    creator_id: "user-1",
    is_draft: false,
    transition_mode: "manual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCache(
  entries: [PlanningTaskStatus, PlanningTask[]][],
): ListPlanningTasksCache {
  const byStatus: ListPlanningTasksCache["byStatus"] = {};
  for (const [status, tasks] of entries) {
    byStatus[status] = { tasks, total: tasks.length };
  }
  return { byStatus };
}

describe("getTaskBucket", () => {
  it("returns the bucket for a status", () => {
    const task = makeTask("t1", "pending");
    const cache = makeCache([["pending", [task]]]);
    const bucket = getTaskBucket(cache, "pending");
    expect(bucket.tasks).toHaveLength(1);
    expect(bucket.tasks[0]!.id).toBe("t1");
  });

  it("returns an empty bucket for missing status", () => {
    const cache = makeCache([]);
    const bucket = getTaskBucket(cache, "done");
    expect(bucket.tasks).toHaveLength(0);
    expect(bucket.total).toBe(0);
  });
});

describe("setTaskBucket", () => {
  it("replaces the bucket for a status", () => {
    const cache = makeCache([["pending", [makeTask("t1", "pending")]]]);
    const newTask = makeTask("t2", "pending");
    const updated = setTaskBucket(cache, "pending", {
      tasks: [newTask],
      total: 1,
    });
    expect(updated.byStatus.pending!.tasks[0]!.id).toBe("t2");
  });
});

describe("findTaskLocation", () => {
  it("finds a task in the correct bucket", () => {
    const cache = makeCache([
      ["pending", [makeTask("t1", "pending")]],
      ["in_progress", [makeTask("t2", "in_progress")]],
    ]);
    const loc = findTaskLocation(cache, "t2");
    expect(loc).not.toBeNull();
    expect(loc!.status).toBe("in_progress");
    expect(loc!.task.id).toBe("t2");
  });

  it("returns null for missing task", () => {
    const cache = makeCache([["pending", [makeTask("t1", "pending")]]]);
    expect(findTaskLocation(cache, "missing")).toBeNull();
  });
});

describe("addTaskToBuckets", () => {
  it("adds a task to its status bucket", () => {
    const cache = makeCache([["pending", []]]);
    const task = makeTask("t1", "pending");
    const updated = addTaskToBuckets(cache, task);
    expect(updated.byStatus.pending!.tasks).toHaveLength(1);
    expect(updated.byStatus.pending!.total).toBe(1);
  });

  it("does not duplicate an existing task", () => {
    const task = makeTask("t1", "pending");
    const cache = makeCache([["pending", [task]]]);
    const updated = addTaskToBuckets(cache, task);
    expect(updated.byStatus.pending!.tasks).toHaveLength(1);
  });

  it("creates a bucket if status did not exist", () => {
    const cache = makeCache([]);
    const task = makeTask("t1", "in_progress");
    const updated = addTaskToBuckets(cache, task);
    expect(updated.byStatus.in_progress!.tasks).toHaveLength(1);
    expect(updated.byStatus.in_progress!.total).toBe(1);
  });
});

describe("removeTaskFromBuckets", () => {
  it("removes a task and decrements total", () => {
    const cache = makeCache([
      ["pending", [makeTask("t1", "pending"), makeTask("t2", "pending")]],
    ]);
    const updated = removeTaskFromBuckets(cache, "t1");
    expect(updated.byStatus.pending!.tasks).toHaveLength(1);
    expect(updated.byStatus.pending!.tasks[0]!.id).toBe("t2");
    expect(updated.byStatus.pending!.total).toBe(1);
  });

  it("is a no-op for missing task", () => {
    const cache = makeCache([["pending", [makeTask("t1", "pending")]]]);
    const updated = removeTaskFromBuckets(cache, "missing");
    expect(updated).toBe(cache);
  });
});

describe("patchTaskInBuckets", () => {
  it("updates a task in place when status does not change", () => {
    const cache = makeCache([
      ["pending", [makeTask("t1", "pending", { title: "Old" })]],
    ]);
    const updated = patchTaskInBuckets(cache, "t1", { title: "New" });
    expect(updated.byStatus.pending!.tasks[0]!.title).toBe("New");
  });

  it("moves a task between buckets when status changes", () => {
    const cache = makeCache([
      ["pending", [makeTask("t1", "pending")]],
      ["in_progress", []],
    ]);
    const updated = patchTaskInBuckets(cache, "t1", {
      status: "in_progress",
    });
    expect(updated.byStatus.pending!.tasks).toHaveLength(0);
    expect(updated.byStatus.pending!.total).toBe(0);
    expect(updated.byStatus.in_progress!.tasks).toHaveLength(1);
    expect(updated.byStatus.in_progress!.tasks[0]!.status).toBe("in_progress");
    expect(updated.byStatus.in_progress!.total).toBe(1);
  });

  it("is a no-op for missing task", () => {
    const cache = makeCache([["pending", []]]);
    const updated = patchTaskInBuckets(cache, "missing", { title: "X" });
    expect(updated).toBe(cache);
  });
});
