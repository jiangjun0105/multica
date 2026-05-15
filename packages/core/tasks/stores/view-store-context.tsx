"use client";

import { createContext, useContext } from "react";
import { useStore, type StoreApi } from "zustand";
import type { TaskViewState } from "./view-store";

const TaskViewStoreContext = createContext<StoreApi<TaskViewState> | null>(null);

export function TaskViewStoreProvider({
  store,
  children,
}: {
  store: StoreApi<TaskViewState>;
  children: React.ReactNode;
}) {
  return (
    <TaskViewStoreContext.Provider value={store}>
      {children}
    </TaskViewStoreContext.Provider>
  );
}

export function useTaskViewStoreFromContext<T>(selector: (state: TaskViewState) => T): T {
  const store = useContext(TaskViewStoreContext);
  if (!store)
    throw new Error("useTaskViewStoreFromContext must be used within TaskViewStoreProvider");
  return useStore(store, selector);
}

export function useTaskViewStoreApi(): StoreApi<TaskViewState> {
  const store = useContext(TaskViewStoreContext);
  if (!store)
    throw new Error("useTaskViewStoreApi must be used within TaskViewStoreProvider");
  return store;
}
