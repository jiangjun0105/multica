"use client";

import { memo } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlanningTask, IssuePriority } from "@multica/core/types";
import { TASK_PRIORITY_CONFIG } from "@multica/core/tasks/config";
import { useTaskViewStore } from "@multica/core/tasks/stores/view-store";
import { PriorityIcon } from "../../issues/components/priority-icon";

const SUITABILITY_LABELS: Record<string, string> = {
  auto_agent_ready: "Agent Ready",
  needs_design: "Needs Design",
  needs_human: "Needs Human",
  unknown: "Unknown",
};

export const TaskBoardCardContent = memo(function TaskBoardCardContent({
  task,
}: {
  task: PlanningTask;
}) {
  const cardProperties = useTaskViewStore((s) => s.cardProperties);
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority];

  const showPriority = cardProperties.priority;
  const showDescription = cardProperties.description && task.description;
  const showSuitability = cardProperties.suitability && task.suitability;

  return (
    <div className="rounded-lg border-[0.5px] border-border bg-card py-3 px-2.5 shadow-[0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)] transition-colors group-hover/card:border-accent group-hover/card:bg-accent group-data-[popup-open]/card:border-accent group-data-[popup-open]/card:bg-accent">
      <p className="text-xs text-muted-foreground">TASK-{task.number}</p>

      <p className="mt-1 text-sm font-medium leading-snug line-clamp-2">
        {task.title}
      </p>

      {showDescription && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
          {task.description}
        </p>
      )}

      {(showPriority || showSuitability) && (
        <div className="mt-3 flex items-center gap-2">
          {showPriority && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${priorityCfg.badgeBg} ${priorityCfg.badgeText}`}
            >
              <PriorityIcon priority={task.priority as IssuePriority} className="h-3 w-3" inheritColor />
              {priorityCfg.label}
            </span>
          )}
          {showSuitability && task.suitability && (
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {SUITABILITY_LABELS[task.suitability] ?? task.suitability}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

export const DraggableTaskBoardCard = memo(function DraggableTaskBoardCard({
  task,
}: {
  task: PlanningTask;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { status: task.status },
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group/card ${isDragging ? "opacity-30" : ""}`}
    >
      <TaskBoardCardContent task={task} />
    </div>
  );
});
