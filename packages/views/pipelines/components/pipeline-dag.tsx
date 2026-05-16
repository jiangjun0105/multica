"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  BaseEdge,
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
// Status visuals (unchanged)
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
// ELK gives much better placement and routing than dagre for DAGs with many
// cross-rank edges. We use the 'layered' algorithm with BRANDES_KOEPF node
// placement (aligns nodes along their longest connected paths) and
// ORTHOGONAL edge routing.
//
// ELK is async: layout(graph) returns a promise. We run it in a useEffect
// and keep the laid-out nodes in state.
// ---------------------------------------------------------------------------

const elk = new ELK();

const ELK_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  // Tight spacing — we'd rather scroll a little than waste horizontal
  // whitespace.
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "24",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "12",
  // NETWORK_SIMPLEX packs nodes tighter than BRANDES_KOEPF (which leaves
  // gaps to keep edges straight). Combined with post-compaction this
  // produces a much tighter bounding box and better vertical alignment of
  // siblings under their parents.
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.crossingMinimization.semiInteractive": "false",
  // Post-compaction: after placement, slide each component as close to
  // the others as it can go without colliding.
  "elk.layered.compaction.postCompaction.strategy": "LEFT_RIGHT_CONNECTION_LOCKING",
  "elk.layered.compaction.connectedComponents": "true",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.mergeEdges": "true",
  // Higher thoroughness → more iterations of crossing-min and placement.
  // 100 is the max useful value; default is 7.
  "elk.layered.thoroughness": "100",
};

interface ElkPoint {
  x: number;
  y: number;
}

async function layoutWithElk(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; edgePoints: Map<string, ElkPoint[]>; height: number }> {
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

  // Capture per-edge bend points so the custom edge renderer can draw the
  // exact path ELK computed (rather than React Flow drawing its own).
  const edgePoints = new Map<string, ElkPoint[]>();
  for (const e of result.edges ?? []) {
    const section = e.sections?.[0];
    if (!section) continue;
    const pts: ElkPoint[] = [
      { x: section.startPoint.x, y: section.startPoint.y },
      ...(section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
      { x: section.endPoint.x, y: section.endPoint.y },
    ];
    edgePoints.set(e.id, pts);
  }

  const laidOut = nodes.map((node) => ({
    ...node,
    position: positionsById.get(node.id) ?? { x: 0, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  }));

  return { nodes: laidOut, edgePoints, height: result.height ?? 0 };
}

// Build a smooth SVG path from ELK's bend points using Catmull-Rom-style
// cubic Beziers. Looks more organic than a polyline but stays in the lanes
// ELK chose.
function bendPointsToSvgPath(points: ElkPoint[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0]!.x},${points[0]!.y} L ${points[1]!.x},${points[1]!.y}`;
  }
  const tension = 0.5;
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  let d = `M ${p(0).x},${p(0).y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
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
// Custom edge — draws the path ELK computed (instead of React Flow's
// built-in smoothstep/bezier ignoring it).
// ---------------------------------------------------------------------------

interface ElkEdgeData {
  points: ElkPoint[];
}

function ElkEdge({ id, data, markerEnd, style, animated }: EdgeProps) {
  const edgeData = data as ElkEdgeData | undefined;
  const points = edgeData?.points ?? [];
  if (points.length < 2) return null;
  return (
    <BaseEdge
      id={id}
      path={bendPointsToSvgPath(points)}
      markerEnd={markerEnd}
      style={style}
      className={animated ? "react-flow__edge-path animated" : undefined}
    />
  );
}

const edgeTypes: EdgeTypes = { elk: ElkEdge };

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

    const edges: Edge[] = dependencies.map((dep, i) => {
      const sourceTask = tasksById.get(dep.depends_on_task_id);
      const targetTask = tasksById.get(dep.task_id);
      const color = edgeColorFor(sourceTask);
      const isManual = sourceTask?.transition_mode !== "auto";

      return {
        id: `e-${i}`,
        source: dep.depends_on_task_id,
        target: dep.task_id,
        // Custom edge — renders the path ELK computed (SPLINES routing).
        type: "elk",
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
        // Attach each edge's bend points (from ELK) to its data so the
        // custom ElkEdge component can draw the right path.
        const edgesWithPoints = edges.map((e) => ({
          ...e,
          data: { points: result.edgePoints.get(e.id) ?? [] },
        }));
        setLayout({ nodes: result.nodes, edges: edgesWithPoints, height: result.height });
      })
      .catch((err) => {
        console.error("ELK layout failed", err);
        if (cancelled) return;
        // Fallback: render nodes stacked vertically so the page is still
        // usable if layout fails for some reason.
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
    // ELK is still computing — keep the container at a reasonable size so
    // the page doesn't jump when the diagram appears.
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
        edgeTypes={edgeTypes}
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
