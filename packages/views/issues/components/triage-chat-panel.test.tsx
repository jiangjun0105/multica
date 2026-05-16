import { forwardRef, useRef, useState, useImperativeHandle } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Hoisted state — survives vi.clearAllMocks() because it's plain data, not
// mock implementations. Each test overrides what it needs.
// ---------------------------------------------------------------------------

const defaultSession = {
  id: "session-1",
  agent_id: "agent-1",
  workspace_id: "ws-1",
  creator_id: "user-1",
  title: "Triage: Test Issue",
  status: "active",
  created_at: "2026-05-16T00:00:00Z",
  updated_at: "2026-05-16T00:00:00Z",
  has_unread: false,
};

const testState = vi.hoisted(() => ({
  session: null as any,
  sessionError: false,
  messages: [] as any[],
  pendingTask: null as any,
  proposals: [] as any[],
}));

// ---------------------------------------------------------------------------
// Mocks — module-level, so they apply to all imports
// ---------------------------------------------------------------------------

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@multica/core/workspace/queries", () => ({
  agentListOptions: () => ({
    queryKey: ["workspaces", "ws-1", "agents"],
    queryFn: () =>
      Promise.resolve([
        { id: "agent-1", name: "Triage Agent", archived_at: null },
      ]),
  }),
  memberListOptions: () => ({
    queryKey: ["workspaces", "ws-1", "members"],
    queryFn: () =>
      Promise.resolve([
        { user_id: "user-1", name: "Test User", role: "admin" },
      ]),
  }),
}));

vi.mock("@multica/core/agents", () => ({
  useAgentPresenceDetail: () => ({
    availability: "online" as const,
    workload: "idle" as const,
    runningCount: 0,
    queuedCount: 0,
    capacity: 1,
  }),
  useWorkspaceAgentAvailability: () => "available",
}));

vi.mock("@multica/core/issues/queries", () => ({
  triageSessionOptions: (issueId: string) => ({
    queryKey: ["issues", "triage-session", issueId],
    queryFn: () => {
      if (testState.sessionError) return Promise.reject(new Error("not found"));
      return Promise.resolve(testState.session);
    },
    enabled: !!issueId,
    staleTime: Infinity,
    retry: false,
  }),
  triageProposalsOptions: (issueId: string) => ({
    queryKey: ["issues", "triage-proposals", issueId],
    queryFn: () => Promise.resolve(testState.proposals),
    enabled: !!issueId,
    staleTime: Infinity,
  }),
  issueKeys: {
    all: (wsId: string) => ["issues", wsId],
    list: (wsId: string) => ["issues", wsId, "list"],
    detail: (wsId: string, id: string) => ["issues", wsId, "detail", id],
    children: (wsId: string, id: string) => ["issues", wsId, "children", id],
    triageProposals: (issueId: string) => ["issues", "triage-proposals", issueId],
    triageSession: (issueId: string) => ["issues", "triage-session", issueId],
  },
}));

vi.mock("@multica/core/chat/queries", () => ({
  chatMessagesOptions: (sessionId: string) => ({
    queryKey: ["chat", "messages", sessionId],
    queryFn: () => Promise.resolve(testState.messages),
    enabled: !!sessionId,
    staleTime: Infinity,
  }),
  pendingChatTaskOptions: (sessionId: string) => ({
    queryKey: ["chat", "pending-task", sessionId],
    queryFn: () => Promise.resolve(testState.pendingTask),
    enabled: !!sessionId,
    staleTime: Infinity,
  }),
  chatKeys: {
    messages: (sessionId: string) => ["chat", "messages", sessionId],
    pendingTask: (sessionId: string) => ["chat", "pending-task", sessionId],
  },
}));

const stableHandles = vi.hoisted(() => ({
  finalizeMutate: vi.fn(),
}));

vi.mock("@multica/core/issues/mutations", () => ({
  useFinalizeTriageProposal: () => ({
    mutate: stableHandles.finalizeMutate,
    mutateAsync: stableHandles.finalizeMutate,
    isPending: false,
  }),
}));

const mockApi = vi.hoisted(() => ({
  sendChatMessage: vi.fn().mockResolvedValue({
    message_id: "msg-1",
    task_id: "task-1",
    created_at: "2026-05-16T00:00:00Z",
  }),
  cancelTaskById: vi.fn().mockResolvedValue(undefined),
  finalizeTriageProposal: vi.fn().mockResolvedValue({
    proposal: { id: "prop-1", status: "approved" },
    tasks: [],
  }),
}));

vi.mock("@multica/core/api", () => ({
  api: mockApi,
  getApi: () => mockApi,
}));

vi.mock("../../chat/components/chat-message-list", () => ({
  ChatMessageList: ({ messages }: any) => (
    <div data-testid="chat-message-list">
      {messages.map((m: any) => (
        <div key={m.id} data-testid="chat-message">
          {m.content}
        </div>
      ))}
    </div>
  ),
  ChatMessageSkeleton: () => <div data-testid="chat-skeleton">Loading...</div>,
}));

