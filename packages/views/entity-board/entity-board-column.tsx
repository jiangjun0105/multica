"use client";

import { useMemo, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardEntity, EntityBoardColumnProps } from "./types";

export function EntityBoardColumn<T extends BoardEntity>({
  status,
  entityIds,
  entityMap,
  totalCount,
  footer,
  columnBg,
  heading,
  headerActions,
  renderCard,
  emptyLabel,
}: EntityBoardColumnProps<T>) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const resolvedEntities = useMemo(
    () =>
      entityIds.flatMap((id) => {
        const entity = entityMap.get(id);
        return entity ? [entity] : [];
      }),
    [entityIds, entityMap],
  );

  return (
    <div className={`flex w-[280px] shrink-0 flex-col rounded-xl ${columnBg} p-2`}>
      <div className="mb-2 flex items-center justify-between px-1.5">
        {heading}
        {headerActions}
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[200px] flex-1 space-y-2 overflow-y-auto rounded-lg p-1 transition-colors ${
          isOver ? "bg-accent/60" : ""
        }`}
      >
        <SortableContext items={entityIds} strategy={verticalListSortingStrategy}>
          {resolvedEntities.map((entity) => (
            <div key={entity.id}>{renderCard(entity)}</div>
          ))}
        </SortableContext>
        {entityIds.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}
