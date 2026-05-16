export type PlanningTaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "blocked"
  | "cancelled";

export type PlanningTaskPriority = "high" | "medium" | "low";

export type PlanningTaskSuitability =
  | "auto_agent_ready"
  | "needs_design"
  | "needs_human"
  | "unknown";

export interface PlanningTask {
  id: string;
  workspace_id: string;
  number: number;
  title: string;
  description: string;
  status: PlanningTaskStatus;
  priority: PlanningTaskPriority;
  suitability?: PlanningTaskSuitability | null;
  branch?: string | null;
  pr?: string | null;
  manual_test?: string | null;
  issue_id?: string | null;
  current_run_id?: string | null;
  pipeline_id?: string | null;
  // A task is a draft while its plan is being authored; agents do not pick up
  // drafts. Defaults to false. See multica migration 081.
  is_draft: boolean;
  creator_type: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanningTaskRequest {
  title: string;
  description?: string;
  status?: PlanningTaskStatus;
  priority?: PlanningTaskPriority;
  suitability?: PlanningTaskSuitability;
  issue_id?: string;
}

export interface UpdatePlanningTaskRequest {
  title?: string;
  description?: string;
  status?: PlanningTaskStatus;
  priority?: PlanningTaskPriority;
  suitability?: PlanningTaskSuitability | null;
  branch?: string | null;
  pr?: string | null;
  manual_test?: string | null;
  issue_id?: string | null;
  current_run_id?: string | null;
  position?: number;
}

export interface ListPlanningTasksParams {
  limit?: number;
  offset?: number;
  status?: PlanningTaskStatus;
  priority?: PlanningTaskPriority;
  issue_id?: string;
}

export interface ListPlanningTasksResponse {
  tasks: PlanningTask[];
  total: number;
}

export interface PlanningTaskStatusBucket {
  tasks: PlanningTask[];
  total: number;
}

export interface ListPlanningTasksCache {
  byStatus: Partial<Record<PlanningTaskStatus, PlanningTaskStatusBucket>>;
}

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
  type: "blocks" | "blocked_by" | "related";
}
