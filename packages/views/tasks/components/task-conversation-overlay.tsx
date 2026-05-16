"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  Brain,
  AlertCircle,
  X,
  Loader2,
  ScrollText,
  FileText,
  Search,
  Terminal,
  Pencil,
} from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@multica/ui/components/ui/collapsible";
import { useScrollFade } from "@multica/ui/hooks/use-scroll-fade";
import { useAutoScroll } from "@multica/ui/hooks/use-auto-scroll";
import { taskMessagesOptions } from "@multica/core/chat/queries";
import { Markdown } from "../../common/markdown";
import type { TaskMessagePayload } from "@multica/core/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineItem {
  seq: number;
  type: "tool_use" | "tool_result" | "thinking" | "text" | "error";
  tool?: string;
  content?: string;
  input?: Record<string, unknown>;
  output?: string;
}

type OperationClass = "read" | "search" | "write" | "edit" | "bash" | "other";

interface TimelineSegment {
  kind: "text" | "tools";
  items: TimelineItem[];
}

interface ExploredRun {
  kind: "explored";
  opClass: OperationClass;
  items: TimelineItem[];
}

interface SingleOp {
  kind: "single";
  item: TimelineItem;
}

type SubGroup = ExploredRun | SingleOp;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPLORE_GROUP_MIN = 3;

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface TaskConversationOverlayProps {
  taskRunId: string;
  onClose: () => void;
}

