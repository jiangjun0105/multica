"use client";

import { useCallback, useEffect, useState } from "react";
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
import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import type { PlanningTask, PlanningTaskStatus, TaskDependency } from "@multica/core/types";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../../navigation";

import "@xyflow/react/dist/style.css";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;

// ---------------------------------------------------------------------------
// Status visuals
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
// Layout — ELK
//
// ELK runs the 'layered' algorithm with NETWORK_SIMPLEX placement plus
// post-compaction for a tight bounding box and good sibling alignment.
// We only ask ELK for *node positions*; React Flow draws its own bezier
// edges between handles (matches the auto-agent admin DAG look).
// ---------------------------------------------------------------------------

const elk = new ELK();

const ELK_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "24",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "12",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.compaction.postCompaction.strategy": "LEFT_RIGHT_CONNECTION_LOCKING",
  "elk.layered.compaction.connectedComponents": "true",
  "elk.layered.mergeEdges": "true",
  "elk.layered.thoroughness": "100",
};

async function layoutWithElk(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; height: number }> {
  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: ELK_LAYOUT_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map<ElkExtendedEdge>((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const result = await elk.layout(elkGraph);

  const positionsById = new Map<string, { x: number; y: number }>();
  for (const child of result.children ?? []) {
    if (child.x != null && child.y != null) {
      positionsById.set(child.id, { x: child.x, y: child.y });
    }
  }

  const laidOut = nodes.map((node) => ({
    ...node,
    position: positionsById.get(node.id) ?? { x: 0, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return { nodes: laidOut, height: result.height ?? 0 };
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
      <a
        href={paths.taskDetail(task.id)}
        onClick={(e) => e.preventDefault()}
        className={cn(
          "block w-[240px] rounded-xl border px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md overflow-hidden cursor-pointer",
          backgroundFor(task),
          isRunning && "ring-2 ring-blue-300/50 dark:ring-blue-700/50",
        )}
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
      </a>
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

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  height: number;
}

export function PipelineDag({ tasks, dependencies }: PipelineDagProps) {
  const paths = useWorkspacePaths();
  const { push } = useNavigation();
  const [layout, setLayout] = useState<LayoutResult | null>(null);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      push(paths.taskDetail(node.id));
    },
    [push, paths],
  );

  useEffect(() => {
    let cancelled = false;
    const tasksById = new Map(tasks.map((t) => [t.id, t]));

    const nodes: Node[] = tasks.map((task) => ({
      id: task.id,
      type: "task",
      data: { task },
      position: { x: 0, y: 0 },
    }));

    // React Flow default edge type = bezier curves. Same shape the
    // auto-agent admin DAG uses; reads as a normal node graph.
    const edges: Edge[] = dependencies.map((dep, i) => {
      const sourceTask = tasksById.get(dep.depends_on_task_id);
      const targetTask = tasksById.get(dep.task_id);
      const color = edgeColorFor(sourceTask);
      const isManual = sourceTask?.transition_mode !== "auto";

      return {
        id: `e-${i}`,
        source: dep.depends_on_task_id,
        target: dep.task_id,
        animated: targetTask?.status === "in_progress",
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isManual ? "6 3" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
      };
    });

    layoutWithElk(nodes, edges)
      .then((result) => {
        if (cancelled) return;
        setLayout({ nodes: result.nodes, edges, height: result.height });
      })
      .catch((err) => {
        console.error("ELK layout failed", err);
        if (cancelled) return;
        const fallback = nodes.map((n, i) => ({
          ...n,
          position: { x: 0, y: i * (NODE_HEIGHT + 20) },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        }));
        setLayout({ nodes: fallback, edges, height: nodes.length * (NODE_HEIGHT + 20) });
      });

    return () => {
      cancelled = true;
    };
  }, [tasks, dependencies]);

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No tasks in this pipeline
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="flex items-center justify-center w-full h-[400px] rounded-lg border bg-background text-muted-foreground text-sm">
        Laying out graph…
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-lg border bg-background"
      style={{ height: Math.max(240, layout.height + 80) }}
    >
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
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
