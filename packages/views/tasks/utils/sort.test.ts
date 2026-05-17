import { describe, it, expect, vi } from "vitest";
import type { PlanningTask } from "@multica/core/types";

vi.mock("@multica/core/tasks/config", () => ({
  TASK_PRIORITY_ORDER: ["high", "medium", "low"],
}));

import { sortTasks } from "./sort";

function makeTask(overrides: Partial<PlanningTask> = {}): PlanningTask {
  return {
    id: "t1",
    workspace_id: "ws-1",
    number: 1,
    title: "Task",
    description: "",
    status: "pending",
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

describe("sortTasks", () => {
  const tasks: PlanningTask[] = [
    makeTask({ id: "t1", title: "Charlie", priority: "low", created_at: "2026-01-03T00:00:00Z" }),
    makeTask({ id: "t2", title: "Alice", priority: "high", created_at: "2026-01-01T00:00:00Z" }),
    makeTask({ id: "t3", title: "Bob", priority: "medium", created_at: "2026-01-02T00:00:00Z" }),
  ];

  it("sorts by created_at ascending (default)", () => {
    const sorted = sortTasks(tasks, "created_at", "asc");
    expect(sorted.map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("sorts by created_at descending", () => {
    const sorted = sortTasks(tasks, "created_at", "desc");
    expect(sorted.map((t) => t.id)).toEqual(["t1", "t3", "t2"]);
  });

  it("sorts by priority ascending (high first)", () => {
    const sorted = sortTasks(tasks, "priority", "asc");
    expect(sorted.map((t) => t.priority)).toEqual(["high", "medium", "low"]);
  });

  it("sorts by priority descending (low first)", () => {
    const sorted = sortTasks(tasks, "priority", "desc");
    expect(sorted.map((t) => t.priority)).toEqual(["low", "medium", "high"]);
  });

  it("sorts by title ascending", () => {
    const sorted = sortTasks(tasks, "title", "asc");
    expect(sorted.map((t) => t.title)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by title descending", () => {
    const sorted = sortTasks(tasks, "title", "desc");
    expect(sorted.map((t) => t.title)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("does not mutate the original array", () => {
    const original = [...tasks];
    sortTasks(tasks, "title", "asc");
    expect(tasks.map((t) => t.id)).toEqual(original.map((t) => t.id));
  });
});
