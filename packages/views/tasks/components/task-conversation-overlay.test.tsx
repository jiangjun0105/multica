import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaskMessagePayload } from "@multica/core/types";

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@multica/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = { user: { id: "user-1" }, isAuthenticated: true };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ user: { id: "user-1" }, isAuthenticated: true }) },
  ),
  registerAuthStore: vi.fn(),
  createAuthStore: vi.fn(),
}));

vi.mock("@multica/ui/hooks/use-scroll-fade", () => ({
  useScrollFade: () => ({}),
}));

vi.mock("@multica/ui/hooks/use-auto-scroll", () => ({
  useAutoScroll: vi.fn(),
}));

vi.mock("../../common/markdown", () => ({
  Markdown: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

const mockListTaskMessages = vi.hoisted(() => vi.fn());

vi.mock("@multica/core/api", () => ({
  api: {
    listTaskMessages: (...args: any[]) => mockListTaskMessages(...args),
  },
  getApi: () => ({
    listTaskMessages: (...args: any[]) => mockListTaskMessages(...args),
  }),
  setApiInstance: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const textMessage: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 1,
  type: "text",
  content: "Starting implementation of the login flow.",
};

const toolUseRead1: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 2,
  type: "tool_use",
  tool: "Read",
  input: { file_path: "/src/auth/login.ts" },
};

const toolResultRead1: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 3,
  type: "tool_result",
  tool: "Read",
  output: "export function login() { ... }",
};

const toolUseRead2: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 4,
  type: "tool_use",
  tool: "Read",
  input: { file_path: "/src/auth/session.ts" },
};

const toolResultRead2: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 5,
  type: "tool_result",
  tool: "Read",
  output: "export class Session { ... }",
};

const toolUseRead3: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 6,
  type: "tool_use",
  tool: "Read",
  input: { file_path: "/src/auth/token.ts" },
};

const toolResultRead3: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 7,
  type: "tool_result",
  tool: "Read",
  output: "export function verifyToken() { ... }",
};

const thinkingMessage: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 8,
  type: "thinking",
  content: "I need to add OAuth support to the login handler.",
};

const errorMessage: TaskMessagePayload = {
  task_id: "run-1",
  issue_id: "issue-1",
  seq: 9,
  type: "error",
  content: "Build failed: TypeScript error in auth/login.ts",
};

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { TaskConversationOverlay } from "./task-conversation-overlay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderOverlay(taskRunId = "run-1", onClose = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TaskConversationOverlay taskRunId={taskRunId} onClose={onClose} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskConversationOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state while fetching messages", () => {
    mockListTaskMessages.mockReturnValue(new Promise(() => {}));
    renderOverlay();

    expect(screen.getByText("Loading transcript…")).toBeInTheDocument();
  });

  it("shows empty state when no messages", async () => {
    mockListTaskMessages.mockResolvedValue([]);
    renderOverlay();

    await waitFor(() => {
      expect(screen.getByText("No execution data recorded.")).toBeInTheDocument();
    });
  });

  it("renders header with tool call count", async () => {
    mockListTaskMessages.mockResolvedValue([textMessage, toolUseRead1, toolResultRead1]);
    renderOverlay();

    await waitFor(() => {
      expect(screen.getByText("1 tool calls")).toBeInTheDocument();
    });
  });

  it("renders text segments as markdown", async () => {
    mockListTaskMessages.mockResolvedValue([textMessage]);
    renderOverlay();

    await waitFor(() => {
      expect(screen.getByTestId("markdown")).toHaveTextContent(
        "Starting implementation of the login flow.",
      );
    });
  });

  it("renders tool group as collapsible with tool count", async () => {
    mockListTaskMessages.mockResolvedValue([toolUseRead1, toolResultRead1]);
    renderOverlay();

    await waitFor(() => {
      expect(screen.getByText("1 tool call")).toBeInTheDocument();
    });
  });

  it("groups 3+ consecutive reads into collapsed Explored group", async () => {
    mockListTaskMessages.mockResolvedValue([
      toolUseRead1,
      toolResultRead1,
      toolUseRead2,
      toolResultRead2,
      toolUseRead3,
      toolResultRead3,
    ]);
    renderOverlay();

    await waitFor(() => {
      expect(screen.getAllByText("3 tool calls").length).toBeGreaterThan(0);
    });

    // The header should report the tool count
    const headerSpan = screen
      .getAllByText("3 tool calls")
      .find((el) => el.tagName === "SPAN" && !el.closest("button"));
    expect(headerSpan).toBeDefined();
  });

  it("renders thinking items with brain icon", async () => {
    mockListTaskMessages.mockResolvedValue([thinkingMessage]);
    renderOverlay();

    await waitFor(() => {
      expect(
        screen.getByText("I need to add OAuth support to the login handler."),
      ).toBeInTheDocument();
    });
  });

  it("renders error items with destructive styling", async () => {
    mockListTaskMessages.mockResolvedValue([errorMessage]);
    renderOverlay();

    await waitFor(() => {
      expect(
        screen.getByText("Build failed: TypeScript error in auth/login.ts"),
      ).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    mockListTaskMessages.mockResolvedValue([textMessage]);
    renderOverlay("run-1", onClose);

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("Execution log")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Close transcript"));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
