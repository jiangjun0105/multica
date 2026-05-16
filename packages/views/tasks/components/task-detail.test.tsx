import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PlanningTask, TaskDependency } from "@multica/core/types";

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

vi.mock("@multica/core/paths", async () => {
  const actual = await vi.importActual<typeof import("@multica/core/paths")>(
    "@multica/core/paths",
  );
  return {
    ...actual,
    useCurrentWorkspace: () => ({ id: "ws-1", name: "Test WS", slug: "test" }),
    useWorkspacePaths: () => actual.paths.workspace("test"),
  };
});

vi.mock("../../navigation", () => ({
  AppLink: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
  useNavigation: () => ({ push: vi.fn(), pathname: "/tasks/task-1" }),
}));

vi.mock("../../workspace/workspace-avatar", () => ({
  WorkspaceAvatar: ({ name }: { name: string }) => <span data-testid="workspace-avatar">{name.charAt(0)}</span>,
}));

vi.mock("../../common/markdown", () => ({
  MemoizedMarkdown: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
  Markdown: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

vi.mock("../../platform/open-external", () => ({
  openExternal: vi.fn(),
}));

vi.mock("../../issues/components/priority-icon", () => ({
  PriorityIcon: () => <span data-testid="priority-icon" />,
}));

const mockGetPlanningTask = vi.hoisted(() => vi.fn());
const mockListPlanningTaskDependencies = vi.hoisted(() => vi.fn());
const mockListPlanningTasks = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ tasks: [], total: 0 }),
);

vi.mock("@multica/core/api", () => ({
  api: {
    getPlanningTask: (...args: any[]) => mockGetPlanningTask(...args),
    listPlanningTaskDependencies: (...args: any[]) => mockListPlanningTaskDependencies(...args),
    listPlanningTasks: (...args: any[]) => mockListPlanningTasks(...args),
  },
  getApi: () => ({
    getPlanningTask: (...args: any[]) => mockGetPlanningTask(...args),
    listPlanningTaskDependencies: (...args: any[]) => mockListPlanningTaskDependencies(...args),
    listPlanningTasks: (...args: any[]) => mockListPlanningTasks(...args),
  }),
  setApiInstance: vi.fn(),
}));

vi.mock("@multica/core/tasks/config", () => ({
  ALL_TASK_STATUSES: ["pending", "in_progress", "done", "blocked", "cancelled"],
  TASK_BOARD_STATUSES: ["pending", "in_progress", "done", "blocked"],
  TASK_STATUS_CONFIG: {
    pending: { label: "Pending", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent", dividerColor: "bg-muted-foreground/40", columnBg: "bg-muted/40" },
    in_progress: { label: "In Progress", iconColor: "text-warning", hoverBg: "hover:bg-warning/10", dividerColor: "bg-warning", columnBg: "bg-warning/5" },
    done: { label: "Done", iconColor: "text-info", hoverBg: "hover:bg-info/10", dividerColor: "bg-info", columnBg: "bg-info/5" },
    blocked: { label: "Blocked", iconColor: "text-destructive", hoverBg: "hover:bg-destructive/10", dividerColor: "bg-destructive", columnBg: "bg-destructive/5" },
    cancelled: { label: "Cancelled", iconColor: "text-muted-foreground", hoverBg: "hover:bg-accent", dividerColor: "bg-muted-foreground/40", columnBg: "bg-muted/40" },
  },
  TASK_PRIORITY_ORDER: ["high", "medium", "low"],
  TASK_PRIORITY_CONFIG: {
    high: { label: "High", bars: 3, color: "text-warning", badgeBg: "bg-priority/80", badgeText: "text-white" },
    medium: { label: "Medium", bars: 2, color: "text-warning", badgeBg: "bg-priority/15", badgeText: "text-priority" },
    low: { label: "Low", bars: 1, color: "text-info", badgeBg: "bg-priority/10", badgeText: "text-priority" },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockTask: PlanningTask = {
  id: "task-1",
  workspace_id: "ws-1",
  number: 42,
  title: "Implement login flow",
  description: "Add OAuth support\n\n- Google\n- GitHub",
  status: "pending",
  priority: "high",
  suitability: "auto_agent_ready",
  branch: "feat/login",
  pr: "https://github.com/org/repo/pull/123",
  manual_test: "Run the login flow end-to-end",
  issue_id: "issue-1",
  current_run_id: "run-abc",
  creator_type: "member",
  creator_id: "user-1",
  is_draft: false,
  transition_mode: "manual",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const mockDeps: TaskDependency[] = [
  { task_id: "task-1", depends_on_task_id: "task-2", type: "blocked_by" },
];

const mockDepTask: PlanningTask = {
  id: "task-2",
  workspace_id: "ws-1",
  number: 41,
  title: "Set up database schema",
  description: "",
  status: "done",
  priority: "high",
  creator_type: "member",
  creator_id: "user-1",
  is_draft: false,
  transition_mode: "manual",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { TaskDetail } from "./task-detail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTaskDetail(taskId = "task-1") {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TaskDetail taskId={taskId} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TaskDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlanningTask.mockResolvedValue(mockTask);
    mockListPlanningTaskDependencies.mockResolvedValue(mockDeps);
    mockListPlanningTasks.mockImplementation((params: any) => {
      const tasks = [mockTask, mockDepTask].filter(
        (t) => !params?.status || t.status === params.status,
      );
      return Promise.resolve({ tasks, total: tasks.length });
    });
  });

  it("shows loading skeleton while data is loading", () => {
    mockGetPlanningTask.mockReturnValue(new Promise(() => {}));
    renderTaskDetail();

    expect(
      screen.getAllByRole("generic").some((el) => el.getAttribute("data-slot") === "skeleton"),
    ).toBe(true);
  });

  it("shows not-found message when task does not exist", async () => {
    mockGetPlanningTask.mockRejectedValue(new Error("Not found"));

    renderTaskDetail("nonexistent");

    await waitFor(() => {
      expect(
        screen.getByText("This task does not exist or has been deleted."),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Back to Tasks")).toBeInTheDocument();
  });

  it("renders task title and identifier after loading", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Implement login flow")).toBeInTheDocument();
    });

    expect(screen.getByText("TASK-42")).toBeInTheDocument();
  });

  it("renders task description as markdown", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByTestId("markdown")).toBeInTheDocument();
    });

    expect(screen.getByTestId("markdown")).toHaveTextContent(
      "Add OAuth support",
    );
  });

  it("renders status and priority in sidebar", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });

    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders suitability badge", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Agent Ready")).toBeInTheDocument();
    });
  });

  it("renders branch and PR links", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("feat/login")).toBeInTheDocument();
    });

    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("renders manual test section", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Manual test")).toBeInTheDocument();
    });

    expect(screen.getByText("Run the login flow end-to-end")).toBeInTheDocument();
  });

  it("renders dependency list", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Dependencies")).toBeInTheDocument();
    });

    expect(screen.getByText("blocked by")).toBeInTheDocument();
    expect(screen.getByText(/TASK-41.*Set up database schema/)).toBeInTheDocument();
  });

  it("renders Dispatch button", async () => {
    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Dispatch")).toBeInTheDocument();
    });

    const btn = screen.getByText("Dispatch").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("disables Dispatch button when no current_run_id", async () => {
    mockGetPlanningTask.mockResolvedValue({ ...mockTask, current_run_id: null });

    renderTaskDetail();

    await waitFor(() => {
      expect(screen.getByText("Dispatch")).toBeInTheDocument();
    });

    const btn = screen.getByText("Dispatch").closest("button");
    expect(btn).toBeDisabled();
  });
});
