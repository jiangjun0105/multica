import { describe, it, expect } from "vitest";
import type { PlanningTask } from "@multica/core/types";
import { filterTasks } from "./filter";

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

describe("filterTasks", () => {
  const tasks: PlanningTask[] = [
    makeTask({ id: "t1", status: "pending", priority: "high" }),
    makeTask({ id: "t2", status: "in_progress", priority: "medium" }),
    makeTask({ id: "t3", status: "done", priority: "low" }),
    makeTask({ id: "t4", status: "pending", priority: "low" }),
  ];

  it("returns all tasks when no filters are active", () => {
    const result = filterTasks(tasks, { statusFilters: [], priorityFilters: [] });
    expect(result).toHaveLength(4);
  });

  it("filters by status", () => {
    const result = filterTasks(tasks, { statusFilters: ["pending"], priorityFilters: [] });
    expect(result.map((t) => t.id)).toEqual(["t1", "t4"]);
  });

  it("filters by multiple statuses", () => {
    const result = filterTasks(tasks, {
      statusFilters: ["pending", "done"],
      priorityFilters: [],
    });
    expect(result.map((t) => t.id)).toEqual(["t1", "t3", "t4"]);
  });

  it("filters by priority", () => {
    const result = filterTasks(tasks, { statusFilters: [], priorityFilters: ["high"] });
    expect(result.map((t) => t.id)).toEqual(["t1"]);
  });

  it("filters by multiple priorities", () => {
    const result = filterTasks(tasks, {
      statusFilters: [],
      priorityFilters: ["high", "low"],
    });
    expect(result.map((t) => t.id)).toEqual(["t1", "t3", "t4"]);
  });

  it("applies both status and priority filters (intersection)", () => {
    const result = filterTasks(tasks, {
      statusFilters: ["pending"],
      priorityFilters: ["low"],
    });
    expect(result.map((t) => t.id)).toEqual(["t4"]);
  });

  it("returns empty array when filters match nothing", () => {
    const result = filterTasks(tasks, {
      statusFilters: ["blocked"],
      priorityFilters: [],
    });
    expect(result).toHaveLength(0);
  });
});
