"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crosshair, Loader2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { SubmitButton } from "@multica/ui/components/common/submit-button";
import { useWorkspaceId } from "@multica/core/hooks";
import { agentListOptions } from "@multica/core/workspace/queries";
import { api } from "@multica/core/api";
import { useAgentPresenceDetail } from "@multica/core/agents";
import {
  chatMessagesOptions,
  pendingChatTaskOptions,
  chatKeys,
} from "@multica/core/chat/queries";
import {
  triageProposalsOptions,
  triageSessionOptions,
} from "@multica/core/issues/queries";
import { useFinalizeTriageProposal } from "@multica/core/issues/mutations";
import {
  ChatMessageList,
  ChatMessageSkeleton,
} from "../../chat/components/chat-message-list";
import { ContentEditor, type ContentEditorRef } from "../../editor";
import { ActorAvatar } from "../../common/actor-avatar";
import { PriorityIcon } from "./priority-icon";
import type {
  IssuePriority,
  ChatMessage,
  ChatPendingTask,
  TriageProposal,
} from "@multica/core/types";

// ---------------------------------------------------------------------------
// TriageChatPanel
// ---------------------------------------------------------------------------

interface TriageChatPanelProps {
  issueId: string;
}

export function TriageChatPanel({ issueId }: TriageChatPanelProps) {
  const wsId = useWorkspaceId();
  const qc = useQueryClient();

  const { data: triageSession, isLoading: sessionLoading } = useQuery(
    triageSessionOptions(issueId),
  );
  const sessionId = triageSession?.id ?? "";
  const agentId = triageSession?.agent_id ?? "";

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const agent = agents.find((a) => a.id === agentId) ?? null;

  const presenceDetail = useAgentPresenceDetail(wsId, agentId || undefined);
  const availability =
    presenceDetail === "loading" ? undefined : presenceDetail.availability;

  const { data: rawMessages, isLoading: messagesLoading } = useQuery({
    ...chatMessagesOptions(sessionId),
    enabled: !!sessionId,
  });
  const messages = sessionId ? (rawMessages ?? []) : [];
  const showSkeleton = !!sessionId && messagesLoading;

  const { data: pendingTask } = useQuery({
    ...pendingChatTaskOptions(sessionId),
    enabled: !!sessionId,
  });
  const pendingTaskId = pendingTask?.task_id ?? null;

  const { data: proposals = [] } = useQuery({
    ...triageProposalsOptions(issueId),
    enabled: !!sessionId,
  });
  const pendingProposal =
    proposals.find((p) => p.status === "pending") ?? null;

  const finalizeMutation = useFinalizeTriageProposal();

  const handleSend = useCallback(
    async (content: string) => {
      if (!sessionId || !agent) return;

      const sentAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        chat_session_id: sessionId,
        role: "user",
        content,
        task_id: null,
        created_at: sentAt,
      };

      qc.setQueryData<ChatMessage[]>(chatKeys.messages(sessionId), (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: `optimistic-${optimistic.id}`,
        status: "queued",
        created_at: sentAt,
      });

      const result = await api.sendChatMessage(sessionId, content);
      qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sessionId), {
        task_id: result.task_id,
        status: "queued",
        created_at: result.created_at,
      });
      qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    },
    [sessionId, agent, qc],
  );

  const handleStop = useCallback(() => {
    if (!pendingTaskId || !sessionId) return;
    qc.setQueryData(chatKeys.pendingTask(sessionId), {});
    qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    api.cancelTaskById(pendingTaskId).catch(() => {});
  }, [pendingTaskId, sessionId, qc]);

  const handleApprove = useCallback(() => {
    if (!pendingProposal) return;
    finalizeMutation.mutate({ issueId, proposalId: pendingProposal.id });
  }, [pendingProposal, issueId, finalizeMutation]);

  const isRunning = !!pendingTaskId;
  const hasMessages = messages.length > 0 || isRunning;

  if (sessionLoading) {
    return (
      <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-warning" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="mt-3 h-20 w-full" />
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-warning">
          <Crosshair className="h-4 w-4" />
          Triage in progress
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          An agent is analyzing this issue and will propose a task breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-warning/30 bg-warning/5">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-warning/20 px-4 py-3">
        <Crosshair className="h-4 w-4 text-warning" />
        <span className="text-sm font-medium text-warning">
          Triage in progress
        </span>
        {agent && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <ActorAvatar
              actorType="agent"
              actorId={agentId}
              size={18}
              showStatusDot
            />
            {agent.name}
          </span>
        )}
      </div>

      {/* Chat messages */}
      <div className="flex max-h-[480px] min-h-[200px] flex-col">
        <div className="flex-1 overflow-hidden">
          {showSkeleton ? (
            <ChatMessageSkeleton />
          ) : hasMessages ? (
            <ChatMessageList
              messages={messages}
              pendingTask={pendingTask ?? null}
              availability={availability}
            />
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-xs text-muted-foreground">
              The agent is analyzing this issue and will propose a task
              breakdown.
            </div>
          )}
        </div>
      </div>

      {/* Proposal preview */}
      {pendingProposal && (
        <ProposalPreview
          proposal={pendingProposal}
          onApprove={handleApprove}
          isApproving={finalizeMutation.isPending}
        />
      )}

      {/* Input */}
      <div className="border-t border-warning/20">
        <TriageInput
          onSend={handleSend}
          onStop={handleStop}
          isRunning={isRunning}
          agentName={agent?.name}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TriageInput — local-state input (no global chat store dependency)
// ---------------------------------------------------------------------------

interface TriageInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  agentName?: string;
  sessionId: string;
}

