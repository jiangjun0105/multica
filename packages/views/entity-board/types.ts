import type { ReactNode } from "react";

export interface BoardEntity {
  id: string;
  status: string;
  position?: number;
}

export interface EntityStatusConfig {
  label: string;
  iconColor: string;
  columnBg: string;
}

export interface EntityBoardColumnProps<T extends BoardEntity> {
  status: string;
  entityIds: string[];
  entityMap: Map<string, T>;
  totalCount?: number;
  footer?: ReactNode;
  columnBg: string;
  heading: ReactNode;
  headerActions?: ReactNode;
  renderCard: (entity: T) => ReactNode;
  emptyLabel: string;
}

export interface EntityBoardViewProps<T extends BoardEntity, S extends string> {
  entities: T[];
  visibleStatuses: S[];
  hiddenStatuses: S[];
  onMoveEntity: (id: string, newStatus: S, newPosition?: number) => void;
  sortEntities: (entities: T[], sortBy: string, sortDirection: string) => T[];
  sortBy: string;
  sortDirection: string;
  renderColumn: (
    status: S,
    entityIds: string[],
    entityMap: Map<string, T>,
  ) => ReactNode;
  renderDragOverlay: (entity: T) => ReactNode;
  renderHiddenColumns?: (statuses: S[]) => ReactNode;
}
