"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  MarkerType,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import type { PlanningTask, PlanningTaskStatus, TaskDependency } from "@multica/core/types";
import { useWorkspacePaths } from "@multica/core/paths";
import { AppLink } from "../../navigation";

import "@xyflow/react/dist/style.css";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;

// ---------------------------------------------------------------------------
// Status visuals — DAG-local. Mirrors auto-agent admin DAGStepNode so the
// two pipelines look the same. Pending+draft uses a quieter treatment than
// pending+ready so reviewers can tell "still being planned" from "ready to
// run".
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<PlanningTaskStatus, string> = {
  pending: "Pending",
  in_progress: "Running",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const STATUS_BG: Record<PlanningTaskStatus, string> = {
  done: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40",
  in_progress: "border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/40",
  pending: "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40",
  blocked: "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/40",
  cancelled: "border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800",
};

const DRAFT_BG =
  "border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900";

// Edge stroke color reflects the source (prerequisite) task's status.
const STATUS_EDGE: Record<PlanningTaskStatus, string> = {
  done: "#10b981",
  in_progress: "#3b82f6",
  pending: "#f59e0b",
  blocked: "#ef4444",
  cancelled: "#a8a29e",
};

const DRAFT_EDGE = "#d6d3d1";

function StatusIcon({ status }: { status: PlanningTaskStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "in_progress":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "blocked":
    case "cancelled":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="h-4 w-4 text-stone-300 dark:text-stone-600" />;
  }
}

function backgroundFor(task: PlanningTask): string {
  if (task.status === "pending" && task.is_draft) return DRAFT_BG;
  return STATUS_BG[task.status];
}

function edgeColorFor(task: PlanningTask | undefined): string {
  if (!task) return DRAFT_EDGE;
  if (task.status === "pending" && task.is_draft) return DRAFT_EDGE;
  return STATUS_EDGE[task.status];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layoutDag(nodes: Node[], edges: Edge[]): { nodes: Node[]; height: number } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  return { nodes: layoutedNodes, height: g.graph().height ?? 0 };
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

function TaskNode({ data }: NodeProps) {
  const task = data.task as PlanningTask;
  const paths = useWorkspacePaths();
  const isRunning = task.status === "in_progress";

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-stone-400 !w-2 !h-2" />
      <AppLink
        href={paths.taskDetail(task.id)}
        className={cn(
          "block w-[240px] rounded-xl border px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md overflow-hidden",
          backgroundFor(task),
          isRunning && "ring-2 ring-blue-300/50 dark:ring-blue-700/50",
        )}
        style={{ height: NODE_HEIGHT }}
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={task.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">
                #{task.number}
              </span>
              <span className="truncate text-xs font-medium">{task.title}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] capitalize text-muted-foreground">
                {STATUS_LABEL[task.status]}
              </span>
              {task.is_draft && (
                <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  · draft
                </span>
              )}
            </div>
          </div>
        </div>
      </AppLink>
      <Handle type="source" position={Position.Bottom} className="!bg-stone-400 !w-2 !h-2" />
    </>
  );
}

const nodeTypes = { task: TaskNode };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PipelineDagProps {
  tasks: PlanningTask[];
  dependencies: TaskDependency[];
}

export function PipelineDag({ tasks, dependencies }: PipelineDagProps) {
  const { layoutedNodes, layoutedEdges, graphHeight } = useMemo(() => {
    const tasksById = new Map(tasks.map((t) => [t.id, t]));

    const nodes: Node[] = tasks.map((task) => ({
      id: task.id,
      type: "task",
      data: { task },
      position: { x: 0, y: 0 },
    }));

    // Pipeline transitions in multica are user-driven (no agent auto-advances
    // between tasks), so all edges are styled as "manual" — dashed with a
    // small label, matching the auto-agent admin DAG convention.
    const edges: Edge[] = dependencies.map((dep, i) => {
      const sourceTask = tasksById.get(dep.depends_on_task_id);
      const targetTask = tasksById.get(dep.task_id);
      const color = edgeColorFor(sourceTask);

      return {
        id: `e-${i}`,
        source: dep.depends_on_task_id,
        target: dep.task_id,
        animated: targetTask?.status === "in_progress",
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: "6 3",
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
        label: "⏸ manual",
        labelStyle: { fontSize: 10, fill: "#78716c" },
        labelBgStyle: { fill: "transparent" },
      };
    });

    const { nodes: laidOut, height } = layoutDag(nodes, edges);
    return { layoutedNodes: laidOut, layoutedEdges: edges, graphHeight: height };
  }, [tasks, dependencies]);

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No tasks in this pipeline
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-lg border bg-background"
      style={{ height: Math.max(240, graphHeight + 80) }}
    >
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
