"use client";

import { Eye, MoreHorizontal, EyeOff, Plus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import type { PlanningTask, PlanningTaskStatus } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@multica/ui/components/ui/dropdown-menu";
import { TASK_STATUS_CONFIG } from "@multica/core/tasks/config";
import { useLoadMoreTasksByStatus } from "@multica/core/tasks/queries";
import { useTaskViewStore } from "@multica/core/tasks/stores/view-store";
import { useModalStore } from "@multica/core/modals";
import { sortTasks } from "../utils/sort";
import { TaskStatusIcon } from "./task-status-icon";
import { TaskStatusHeading } from "./task-status-heading";
import { TaskBoardCardContent, DraggableTaskBoardCard } from "./task-board-card";
import { InfiniteScrollSentinel } from "../../issues/components/infinite-scroll-sentinel";
import { EntityBoardView, EntityBoardColumn } from "../../entity-board";

export function TaskBoardView({
  tasks,
  visibleStatuses,
  hiddenStatuses,
  onMoveTask,
}: {
  tasks: PlanningTask[];
  visibleStatuses: PlanningTaskStatus[];
  hiddenStatuses: PlanningTaskStatus[];
  onMoveTask: (
    taskId: string,
    newStatus: PlanningTaskStatus,
    newPosition?: number,
  ) => void;
}) {
  const sortBy = useTaskViewStore((s) => s.sortBy);
  const sortDirection = useTaskViewStore((s) => s.sortDirection);

  return (
    <EntityBoardView<PlanningTask, PlanningTaskStatus>
      entities={tasks}
      visibleStatuses={visibleStatuses}
      hiddenStatuses={hiddenStatuses}
      onMoveEntity={onMoveTask}
      sortEntities={sortTasks}
      sortBy={sortBy}
      sortDirection={sortDirection}
      renderColumn={(status, entityIds, entityMap) => (
        <PaginatedTaskColumn
          status={status}
          taskIds={entityIds}
          taskMap={entityMap}
        />
      )}
      renderDragOverlay={(task) => <TaskBoardCardContent task={task} />}
      renderHiddenColumns={(statuses) => (
        <HiddenTaskColumnsPanel hiddenStatuses={statuses} />
      )}
    />
  );
}

function PaginatedTaskColumn({
  status,
  taskIds,
  taskMap,
}: {
  status: PlanningTaskStatus;
  taskIds: string[];
  taskMap: Map<string, PlanningTask>;
}) {
  const { loadMore, hasMore, isLoading, total } = useLoadMoreTasksByStatus(status);

  const cfg = TASK_STATUS_CONFIG[status];

  return (
    <EntityBoardColumn<PlanningTask>
      status={status}
      entityIds={taskIds}
      entityMap={taskMap}
      totalCount={total}
      footer={
        hasMore ? (
          <InfiniteScrollSentinel onVisible={loadMore} loading={isLoading} />
        ) : undefined
      }
      columnBg={cfg.columnBg}
      heading={<TaskStatusHeading status={status} count={total ?? taskIds.length} />}
      headerActions={
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => useTaskViewStore.getState().hideStatus(status)}>
                <EyeOff className="size-3.5" />
                Hide column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground"
                  onClick={() => useModalStore.getState().open("create-task", { status })}
                >
                  <Plus className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Add task</TooltipContent>
          </Tooltip>
        </div>
      }
      renderCard={(task) => <DraggableTaskBoardCard task={task} />}
      emptyLabel="No tasks"
    />
  );
}

function HiddenTaskColumnsPanel({
  hiddenStatuses,
}: {
  hiddenStatuses: PlanningTaskStatus[];
}) {
  return (
    <div className="flex w-[240px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-medium text-muted-foreground">
          Hidden columns
        </span>
      </div>
      <div className="flex-1 space-y-0.5">
        {hiddenStatuses.map((status) => (
          <HiddenTaskColumnRow key={status} status={status} />
        ))}
      </div>
    </div>
  );
}

function HiddenTaskColumnRow({ status }: { status: PlanningTaskStatus }) {
  const cfg = TASK_STATUS_CONFIG[status];
  const { total } = useLoadMoreTasksByStatus(status);
  return (
    <div className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-muted/50">
      <div className="flex items-center gap-2">
        <TaskStatusIcon status={status} className="h-3.5 w-3.5" />
        <span className="text-sm">{cfg.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{total}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => useTaskViewStore.getState().showStatus(status)}
            >
              <Eye className="size-3.5" />
              Show column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
