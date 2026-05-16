"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, XCircle } from "lucide-react";
import { pipelineDetailOptions } from "@multica/core/pipelines/queries";
import { useCancelPipeline } from "@multica/core/pipelines/mutations";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import type { Pipeline, PlanningTask, TaskDependency } from "@multica/core/types";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { Button } from "@multica/ui/components/ui/button";
import { cn } from "@multica/ui/lib/utils";
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

        <PipelineTaskSummary tasks={tasks} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task summary + drill-down list
// ---------------------------------------------------------------------------

type TaskFilter = "total" | "running" | "pending" | "draft";

interface PipelineTaskSummaryProps {
  tasks: PlanningTask[];
}

const FILTER_LABEL: Record<TaskFilter, string> = {
  total: "All tasks",
  running: "Running tasks",
  pending: "Pending tasks",
  draft: "Draft tasks",
};

function matchesFilter(task: PlanningTask, filter: TaskFilter): boolean {
  switch (filter) {
    case "total":
      return true;
    case "running":
      return task.status === "in_progress";
    case "pending":
      return task.status === "pending";
    case "draft":
      return task.is_draft;
  }
}

function PipelineTaskSummary({ tasks }: PipelineTaskSummaryProps) {
  const [activeFilter, setActiveFilter] = useState<TaskFilter | null>(null);
  const paths = useWorkspacePaths();

  const counts: Record<TaskFilter, number> = {
    total: tasks.length,
    running: tasks.filter((t) => matchesFilter(t, "running")).length,
    pending: tasks.filter((t) => matchesFilter(t, "pending")).length,
    draft: tasks.filter((t) => matchesFilter(t, "draft")).length,
  };

  // Clicking the active card again toggles the list closed.
  const toggle = (f: TaskFilter) =>
    setActiveFilter((current) => (current === f ? null : f));

  const filteredTasks = activeFilter
    ? tasks.filter((t) => matchesFilter(t, activeFilter))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat
          label="Total"
          value={counts.total}
          active={activeFilter === "total"}
          onClick={() => toggle("total")}
        />
        <SummaryStat
          label="Running"
          value={counts.running}
          tone="blue"
          active={activeFilter === "running"}
          onClick={() => toggle("running")}
        />
        <SummaryStat
          label="Pending"
          value={counts.pending}
          tone="amber"
          active={activeFilter === "pending"}
          onClick={() => toggle("pending")}
        />
        <SummaryStat
          label="Draft"
          value={counts.draft}
          tone="muted"
          active={activeFilter === "draft"}
          onClick={() => toggle("draft")}
        />
      </div>

      {activeFilter && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {FILTER_LABEL[activeFilter]} ({filteredTasks.length})
          </h2>
          {filteredTasks.length === 0 ? (
            <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground text-center">
              No tasks match this filter
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {filteredTasks.map((task) => (
                <AppLink
                  key={task.id}
                  href={paths.taskDetail(task.id)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <span className="text-xs text-muted-foreground font-mono w-10">
                    #{task.number}
                  </span>
                  <span className="flex-1 text-sm truncate">{task.title}</span>
                  {task.is_draft && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                      draft
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">
                    {task.status.replace("_", " ")}
                  </span>
                </AppLink>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "blue" | "amber" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const valueClass =
    tone === "blue"
      ? "text-blue-600 dark:text-blue-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";

  const ringClass = active
    ? tone === "blue"
      ? "ring-2 ring-blue-400 border-blue-400"
      : tone === "amber"
        ? "ring-2 ring-amber-400 border-amber-400"
        : tone === "muted"
          ? "ring-2 ring-stone-400 border-stone-400"
          : "ring-2 ring-foreground border-foreground"
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border bg-card px-4 py-3 text-left transition-shadow",
        "hover:shadow-sm hover:border-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ringClass,
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", valueClass)}>
        {value}
      </div>
    </button>
  );
}
