"use client";

import { ChevronLeft, ChevronRight, ExternalLink, GitBranch, Link2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { IssuePriority, TaskDependency } from "@multica/core/types";
import { TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from "@multica/core/tasks/config";
import { planningTaskDetailOptions, planningTaskDependenciesOptions, planningTaskListOptions } from "@multica/core/tasks/queries";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { Button } from "@multica/ui/components/ui/button";
import { PageHeader } from "../../layout/page-header";
import { WorkspaceAvatar } from "../../workspace/workspace-avatar";
import { AppLink } from "../../navigation";
import { useNavigation } from "../../navigation";
import { MemoizedMarkdown } from "../../common/markdown";
import { TaskStatusIcon } from "./task-status-icon";
import { PriorityIcon } from "../../issues/components/priority-icon";
import { PropRow } from "../../common/prop-row";

const SUITABILITY_LABELS: Record<string, string> = {
  auto_agent_ready: "Agent Ready",
  needs_design: "Needs Design",
  needs_human: "Needs Human",
  unknown: "Unknown",
};

interface TaskDetailProps {
  taskId: string;
}

export function TaskDetail({ taskId }: TaskDetailProps) {
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();
  const router = useNavigation();

  const { data: task, isLoading } = useQuery(planningTaskDetailOptions(wsId, taskId));
  const { data: deps = [] } = useQuery({
    ...planningTaskDependenciesOptions(wsId, taskId),
    enabled: !!task,
  });
  const { data: allTasks = [] } = useQuery(planningTaskListOptions(wsId));

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="hidden md:block w-72 border-l p-4 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>This task does not exist or has been deleted.</p>
        <Button variant="outline" size="sm" onClick={() => router.push(paths.tasks())}>
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  const statusCfg = TASK_STATUS_CONFIG[task.status];
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority];

  const depTaskMap = new Map(allTasks.map((t) => [t.id, t]));

  const dispatchUrl = task.current_run_id
    ? `https://app.soundingboard.io/runs/${task.current_run_id}`
    : null;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Header */}
      <PageHeader className="gap-1.5">
        <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
        <AppLink
          href={paths.tasks()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Tasks
        </AppLink>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-sm font-medium truncate">TASK-{task.number}</span>
      </PageHeader>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            <h1 className="text-lg font-semibold leading-tight">{task.title}</h1>

            {task.description && (
              <div className="mt-4 prose prose-sm dark:prose-invert max-w-none">
                <MemoizedMarkdown>{task.description}</MemoizedMarkdown>
              </div>
            )}

            {/* Dependencies */}
            {deps.length > 0 && (
              <div className="mt-8">
                <h3 className="text-xs font-medium text-muted-foreground mb-2">Dependencies</h3>
                <div className="space-y-1">
                  {deps.map((dep: TaskDependency) => {
                    const depTask = depTaskMap.get(dep.depends_on_task_id);
                    return (
                      <AppLink
                        key={`${dep.task_id}-${dep.depends_on_task_id}`}
                        href={paths.taskDetail(dep.depends_on_task_id)}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        {depTask && <TaskStatusIcon status={depTask.status} className="h-3.5 w-3.5 shrink-0" />}
                        <span className="text-xs text-muted-foreground shrink-0">
                          {dep.type === "blocked_by" ? "blocked by" : dep.type}
                        </span>
                        <span className="truncate">
                          {depTask ? `TASK-${depTask.number} ${depTask.title}` : dep.depends_on_task_id}
                        </span>
                      </AppLink>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden md:block w-72 shrink-0 border-l p-4 overflow-y-auto">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <PropRow label="Status" interactive={false}>
              <TaskStatusIcon status={task.status} className="h-3.5 w-3.5" />
              <span className={statusCfg.iconColor}>{statusCfg.label}</span>
            </PropRow>
            <PropRow label="Priority" interactive={false}>
              <PriorityIcon priority={task.priority as IssuePriority} className="h-3.5 w-3.5" inheritColor />
              <span className={priorityCfg.badgeText}>{priorityCfg.label}</span>
            </PropRow>
            {task.suitability && (
              <PropRow label="Suitability" interactive={false}>
                <span>{SUITABILITY_LABELS[task.suitability] ?? task.suitability}</span>
              </PropRow>
            )}
            {task.branch && (
              <PropRow label="Branch" interactive={false}>
                <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{task.branch}</span>
              </PropRow>
            )}
            {task.pr && (
              <PropRow label="PR" interactive={false}>
                <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                <a
                  href={task.pr}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-info hover:underline"
                >
                  {task.pr.split("/").pop()}
                </a>
              </PropRow>
            )}
          </div>

          {task.manual_test && (
            <div className="mt-6">
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Manual test</h4>
              <p className="text-xs text-foreground whitespace-pre-wrap">{task.manual_test}</p>
            </div>
          )}

          <div className="mt-6">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (dispatchUrl) {
                  window.open(dispatchUrl, "_blank");
                }
              }}
              disabled={!dispatchUrl}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Dispatch
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
