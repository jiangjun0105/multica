import type { PlanningTask, TaskDependency } from "./planning-task";

export type PipelineStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Pipeline {
  id: string;
  workspace_id: string;
  // Optional — a pipeline can be anchored to one issue (the triage flow) or
  // none (auto-agent bulk imports that span multiple issues).
  issue_id: string | null;
  status: PipelineStatus;
  creator_type: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
  tasks?: PlanningTask[];
  dependencies?: TaskDependency[];
}

export interface CreatePipelineTaskInput {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  suitability?: string | null;
  is_draft?: boolean;
  transition_mode?: "auto" | "manual";
  // Indices (zero-based) into the same `tasks` array. Each entry creates a
  // task_dependency edge: this task `depends_on` that task.
  depends_on?: number[];
}

export interface CreatePipelineRequest {
  issue_id?: string | null;
  status?: PipelineStatus;
  tasks: CreatePipelineTaskInput[];
}

export interface ListPipelinesParams {
  limit?: number;
  offset?: number;
}

export interface ListPipelinesResponse {
  pipelines: Pipeline[];
  total: number;
}