vi.mock("../../editor", () => ({
  ContentEditor: forwardRef(function MockEditor(
    { placeholder, onUpdate, onSubmit }: any,
    ref: any,
  ) {
    const valueRef = useRef("");
    const [value, setValue] = useState("");
    useImperativeHandle(ref, () => ({
      getMarkdown: () => valueRef.current,
      clearContent: () => {
        valueRef.current = "";
        setValue("");
      },
      focus: () => {},
      blur: () => {},
    }));
    return (
      <textarea
        value={value}
        onChange={(e) => {
          valueRef.current = e.target.value;
          setValue(e.target.value);
          onUpdate?.(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
        data-testid="triage-input"
      />
    );
  }),
}));

vi.mock("../../common/actor-avatar", () => ({
  ActorAvatar: ({ actorType, actorId }: any) => (
    <span data-testid="actor-avatar">
      {actorType}:{actorId}
    </span>
  ),
}));

vi.mock("./priority-icon", () => ({
  PriorityIcon: ({ priority }: any) => (
    <span data-testid="priority-icon">{priority}</span>
  ),
}));

vi.mock("@multica/ui/components/common/submit-button", () => ({
  SubmitButton: ({ onClick, disabled, running, onStop }: any) =>
    running ? (
      <button data-testid="stop-btn" onClick={onStop}>
        Stop
      </button>
    ) : (
      <button data-testid="submit-btn" onClick={onClick} disabled={disabled}>
        Send
      </button>
    ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { TriageChatPanel } from "./triage-chat-panel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPanel(issueId = "issue-1") {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TriageChatPanel issueId={issueId} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TriageChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.session = { ...defaultSession };
    testState.sessionError = false;
    testState.messages = [];
    testState.pendingTask = null;
    testState.proposals = [];
  });

  it("renders loading skeleton while session is fetching", () => {
    testState.session = new Promise(() => {});
    renderPanel();
    expect(screen.queryByText("Triage in progress")).not.toBeInTheDocument();
  });

  it("renders the triage header with agent name", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Triage in progress")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Triage Agent")).toBeInTheDocument();
    });
  });

  it("renders empty state when no messages", async () => {
    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByText(/agent is analyzing this issue/),
      ).toBeInTheDocument();
    });
  });

  it("renders chat messages when present", async () => {
    testState.messages = [
      {
        id: "msg-1",
        chat_session_id: "session-1",
        role: "user",
        content: "What tasks do we need?",
        task_id: null,
        created_at: "2026-05-16T00:00:00Z",
      },
    ];
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("chat-message-list")).toBeInTheDocument();
    });
    expect(screen.getByText("What tasks do we need?")).toBeInTheDocument();
  });

  it("renders proposal preview with approve button", async () => {
    testState.proposals = [
      {
        id: "prop-1",
        issue_id: "issue-1",
        workspace_id: "ws-1",
        status: "pending",
        proposed_by_type: "agent",
        proposed_by_id: "agent-1",
        proposal: [
          {
            title: "Set up authentication",
            description: "Implement JWT auth flow",
            priority: "high",
          },
          {
            title: "Add user registration",
            description: "Create signup endpoint",
            priority: "medium",
          },
        ],
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
      },
    ];

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Proposed plan (2 tasks)")).toBeInTheDocument();
    });
    expect(screen.getByText("Set up authentication")).toBeInTheDocument();
    expect(screen.getByText("Add user registration")).toBeInTheDocument();
    expect(screen.getByText("Approve plan")).toBeInTheDocument();
  });

  it("does not show proposal for approved proposals", async () => {
    testState.proposals = [
      {
        id: "prop-1",
        issue_id: "issue-1",
        workspace_id: "ws-1",
        status: "approved",
        proposed_by_type: "agent",
        proposed_by_id: "agent-1",
        proposal: [
          { title: "Task 1", description: "", priority: "medium" },
        ],
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
      },
    ];

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Triage in progress")).toBeInTheDocument();
    });
    expect(screen.queryByText("Approve plan")).not.toBeInTheDocument();
  });

  it("calls finalize mutation on approve click", async () => {
    testState.proposals = [
      {
        id: "prop-1",
        issue_id: "issue-1",
        workspace_id: "ws-1",
        status: "pending",
        proposed_by_type: "agent",
        proposed_by_id: "agent-1",
        proposal: [
          { title: "Task", description: "", priority: "medium" },
        ],
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
      },
    ];

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Approve plan")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Approve plan"));

    await waitFor(() => {
      expect(stableHandles.finalizeMutate).toHaveBeenCalledWith({
        issueId: "issue-1",
        proposalId: "prop-1",
      });
    });
  });

  it("sends a message through the input", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("triage-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("triage-input");
    fireEvent.change(input, { target: { value: "Break this down" } });

    const sendBtn = screen.getByTestId("submit-btn");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockApi.sendChatMessage).toHaveBeenCalledWith(
        "session-1",
        "Break this down",
      );
    });
  });

  it("renders fallback when triage session not found", async () => {
    testState.session = null;
    testState.sessionError = true;

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Triage in progress")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /agent is analyzing this issue and will propose a task breakdown/,
      ),
    ).toBeInTheDocument();
  });

  it("shows single-task proposal with correct grammar", async () => {
    testState.proposals = [
      {
        id: "prop-1",
        issue_id: "issue-1",
        workspace_id: "ws-1",
        status: "pending",
        proposed_by_type: "agent",
        proposed_by_id: "agent-1",
        proposal: [
          { title: "Only task", description: "", priority: "low" },
        ],
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-16T00:00:00Z",
      },
    ];

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Proposed plan (1 task)")).toBeInTheDocument();
    });
  });
});
