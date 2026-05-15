"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PlanningTaskStatus, PlanningTaskPriority } from "../../types";
import { ALL_TASK_STATUSES } from "../config";
import { createWorkspaceAwareStorage, registerForWorkspaceRehydration } from "../../platform/workspace-storage";
import { defaultStorage } from "../../platform/storage";

export type TaskViewMode = "board" | "list";
export type TaskSortField = "priority" | "created_at" | "title";
export type TaskSortDirection = "asc" | "desc";

export interface TaskCardProperties {
  priority: boolean;
  description: boolean;
  suitability: boolean;
}

export const TASK_SORT_OPTIONS: { value: TaskSortField; label: string }[] = [
  { value: "created_at", label: "Created date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
];

export const TASK_CARD_PROPERTY_OPTIONS: { key: keyof TaskCardProperties; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "description", label: "Description" },
  { key: "suitability", label: "Suitability" },
];

export interface TaskViewState {
  viewMode: TaskViewMode;
  statusFilters: PlanningTaskStatus[];
  priorityFilters: PlanningTaskPriority[];
  sortBy: TaskSortField;
  sortDirection: TaskSortDirection;
  cardProperties: TaskCardProperties;
  listCollapsedStatuses: PlanningTaskStatus[];
  setViewMode: (mode: TaskViewMode) => void;
  toggleStatusFilter: (status: PlanningTaskStatus) => void;
  togglePriorityFilter: (priority: PlanningTaskPriority) => void;
  hideStatus: (status: PlanningTaskStatus) => void;
  showStatus: (status: PlanningTaskStatus) => void;
  clearFilters: () => void;
  setSortBy: (field: TaskSortField) => void;
  setSortDirection: (dir: TaskSortDirection) => void;
  toggleCardProperty: (key: keyof TaskCardProperties) => void;
  toggleListCollapsed: (status: PlanningTaskStatus) => void;
}

const taskViewStoreSlice = (set: { (partial: Partial<TaskViewState> | ((state: TaskViewState) => Partial<TaskViewState>)): void }): TaskViewState => ({
  viewMode: "board",
  statusFilters: [],
  priorityFilters: [],
  sortBy: "created_at",
  sortDirection: "asc",
  cardProperties: {
    priority: true,
    description: true,
    suitability: true,
  },
  listCollapsedStatuses: [],

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleStatusFilter: (status) =>
    set((state) => ({
      statusFilters: state.statusFilters.includes(status)
        ? state.statusFilters.filter((s) => s !== status)
        : [...state.statusFilters, status],
    })),
  togglePriorityFilter: (priority) =>
    set((state) => ({
      priorityFilters: state.priorityFilters.includes(priority)
        ? state.priorityFilters.filter((p) => p !== priority)
        : [...state.priorityFilters, priority],
    })),
  hideStatus: (status) =>
    set((state) => {
      if (state.statusFilters.length === 0) {
        return { statusFilters: ALL_TASK_STATUSES.filter((s) => s !== status) };
      }
      return {
        statusFilters: state.statusFilters.filter((s) => s !== status),
      };
    }),
  showStatus: (status) =>
    set((state) => {
      if (state.statusFilters.length === 0) return state;
      if (state.statusFilters.includes(status)) return state;
      return { statusFilters: [...state.statusFilters, status] };
    }),
  clearFilters: () =>
    set({
      statusFilters: [],
      priorityFilters: [],
    }),
  setSortBy: (field) => set({ sortBy: field }),
  setSortDirection: (dir) => set({ sortDirection: dir }),
  toggleCardProperty: (key) =>
    set((state) => ({
      cardProperties: {
        ...state.cardProperties,
        [key]: !state.cardProperties[key],
      },
    })),
  toggleListCollapsed: (status) =>
    set((state) => ({
      listCollapsedStatuses: state.listCollapsedStatuses.includes(status)
        ? state.listCollapsedStatuses.filter((s) => s !== status)
        : [...state.listCollapsedStatuses, status],
    })),
});

export const useTaskViewStore = create<TaskViewState>()(
  persist(taskViewStoreSlice, {
    name: "multica_tasks_view",
    storage: createJSONStorage(() => createWorkspaceAwareStorage(defaultStorage)),
    partialize: (state: TaskViewState) => ({
      viewMode: state.viewMode,
      statusFilters: state.statusFilters,
      priorityFilters: state.priorityFilters,
      sortBy: state.sortBy,
      sortDirection: state.sortDirection,
      cardProperties: state.cardProperties,
      listCollapsedStatuses: state.listCollapsedStatuses,
    }),
    merge: (persisted: unknown, current: TaskViewState): TaskViewState => {
      const p = (persisted ?? {}) as Partial<TaskViewState>;
      return {
        ...current,
        ...p,
        cardProperties: {
          ...current.cardProperties,
          ...(p.cardProperties ?? {}),
        },
      };
    },
  }),
);

registerForWorkspaceRehydration(() => useTaskViewStore.persist.rehydrate());
