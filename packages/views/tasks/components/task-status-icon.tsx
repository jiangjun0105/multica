"use client";

import type { PlanningTaskStatus } from "@multica/core/types";
import { TASK_STATUS_CONFIG } from "@multica/core/tasks/config";

function PendingIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

function InProgressIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" strokeOpacity="0.3" />
      <path
        d="M8 1.5 A6.5 6.5 0 0 1 14.5 8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DoneIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="6.5" fill={color} />
      <path d="M5.5 8l2 2 3.5-3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BlockedIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" />
      <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function CancelledIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ICON_MAP: Record<PlanningTaskStatus, React.FC<{ className?: string; color: string }>> = {
  pending: PendingIcon,
  in_progress: InProgressIcon,
  done: DoneIcon,
  blocked: BlockedIcon,
  cancelled: CancelledIcon,
};

export function TaskStatusIcon({
  status,
  className = "h-4 w-4",
}: {
  status: PlanningTaskStatus;
  className?: string;
}) {
  const Icon = ICON_MAP[status];
  const cfg = TASK_STATUS_CONFIG[status];
  return <Icon className={`${className} ${cfg.iconColor}`} color="currentColor" />;
}
