"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { BoardEntity, EntityBoardViewProps } from "./types";

function buildKanbanCollision(columnIds: Set<string>): CollisionDetection {
  return (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length > 0) {
      const cards = pointer.filter((c) => !columnIds.has(c.id as string));
      if (cards.length > 0) return cards;
    }
    return closestCenter(args);
  };
}

function buildColumns<T extends BoardEntity, S extends string>(
  entities: T[],
  visibleStatuses: S[],
  sortEntities: (entities: T[], sortBy: string, sortDirection: string) => T[],
  sortBy: string,
  sortDirection: string,
): Record<S, string[]> {
  const cols = {} as Record<S, string[]>;
  for (const status of visibleStatuses) {
    const sorted = sortEntities(
      entities.filter((e) => e.status === status),
      sortBy,
      sortDirection,
    );
    cols[status] = sorted.map((e) => e.id);
  }
  return cols;
}

function computePosition<T extends BoardEntity>(
  ids: string[],
  activeId: string,
  entityMap: Map<string, T>,
): number {
  const idx = ids.indexOf(activeId);
  if (idx === -1) return 0;
  const getPos = (id: string) => {
    const entity = entityMap.get(id);
    return entity?.position ?? ids.indexOf(id);
  };
  if (ids.length === 1) return getPos(activeId);
  if (idx === 0) return getPos(ids[1]!) - 1;
  if (idx === ids.length - 1) return getPos(ids[idx - 1]!) + 1;
  return (getPos(ids[idx - 1]!) + getPos(ids[idx + 1]!)) / 2;
}

function findColumn<S extends string>(
  columns: Record<S, string[]>,
  id: string,
  visibleStatuses: S[],
): S | null {
  if (visibleStatuses.includes(id as S)) return id as S;
  for (const [status, ids] of Object.entries(columns)) {
    if ((ids as string[]).includes(id)) return status as S;
  }
  return null;
}

export function EntityBoardView<T extends BoardEntity, S extends string>({
  entities,
  visibleStatuses,
  hiddenStatuses,
  onMoveEntity,
  sortEntities,
  sortBy,
  sortDirection,
  renderColumn,
  renderDragOverlay,
  renderHiddenColumns,
}: EntityBoardViewProps<T, S>) {
  const columnIds = useMemo(
    () => new Set<string>(visibleStatuses as string[]),
    [visibleStatuses],
  );
  const kanbanCollision = useMemo(
    () => buildKanbanCollision(columnIds),
    [columnIds],
  );

  const [activeEntity, setActiveEntity] = useState<T | null>(null);
  const isDraggingRef = useRef(false);

  const [columns, setColumns] = useState<Record<S, string[]>>(() =>
    buildColumns(entities, visibleStatuses, sortEntities, sortBy, sortDirection),
  );
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useEffect(() => {
    if (!isDraggingRef.current) {
      setColumns(buildColumns(entities, visibleStatuses, sortEntities, sortBy, sortDirection));
    }
  }, [entities, visibleStatuses, sortEntities, sortBy, sortDirection]);

  const recentlyMovedRef = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      recentlyMovedRef.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [columns]);

  const entityMap = useMemo(() => {
    const map = new Map<string, T>();
    for (const entity of entities) map.set(entity.id, entity);
    return map;
  }, [entities]);

  const entityMapRef = useRef(entityMap);
  if (!isDraggingRef.current) {
    entityMapRef.current = entityMap;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      isDraggingRef.current = true;
      const entity = entityMapRef.current.get(event.active.id as string) ?? null;
      setActiveEntity(entity);
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || recentlyMovedRef.current) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      setColumns((prev) => {
        const activeCol = findColumn(prev, activeId, visibleStatuses);
        const overCol = findColumn(prev, overId, visibleStatuses);
        if (!activeCol || !overCol || activeCol === overCol) return prev;

        recentlyMovedRef.current = true;
        const oldIds = prev[activeCol]!.filter((id) => id !== activeId);
        const newIds = [...prev[overCol]!];
        const overIndex = newIds.indexOf(overId);
        const insertIndex = overIndex >= 0 ? overIndex : newIds.length;
        newIds.splice(insertIndex, 0, activeId);
        return { ...prev, [activeCol]: oldIds, [overCol]: newIds };
      });
    },
    [visibleStatuses],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      isDraggingRef.current = false;
      setActiveEntity(null);

      const resetColumns = () =>
        setColumns(buildColumns(entities, visibleStatuses, sortEntities, sortBy, sortDirection));

      if (!over) {
        resetColumns();
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      const cols = columnsRef.current;
      const activeCol = findColumn(cols, activeId, visibleStatuses);
      const overCol = findColumn(cols, overId, visibleStatuses);
      if (!activeCol || !overCol) {
        resetColumns();
        return;
      }

      let finalColumns = cols;
      if (activeCol === overCol) {
        const ids = cols[activeCol]!;
        const oldIndex = ids.indexOf(activeId);
        const newIndex = ids.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(ids, oldIndex, newIndex);
          finalColumns = { ...cols, [activeCol]: reordered };
          setColumns(finalColumns);
        }
      }

      const finalCol = findColumn(finalColumns, activeId, visibleStatuses);
      if (!finalCol) {
        resetColumns();
        return;
      }

      const map = entityMapRef.current;
      const finalIds = finalColumns[finalCol]!;
      const newPosition = computePosition(finalIds, activeId, map);
      const currentEntity = map.get(activeId);

      if (
        currentEntity &&
        currentEntity.status === finalCol &&
        currentEntity.position === newPosition
      ) {
        return;
      }

      onMoveEntity(activeId, finalCol, newPosition);
    },
    [entities, visibleStatuses, sortEntities, sortBy, sortDirection, onMoveEntity],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto p-4">
        {visibleStatuses.map((status) => (
          <Fragment key={status}>
            {renderColumn(status, columns[status] ?? [], entityMapRef.current)}
          </Fragment>
        ))}

        {hiddenStatuses.length > 0 && renderHiddenColumns?.(hiddenStatuses)}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeEntity ? (
          <div className="w-[280px] rotate-2 scale-105 cursor-grabbing opacity-90 shadow-lg shadow-black/10">
            {renderDragOverlay(activeEntity)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
