"use client";

import { Eye, MoreHorizontal } from "lucide-react";
import type { Issue, IssueStatus } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { useLoadMoreByStatus } from "@multica/core/issues/mutations";
import type { MyIssuesFilter } from "@multica/core/issues/queries";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@multica/ui/components/ui/dropdown-menu";
import { STATUS_CONFIG } from "@multica/core/issues/config";
import { useViewStoreApi, useViewStore } from "@multica/core/issues/stores/view-store-context";
import { sortIssues } from "../utils/sort";
import { StatusIcon } from "./status-icon";
import { BoardColumn } from "./board-column";
import { BoardCardContent } from "./board-card";
import { InfiniteScrollSentinel } from "./infinite-scroll-sentinel";
import type { ChildProgress } from "./list-row";
import { EntityBoardView } from "../../entity-board";

const EMPTY_PROGRESS_MAP = new Map<string, ChildProgress>();

export function BoardView({
  issues,
  visibleStatuses,
  hiddenStatuses,
  onMoveIssue,
  childProgressMap = EMPTY_PROGRESS_MAP,
  myIssuesScope,
  myIssuesFilter,
}: {
  issues: Issue[];
  visibleStatuses: IssueStatus[];
  hiddenStatuses: IssueStatus[];
  onMoveIssue: (
    issueId: string,
    newStatus: IssueStatus,
    newPosition?: number
  ) => void;
  childProgressMap?: Map<string, ChildProgress>;
  myIssuesScope?: string;
  myIssuesFilter?: MyIssuesFilter;
}) {
  const sortBy = useViewStore((s) => s.sortBy);
  const sortDirection = useViewStore((s) => s.sortDirection);
  const myIssuesOpts = myIssuesScope
    ? { scope: myIssuesScope, filter: myIssuesFilter ?? {} }
    : undefined;

  return (
    <EntityBoardView<Issue, IssueStatus>
      entities={issues}
      visibleStatuses={visibleStatuses}
      hiddenStatuses={hiddenStatuses}
      onMoveEntity={onMoveIssue}
      sortEntities={sortIssues}
      sortBy={sortBy}
      sortDirection={sortDirection}
      renderColumn={(status, entityIds, entityMap) => (
        <PaginatedBoardColumn
          status={status}
          issueIds={entityIds}
          issueMap={entityMap}
          childProgressMap={childProgressMap}
          myIssuesOpts={myIssuesOpts}
        />
      )}
      renderDragOverlay={(issue) => (
        <BoardCardContent issue={issue} childProgress={childProgressMap.get(issue.id)} />
      )}
      renderHiddenColumns={(statuses) => (
        <HiddenColumnsPanel
          hiddenStatuses={statuses}
          myIssuesOpts={myIssuesOpts}
        />
      )}
    />
  );
}

function PaginatedBoardColumn({
  status,
  issueIds,
  issueMap,
  childProgressMap,
  myIssuesOpts,
}: {
  status: IssueStatus;
  issueIds: string[];
  issueMap: Map<string, Issue>;
  childProgressMap?: Map<string, ChildProgress>;
  myIssuesOpts?: { scope: string; filter: MyIssuesFilter };
}) {
  const { loadMore, hasMore, isLoading, total } = useLoadMoreByStatus(
    status,
    myIssuesOpts,
  );
  return (
    <BoardColumn
      status={status}
      issueIds={issueIds}
      issueMap={issueMap}
      childProgressMap={childProgressMap}
      totalCount={total}
      footer={
        hasMore ? (
          <InfiniteScrollSentinel onVisible={loadMore} loading={isLoading} />
        ) : undefined
      }
    />
  );
}

function HiddenColumnsPanel({
  hiddenStatuses,
  myIssuesOpts,
}: {
  hiddenStatuses: IssueStatus[];
  myIssuesOpts?: { scope: string; filter: MyIssuesFilter };
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
          <HiddenColumnRow
            key={status}
            status={status}
            myIssuesOpts={myIssuesOpts}
          />
        ))}
      </div>
    </div>
  );
}

function HiddenColumnRow({
  status,
  myIssuesOpts,
}: {
  status: IssueStatus;
  myIssuesOpts?: { scope: string; filter: MyIssuesFilter };
}) {
  const cfg = STATUS_CONFIG[status];
  const viewStoreApi = useViewStoreApi();
  const { total } = useLoadMoreByStatus(status, myIssuesOpts);
  return (
    <div className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-muted/50">
      <div className="flex items-center gap-2">
        <StatusIcon status={status} className="h-3.5 w-3.5" />
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
              onClick={() => viewStoreApi.getState().showStatus(status)}
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
