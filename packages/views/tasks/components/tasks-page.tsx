"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ChevronRight, ClipboardList } from "lucide-react";
import type { PlanningTaskStatus } from "@multica/core/types";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useTaskViewStore } from "@multica/core/tasks/stores/view-store";
import { TASK_BOARD_STATUSES } from "@multica/core/tasks/config";
import { useCurrentWorkspace } from "@multica/core/paths";
import { WorkspaceAvatar } from "../../workspace/workspace-avatar";
import { useWorkspaceId } from "@multica/core/hooks";
import { planningTaskListOptions } from "@multica/core/tasks/queries";
import { useUpdatePlanningTask } from "@multica/core/tasks/mutations";
import { filterTasks } from "../utils/filter";
import { PageHeader } from "../../layout/page-header";
import { TasksHeader } from "./tasks-header";
import { TaskBoardView } from "./task-board-view";

export function TasksPage() {
  const wsId = useWorkspaceId();
  const { data: allTasks = [], isLoading: loading } = useQuery(planningTaskListOptions(wsId));

  const workspace = useCurrentWorkspace();
  const statusFilters = useTaskViewStore((s) => s.statusFilters);
  const priorityFilters = useTaskViewStore((s) => s.priorityFilters);

  const tasks = useMemo(
    () => filterTasks(allTasks, { statusFilters, priorityFilters }),
    [allTasks, statusFilters, priorityFilters],
  );

  const visibleStatuses = useMemo(() => {
    if (statusFilters.length > 0)
      return TASK_BOARD_STATUSES.filter((s) => statusFilters.includes(s));
    return TASK_BOARD_STATUSES;
  }, [statusFilters]);

  const hiddenStatuses = useMemo(() => {
    return TASK_BOARD_STATUSES.filter((s) => !visibleStatuses.includes(s));
  }, [visibleStatuses]);

  const updateTaskMutation = useUpdatePlanningTask();
  const handleMoveTask = useCallback(
    (taskId: string, newStatus: PlanningTaskStatus, newPosition?: number) => {
      const updates: Partial<{ status: PlanningTaskStatus; position: number }> = {
        status: newStatus,
      };
      if (newPosition !== undefined) updates.position = newPosition;

      updateTaskMutation.mutate(
        { id: taskId, ...updates },
        { onError: () => toast.error("Failed to move task") },
      );
    },
    [updateTaskMutation],
  );

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-14 rounded-md" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex min-w-52 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader className="gap-1.5">
        <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
        <span className="text-sm text-muted-foreground">
          {workspace?.name ?? "Workspace"}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm font-medium">Tasks</span>
      </PageHeader>

      <TasksHeader />

      {allTasks.length === 0 ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 text-muted-foreground">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm">No tasks yet</p>
          <p className="text-xs">Create a task to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <TaskBoardView
            tasks={tasks}
            visibleStatuses={visibleStatuses}
            hiddenStatuses={hiddenStatuses}
            onMoveTask={handleMoveTask}
          />
        </div>
      )}
    </div>
  );
}
