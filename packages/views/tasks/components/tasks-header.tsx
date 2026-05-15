"use client";

import { useMemo } from "react";
import { Filter, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@multica/ui/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@multica/ui/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import type { PlanningTaskStatus, PlanningTaskPriority } from "@multica/core/types";
import {
  TASK_STATUS_CONFIG,
  ALL_TASK_STATUSES,
  TASK_PRIORITY_CONFIG,
  TASK_PRIORITY_ORDER,
} from "@multica/core/tasks/config";
import { useTaskViewStore } from "@multica/core/tasks/stores/view-store";
import {
  TASK_SORT_OPTIONS,
  TASK_CARD_PROPERTY_OPTIONS,
} from "@multica/core/tasks/stores/view-store";
import { TaskStatusIcon } from "./task-status-icon";

export function TasksHeader() {
  const viewMode = useTaskViewStore((s) => s.viewMode);
  const setViewMode = useTaskViewStore((s) => s.setViewMode);
  const statusFilters = useTaskViewStore((s) => s.statusFilters);
  const priorityFilters = useTaskViewStore((s) => s.priorityFilters);
  const toggleStatusFilter = useTaskViewStore((s) => s.toggleStatusFilter);
  const togglePriorityFilter = useTaskViewStore((s) => s.togglePriorityFilter);
  const clearFilters = useTaskViewStore((s) => s.clearFilters);
  const sortBy = useTaskViewStore((s) => s.sortBy);
  const sortDirection = useTaskViewStore((s) => s.sortDirection);
  const setSortBy = useTaskViewStore((s) => s.setSortBy);
  const setSortDirection = useTaskViewStore((s) => s.setSortDirection);
  const cardProperties = useTaskViewStore((s) => s.cardProperties);
  const toggleCardProperty = useTaskViewStore((s) => s.toggleCardProperty);

  const activeFilterCount = useMemo(
    () => statusFilters.length + priorityFilters.length,
    [statusFilters, priorityFilters],
  );

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-1">
        {/* Filter */}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <Filter className="size-3" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-[10px] font-medium text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="start" className="w-56 p-2">
            <div className="space-y-2">
              <p className="px-1 text-xs font-medium text-muted-foreground">Status</p>
              {ALL_TASK_STATUSES.map((status: PlanningTaskStatus) => {
                const cfg = TASK_STATUS_CONFIG[status];
                return (
                  <label
                    key={status}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={statusFilters.includes(status)}
                      onChange={() => toggleStatusFilter(status)}
                      className="size-3.5 rounded border-border"
                    />
                    <TaskStatusIcon status={status} className="h-3 w-3" />
                    <span className="text-xs">{cfg.label}</span>
                  </label>
                );
              })}
              <div className="my-1 h-px bg-border" />
              <p className="px-1 text-xs font-medium text-muted-foreground">Priority</p>
              {TASK_PRIORITY_ORDER.map((priority: PlanningTaskPriority) => {
                const cfg = TASK_PRIORITY_CONFIG[priority];
                return (
                  <label
                    key={priority}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={priorityFilters.includes(priority)}
                      onChange={() => togglePriorityFilter(priority)}
                      className="size-3.5 rounded border-border"
                    />
                    <span className="text-xs">{cfg.label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="size-3" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Display settings */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                <SlidersHorizontal className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortBy}
              onValueChange={(v) => setSortBy(v as typeof sortBy)}
            >
              {TASK_SORT_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Direction</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortDirection}
              onValueChange={(v) => setSortDirection(v as typeof sortDirection)}
            >
              <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {viewMode === "board" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Card properties</DropdownMenuLabel>
                {TASK_CARD_PROPERTY_OPTIONS.map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.key}
                    checked={cardProperties[opt.key]}
                    onCheckedChange={() => toggleCardProperty(opt.key)}
                  >
                    {opt.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View toggle */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={viewMode === "board" ? "bg-accent text-foreground" : "text-muted-foreground"}
                onClick={() => setViewMode("board")}
              >
                <LayoutGrid className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Board view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground"}
                onClick={() => setViewMode("list")}
              >
                <List className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>List view</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
