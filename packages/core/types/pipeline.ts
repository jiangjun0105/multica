import type { PlanningTask, TaskDependency } from "./planning-task";

export type PipelineStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Pipeline {
  id: string;
  workspace_id: string;
  issue_id: string;
  status: PipelineStatus;
  creator_type: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
  tasks?: PlanningTask[];
  dependencies?: TaskDependency[];
}

export interface ListPipelinesParams {
  limit?: number;
  offset?: number;
}

export interface ListPipelinesResponse {
  pipelines: Pipeline[];
  total: number;
}
