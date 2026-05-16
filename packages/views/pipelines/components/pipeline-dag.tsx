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
import { cn } from "@multica/ui/lib/utils";
import type { PlanningTask, PlanningTaskStatus, TaskDependency } from "@multica/core/types";
import { useWorkspacePaths } from "@multica/core/paths";
import { AppLink } from "../../navigation";

import "@xyflow/react/dist/style.css";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 72;

// ---------------------------------------------------------------------------
// Status colors (DAG-local — does not affect TASK_STATUS_CONFIG used by the
// task board).
//
// done           → green
// in_progress    → blue
// pending+draft  → white (still being authored)
// pending        → yellow (ready, waiting)
// blocked        → red
// cancelled      → muted
// ---------------------------------------------------------------------------

interface DagColors {
  border: string; // tailwind class for the node border
  bg: string; // tailwind class for the node background
  dot: string; // tailwind class for the status dot
  edge: string; // raw color for SVG stroke / arrowhead
}

const STATUS_COLORS: Record<PlanningTaskStatus, DagColors> = {
  done: {
    border: "border-emerald-300 dark:border-emerald-700",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    dot: "bg-emerald-500",
    edge: "#10b981",
  },
  in_progress: {
    border: "border-blue-300 dark:border-blue-700",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    dot: "bg-blue-500",
    edge: "#3b82f6",
  },
  pending: {
    border: "border-amber-300 dark:border-amber-700",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    dot: "bg-amber-500",
    edge: "#f59e0b",
  },
  blocked: {
    border: "border-red-300 dark:border-red-700",
    bg: "bg-red-50 dark:bg-red-950/40",
    dot: "bg-red-500",
    edge: "#ef4444",
  },
  cancelled: {
    border: "border-stone-300 dark:border-stone-700",
    bg: "bg-stone-50 dark:bg-stone-900",
    dot: "bg-stone-400",
    edge: "#a8a29e",
  },
};

const DRAFT_COLORS: DagColors = {
  border: "border-stone-200 dark:border-stone-700",
  bg: "bg-white dark:bg-stone-900",
  dot: "bg-stone-300",
  edge: "#d6d3d1",
};

function colorsForTask(task: PlanningTask): DagColors {
  if (task.status === "pending" && task.is_draft) {
    return DRAFT_COLORS;
  }
  return STATUS_COLORS[task.status];
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
  const colors = colorsForTask(task);

  return (
    <div
      className={cn(
        "w-[240px] rounded-lg border shadow-sm overflow-hidden",
        colors.border,
        colors.bg,
      )}
      style={{ height: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <AppLink
        href={paths.taskDetail(task.id)}
        className="block size-full p-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("size-2 rounded-full shrink-0", colors.dot)} />
          <span className="text-xs text-muted-foreground font-mono">#{task.number}</span>
          {task.is_draft && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              draft
            </span>
          )}
        </div>
        <p className="text-sm font-medium leading-tight line-clamp-2 break-words">{task.title}</p>
      </AppLink>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
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

    // Edge color reflects the *source* (prerequisite) task's status so the
    // graph reads as "is this dependency satisfied?".
    const edges: Edge[] = dependencies.map((dep, i) => {
      const source = tasksById.get(dep.depends_on_task_id);
      const color = source ? colorsForTask(source).edge : "#d6d3d1";
      return {
        id: `e-${i}`,
        source: dep.depends_on_task_id,
        target: dep.task_id,
        style: { stroke: color, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
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
