"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, XCircle } from "lucide-react";
import { pipelineDetailOptions } from "@multica/core/pipelines/queries";
import { useCancelPipeline } from "@multica/core/pipelines/mutations";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import type { Pipeline, PlanningTask, TaskDependency } from "@multica/core/types";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { Button } from "@multica/ui/components/ui/button";
import { PageHeader } from "../../layout/page-header";
import { WorkspaceAvatar } from "../../workspace/workspace-avatar";
import { AppLink } from "../../navigation";
import { PipelineStatusBadge } from "./pipeline-status-badge";
import { PipelineDag } from "./pipeline-dag";

interface PipelineDetailProps {
  pipelineId: string;
}

export function PipelineDetail({ pipelineId }: PipelineDetailProps) {
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();
  const cancelPipeline = useCancelPipeline();

  const { data: pipeline, isLoading } = useQuery(pipelineDetailOptions(wsId, pipelineId));

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Pipeline not found
      </div>
    );
  }

  const typedPipeline = pipeline as Pipeline;
  const tasks: PlanningTask[] = typedPipeline.tasks ?? [];
  const dependencies: TaskDependency[] = typedPipeline.dependencies ?? [];
  const canCancel = typedPipeline.status !== "completed" && typedPipeline.status !== "cancelled";

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader className="gap-1.5">
        <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
        <AppLink
          href={paths.pipelines()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Pipelines
        </AppLink>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-sm font-medium truncate">Pipeline</span>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLink
              href={paths.pipelines()}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </AppLink>
            <h1 className="text-lg font-semibold">Pipeline</h1>
            <PipelineStatusBadge status={typedPipeline.status} />
          </div>
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelPipeline.mutate(pipelineId)}
              disabled={cancelPipeline.isPending}
            >
              <XCircle className="size-3.5 mr-1.5" />
              Cancel Pipeline
            </Button>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </span>
          <span>
            Created{" "}
            {new Date(typedPipeline.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {typedPipeline.issue_id && (
            <AppLink
              href={paths.issueDetail(typedPipeline.issue_id)}
              className="text-primary hover:underline"
            >
              View Issue
            </AppLink>
          )}
        </div>

        <PipelineDag tasks={tasks} dependencies={dependencies} />

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Tasks</h2>
          <div className="divide-y rounded-lg border">
            {tasks.map((task: PlanningTask) => (
              <AppLink
                key={task.id}
                href={paths.taskDetail(task.id)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <span className="text-xs text-muted-foreground font-mono w-10">
                  #{task.number}
                </span>
                <span className="flex-1 text-sm truncate">{task.title}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {task.status.replace("_", " ")}
                </span>
              </AppLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
