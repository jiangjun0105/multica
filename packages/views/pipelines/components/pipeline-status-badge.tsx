"use client";

import { cn } from "@multica/ui/lib/utils";
import { PIPELINE_STATUS_CONFIG } from "@multica/core/pipelines/config";
import type { PipelineStatus } from "@multica/core/types";

interface PipelineStatusBadgeProps {
  status: PipelineStatus;
  className?: string;
}

export function PipelineStatusBadge({ status, className }: PipelineStatusBadgeProps) {
  const cfg = PIPELINE_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        cfg.bg,
        cfg.color,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}
