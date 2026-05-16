"use client";

import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { pipelineListOptions } from "@multica/core/pipelines/queries";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import type { Pipeline, ListPipelinesResponse } from "@multica/core/types";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { PageHeader } from "../../layout/page-header";
import { WorkspaceAvatar } from "../../workspace/workspace-avatar";
import { AppLink } from "../../navigation";
import { PipelineStatusBadge } from "./pipeline-status-badge";

export function PipelinesPage() {
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();
  const { data, isLoading } = useQuery(pipelineListOptions(wsId));

  const typedData = data as ListPipelinesResponse | undefined;
  const pipelines: Pipeline[] = typedData?.pipelines ?? [];

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader className="gap-1.5">
        <WorkspaceAvatar name={workspace?.name ?? "W"} size="sm" />
        <span className="text-sm font-medium">Pipelines</span>
      </PageHeader>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <GitBranch className="size-10 opacity-40" />
            <p className="text-sm">No pipelines yet</p>
            <p className="text-xs">
              Pipelines are created automatically when triage produces multiple tasks
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {pipelines.map((pipeline: Pipeline) => (
              <AppLink
                key={pipeline.id}
                href={paths.pipelineDetail(pipeline.id)}
                className="flex items-center gap-4 px-6 py-4 hover:bg-accent/50 transition-colors"
              >
                <GitBranch className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Pipeline
                    </span>
                    <PipelineStatusBadge status={pipeline.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created{" "}
                    {new Date(pipeline.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </AppLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
