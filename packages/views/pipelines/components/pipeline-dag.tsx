"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { cn } from "@multica/ui/lib/utils";
import { TASK_STATUS_CONFIG } from "@multica/core/tasks/config";
import type { PlanningTask, TaskDependency } from "@multica/core/types";
import { useWorkspacePaths } from "@multica/core/paths";
import { AppLink } from "../../navigation";

import "@xyflow/react/dist/style.css";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 72;

function layoutDag(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

function TaskNode({ data }: NodeProps) {
  const task = data.task as PlanningTask;
  const paths = useWorkspacePaths();
  const cfg = TASK_STATUS_CONFIG[task.status];

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <AppLink
        href={paths.taskDetail(task.id)}
        className="block p-3 hover:bg-accent/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("size-2 rounded-full", cfg.iconColor.replace("text-", "bg-"))} />
          <span className="text-xs text-muted-foreground font-mono">
            #{task.number}
          </span>
        </div>
        <p className="text-sm font-medium leading-tight line-clamp-2">
          {task.title}
        </p>
      </AppLink>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

interface PipelineDagProps {
  tasks: PlanningTask[];
  dependencies: TaskDependency[];
}

export function PipelineDag({ tasks, dependencies }: PipelineDagProps) {
  const initialNodes: Node[] = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        type: "task",
        data: { task },
        position: { x: 0, y: 0 },
      })),
    [tasks],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      dependencies.map((dep, i) => ({
        id: `e-${i}`,
        source: dep.depends_on_task_id,
        target: dep.task_id,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border)" },
        style: { stroke: "var(--border)" },
      })),
    [dependencies],
  );

  const layoutedNodes = useMemo(
    () => layoutDag(initialNodes, initialEdges),
    [initialNodes, initialEdges],
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 0);
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No tasks in this pipeline
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full rounded-lg border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