export function TaskConversationOverlay({
  taskRunId,
  onClose,
}: TaskConversationOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fadeStyle = useScrollFade(scrollRef);
  useAutoScroll(scrollRef);

  const { data: rawMessages, isLoading } = useQuery(
    taskMessagesOptions(taskRunId),
  );

  const timeline = useMemo(
    () => (rawMessages ?? []).map(toTimelineItem).sort((a, b) => a.seq - b.seq),
    [rawMessages],
  );

  const segments = useMemo(() => segmentTimeline(timeline), [timeline]);

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3 shrink-0">
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Execution log</span>
        <span className="text-xs text-muted-foreground">
          {timeline.length > 0 && `${timeline.filter((i) => i.type === "tool_use").length} tool calls`}
        </span>
        <button
          onClick={onClose}
          className="ml-auto flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close transcript"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div ref={scrollRef} style={fadeStyle} className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading transcript…
          </div>
        ) : timeline.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No execution data recorded.
          </div>
        ) : (
          <div className="px-4 py-3 space-y-3">
            {segments.map((seg, i) =>
              seg.kind === "text" ? (
                <TextSegmentView key={seg.items[0]!.seq} items={seg.items} />
              ) : (
                <ToolSegmentView
                  key={seg.items[0]!.seq}
                  items={seg.items}
                  defaultOpen={i === segments.length - 1}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers: convert raw messages to timeline items
// ---------------------------------------------------------------------------

function toTimelineItem(m: TaskMessagePayload): TimelineItem {
  return {
    seq: m.seq,
    type: m.type,
    tool: m.tool,
    content: m.content,
    input: m.input,
    output: m.output,
  };
}

// ---------------------------------------------------------------------------
// Segmentation: split items into text vs tool groups
// ---------------------------------------------------------------------------

function segmentTimeline(items: TimelineItem[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let toolBuf: TimelineItem[] = [];
  let textBuf: TimelineItem[] = [];

  const flushTools = () => {
    if (toolBuf.length > 0) {
      segments.push({ kind: "tools", items: toolBuf });
      toolBuf = [];
    }
  };

  const flushText = () => {
    if (textBuf.length > 0) {
      segments.push({ kind: "text", items: textBuf });
      textBuf = [];
    }
  };

  for (const item of items) {
    if (item.type === "text") {
      flushTools();
      textBuf.push(item);
    } else {
      flushText();
      toolBuf.push(item);
    }
  }
  flushText();
  flushTools();
  return segments;
}

// ---------------------------------------------------------------------------
// Operation classification (ported from SB admin operationGroupUtils)
// ---------------------------------------------------------------------------

function classifyOperation(item: TimelineItem): OperationClass {
  const name = (item.tool ?? "").replace(/^mcp_[a-z_]+__/, "").toLowerCase();
  if (name === "read" || name === "read_file" || name === "cat") return "read";
  if (
    name === "grep" ||
    name === "glob" ||
    name === "search" ||
    name === "ripgrep" ||
    name.includes("grep") ||
    name.includes("search")
  )
    return "search";
  if (name === "write" || name === "write_file" || name.includes("write"))
    return "write";
  if (name === "edit" || name === "str_replace_editor" || name.includes("edit"))
    return "edit";
  if (
    name === "bash" ||
    name === "shell" ||
    name === "execute_command" ||
    name === "run_command"
  )
    return "bash";
  return "other";
}

// ---------------------------------------------------------------------------
// Sub-grouping: collapse 3+ consecutive same-class ops
// ---------------------------------------------------------------------------

function buildSubGroups(items: TimelineItem[]): SubGroup[] {
  const groups: SubGroup[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i]!;
    if (item.type !== "tool_use") {
      groups.push({ kind: "single", item });
      i++;
      continue;
    }

    const opClass = classifyOperation(item);
    let runEnd = i + 1;

    while (runEnd < items.length) {
      const next = items[runEnd]!;
      if (next.type === "tool_result") {
        runEnd++;
        continue;
      }
      if (next.type === "tool_use" && classifyOperation(next) === opClass) {
        runEnd++;
        continue;
      }
      break;
    }

    const toolUseCount = items
      .slice(i, runEnd)
      .filter((it) => it.type === "tool_use").length;

    if (toolUseCount >= EXPLORE_GROUP_MIN) {
      groups.push({
        kind: "explored",
        opClass,
        items: items.slice(i, runEnd),
      });
    } else {
      for (let j = i; j < runEnd; j++) {
        groups.push({ kind: "single", item: items[j]! });
      }
    }
    i = runEnd;
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return "…/" + parts.slice(-2).join("/");
}

function getToolSummary(item: TimelineItem): string {
  if (!item.input) return "";
  const inp = item.input as Record<string, string>;
  if (inp.query) return inp.query;
  if (inp.file_path) return shortenPath(inp.file_path);
  if (inp.path) return shortenPath(inp.path);
  if (inp.pattern) return inp.pattern;
  if (inp.description) return String(inp.description);
  if (inp.command) {
    const cmd = String(inp.command);
    return cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd;
  }
  if (inp.prompt) {
    const p = String(inp.prompt);
    return p.length > 100 ? p.slice(0, 100) + "…" : p;
  }
  if (inp.skill) return String(inp.skill);
  for (const v of Object.values(inp)) {
    if (typeof v === "string" && v.length > 0 && v.length < 120) return v;
  }
  return "";
}

function opClassLabel(cls: OperationClass, count: number): string {
  switch (cls) {
    case "read":
      return `Explored ${count} files`;
    case "search":
      return `Explored ${count} searches`;
    case "edit":
      return `Edited ${count} files`;
    case "write":
      return `Wrote ${count} files`;
    case "bash":
      return `Ran ${count} commands`;
    default:
      return `${count} operations`;
  }
}

function opClassIcon(cls: OperationClass) {
  switch (cls) {
    case "read":
      return <FileText className="h-3 w-3" />;
    case "search":
      return <Search className="h-3 w-3" />;
    case "edit":
      return <Pencil className="h-3 w-3" />;
    case "write":
      return <FileText className="h-3 w-3" />;
    case "bash":
      return <Terminal className="h-3 w-3" />;
    default:
      return null;
  }
}

function extractCompactLabel(item: TimelineItem): string | undefined {
  if (!item.input) return undefined;
  const inp = item.input as Record<string, string>;
  if (inp.file_path) {
    const name = inp.file_path.split("/").pop() ?? inp.file_path;
    const offset = inp.offset ? Number(inp.offset) : undefined;
    const limit = inp.limit ? Number(inp.limit) : undefined;
    if (offset != null && limit != null) return `${name} L${offset}-${offset + limit}`;
    return name;
  }
  if (inp.pattern) {
    const pat = String(inp.pattern);
    return pat.length > 40 ? pat.slice(0, 40) + "…" : pat;
  }
  return undefined;
}

function isSkillPath(path: string): boolean {
  return (
    /\/SKILL\.md$/i.test(path) ||
    path.includes(".cursor/skills/") ||
    path.includes(".claude/skills/") ||
    path.includes(".agents/skills/")
  );
}

function isLargeResult(output: string | undefined): boolean {
  if (!output) return false;
  return output.length > 2000 || output.split("\n").length > 50;
}

// ---------------------------------------------------------------------------
// Segment views
// ---------------------------------------------------------------------------

function TextSegmentView({ items }: { items: TimelineItem[] }) {
  const text = items.map((t) => t.content ?? "").join("");
  if (!text.trim()) return null;

  return (
    <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
      <Markdown>{text}</Markdown>
    </div>
  );
}

function ToolSegmentView({
  items,
  defaultOpen,
}: {
  items: TimelineItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const subGroups = useMemo(() => buildSubGroups(items), [items]);
  const toolCount = items.filter((i) => i.type === "tool_use").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <span>
          {toolCount} {toolCount === 1 ? "tool call" : "tool calls"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-lg border bg-muted/20 p-2 space-y-0.5">
          {subGroups.map((sg) =>
            sg.kind === "explored" ? (
              <ExploredGroup key={sg.items[0]!.seq} group={sg} />
            ) : (
              <ItemRow key={sg.item.seq} item={sg.item} />
            ),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Explored group (collapsed 3+ same-class operations)
// ---------------------------------------------------------------------------

function ExploredGroup({ group }: { group: ExploredRun }) {
  const [open, setOpen] = useState(false);
  const toolUses = group.items.filter((i) => i.type === "tool_use");
  const label = opClassLabel(group.opClass, toolUses.length);
  const icon = opClassIcon(group.opClass);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1 -mx-1 py-0.5 text-xs hover:bg-accent/30 transition-colors">
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-[18px] mt-0.5 space-y-0.5" role="list">
          {group.items.map((item) => (
            <ExploredItemRow key={item.seq} item={item} opClass={group.opClass} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExploredItemRow({
  item,
  opClass,
}: {
  item: TimelineItem;
  opClass: OperationClass;
}) {
  if (item.type === "tool_result") {
    return <ToolResultRow item={item} compact />;
  }
  const compactLabel = extractCompactLabel(item);
  return (
    <ToolCallRow
      item={item}
      descriptionOverride={compactLabel}
      skipSkillContent={opClass === "read"}
    />
  );
}

// ---------------------------------------------------------------------------
// Individual item rows
// ---------------------------------------------------------------------------

function ItemRow({ item }: { item: TimelineItem }) {
  switch (item.type) {
    case "tool_use":
      return <ToolCallRow item={item} />;
    case "tool_result":
      return <ToolResultRow item={item} />;
    case "thinking":
      return <ThinkingRow item={item} />;
    case "error":
      return <ErrorRow item={item} />;
    default:
      return null;
  }
}

function ToolCallRow({
  item,
  descriptionOverride,
  skipSkillContent,
}: {
  item: TimelineItem;
  descriptionOverride?: string;
  skipSkillContent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = descriptionOverride ?? getToolSummary(item);
  const hasInput = item.input && Object.keys(item.input).length > 0;

  const filePath =
    (item.input as Record<string, string> | undefined)?.file_path ?? "";
  const isSkill = skipSkillContent && isSkillPath(filePath);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1 -mx-1 py-0.5 text-xs hover:bg-accent/30 transition-colors">
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
            !hasInput && "invisible",
          )}
        />
        <span className="font-medium text-foreground shrink-0">
          {item.tool}
        </span>
        {summary && (
          <span className="truncate text-muted-foreground">{summary}</span>
        )}
      </CollapsibleTrigger>
      {hasInput && !isSkill && (
        <CollapsibleContent>
          <pre className="ml-[18px] mt-0.5 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(item.input, null, 2)}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function ToolResultRow({
  item,
  compact,
}: {
  item: TimelineItem;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const output = item.output ?? "";
  if (!output) return null;

  const large = isLargeResult(output);
  const lineCount = output.split("\n").length;
  const preview = compact
    ? (output.length > 80 ? output.slice(0, 80) + "…" : output)
    : (output.length > 120 ? output.slice(0, 120) + "…" : output);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-start gap-1.5 rounded px-1 -mx-1 py-0.5 text-xs hover:bg-accent/30 transition-colors">
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform mt-0.5",
            open && "rotate-90",
          )}
        />
        <span className="text-muted-foreground/70 truncate">
          {item.tool ? `${item.tool} result` : "result"}
          {large && !open && ` (${lineCount} lines)`}
          {!large && `: ${preview}`}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="ml-[18px] mt-0.5 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
          {output.length > 4000
            ? output.slice(0, 4000) + "\n… (truncated)"
            : output}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ThinkingRow({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const text = item.content ?? "";
  if (!text) return null;

  const preview = text.length > 150 ? text.slice(0, 150) + "…" : text;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-start gap-1.5 rounded px-1 -mx-1 py-0.5 text-xs hover:bg-accent/30 transition-colors">
        <Brain className="h-3 w-3 shrink-0 text-muted-foreground/60 mt-0.5" />
        <span className="text-muted-foreground italic truncate">{preview}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="ml-[18px] mt-0.5 max-h-40 overflow-auto rounded bg-muted/30 p-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ErrorRow({ item }: { item: TimelineItem }) {
  return (
    <div className="flex items-start gap-1.5 px-1 -mx-1 py-0.5 text-xs">
      <AlertCircle className="h-3 w-3 shrink-0 text-destructive mt-0.5" />
      <span className="text-destructive">{item.content}</span>
    </div>
  );
}