function TriageInput({
  onSend,
  onStop,
  isRunning,
  agentName,
  sessionId,
}: TriageInputProps) {
  const editorRef = useRef<ContentEditorRef>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleSend = () => {
    const content = editorRef.current
      ?.getMarkdown()
      ?.replace(/(\n\s*)+$/, "")
      .trim();
    if (!content || isRunning) return;
    onSend(content);
    editorRef.current?.clearContent();
    editorRef.current?.blur();
    setIsEmpty(true);
  };

  const placeholder = agentName
    ? `Tell ${agentName} what to do…`
    : "Send a message…";

  return (
    <div className="px-5 pb-3 pt-0">
      <div className="relative mx-auto flex min-h-16 max-h-40 w-full max-w-4xl flex-col rounded-lg bg-card pb-9 border-1 border-border transition-colors focus-within:border-brand">
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          <ContentEditor
            key={sessionId}
            ref={editorRef}
            placeholder={placeholder}
            onUpdate={(md) => setIsEmpty(!md.trim())}
            onSubmit={handleSend}
            debounceMs={100}
            showBubbleMenu={false}
            submitOnEnter
          />
        </div>
        <div className="absolute bottom-1 right-1.5 flex items-center gap-2">
          <SubmitButton
            onClick={handleSend}
            disabled={isEmpty}
            running={isRunning}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProposalPreview
// ---------------------------------------------------------------------------

interface ProposalPreviewProps {
  proposal: TriageProposal;
  onApprove: () => void;
  isApproving: boolean;
}

function ProposalPreview({
  proposal,
  onApprove,
  isApproving,
}: ProposalPreviewProps) {
  const tasks = proposal.proposal;

  return (
    <div className="border-t border-warning/20 bg-card/50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          Proposed plan ({tasks.length}{" "}
          {tasks.length === 1 ? "task" : "tasks"})
        </span>
        <Button size="sm" onClick={onApprove} disabled={isApproving}>
          {isApproving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          )}
          Approve plan
        </Button>
      </div>
      <div className="space-y-1.5">
        {tasks.map((task, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm"
          >
            <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
              {idx + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <PriorityIcon
                  priority={(task.priority || "medium") as IssuePriority}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="truncate font-medium">{task.title}</span>
              </div>
              {task.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {task.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
