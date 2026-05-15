import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PlanningTask } from "@multica/core/types";

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@multica/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = { user: { id: "user-1", email: "test@test.com", name: "Test" }, isAuthenticated: true };
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

vi.mock("../../../navigation", () => ({
  AppLink: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
  useNavigation: () => ({ push: vi.fn(), pathname: "/tasks" }),
}));

vi.mock("../../../workspace/workspace-avatar", () => ({
  WorkspaceAvatar: ({ name }: { name: string }) => <span data-testid="workspace-avatar">{name.charAt(0)}</span>,
}));

const mockListPlanningTasks = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ tasks: [], total: 0 }),
);

vi.mock("@multica/core/api", () => ({
  api: {
    listPlanningTasks: (...args: any[]) => mockListPlanningTasks(...args),
    updatePlanningTask: vi.fn(),
  },
  getApi: () => ({
    listPlanningTasks: (...args: any[]) => mockListPlanningTasks(...args),
    updatePlanningTask: vi.fn(),
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

const mockTaskViewState = {
  viewMode: "board" as const,
  statusFilters: [] as string[],
  priorityFilters: [] as string[],
  sortBy: "created_at" as const,
  sortDirection: "asc" as const,
  cardProperties: { priority: true, description: true, suitability: true },
  listCollapsedStatuses: [] as string[],
  setViewMode: vi.fn(),
  toggleStatusFilter: vi.fn(),
  togglePriorityFilter: vi.fn(),
  hideStatus: vi.fn(),
  showStatus: vi.fn(),
  clearFilters: vi.fn(),
  setSortBy: vi.fn(),
  setSortDirection: vi.fn(),
  toggleCardProperty: vi.fn(),
  toggleListCollapsed: vi.fn(),
};

vi.mock("@multica/core/tasks/stores/view-store", () => ({
  useTaskViewStore: Object.assign(
    (selector?: any) => (selector ? selector(mockTaskViewState) : mockTaskViewState),
    { getState: () => mockTaskViewState, setState: vi.fn() },
  ),
  TASK_SORT_OPTIONS: [
    { value: "created_at", label: "Created date" },
    { value: "priority", label: "Priority" },
    { value: "title", label: "Title" },
  ],
  TASK_CARD_PROPERTY_OPTIONS: [
    { key: "priority", label: "Priority" },
    { key: "description", label: "Description" },
    { key: "suitability", label: "Suitability" },
  ],
}));

vi.mock("@multica/core/modals", () => ({
  useModalStore: Object.assign(
    () => ({ open: vi.fn() }),
    { getState: () => ({ open: vi.fn() }) },
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => children,
  DragOverlay: () => null,
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  pointerWithin: vi.fn(),
  closestCenter: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => children,
  verticalListSortingStrategy: {},
  arrayMove: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  defaultAnimateLayoutChanges: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

// Mock issue priority icon (used by task cards)
vi.mock("../../../issues/components/priority-icon", () => ({
  PriorityIcon: () => <span data-testid="priority-icon" />,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockTasks: PlanningTask[] = [
  {
    id: "task-1",
    workspace_id: "ws-1",
    number: 1,
    title: "Implement login flow",
    description: "Add OAuth login",
    status: "pending",
    priority: "high",
    creator_type: "member",
    creator_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "task-2",
    workspace_id: "ws-1",
    number: 2,
    title: "Design dashboard",
    description: "",
    status: "in_progress",
    priority: "medium",
    creator_type: "member",
    creator_id: "user-1",
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "task-3",
    workspace_id: "ws-1",
    number: 3,
    title: "Write unit tests",
    description: "",
    status: "done",
    priority: "low",
    creator_type: "member",
    creator_id: "user-1",
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { TasksPage } from "./tasks-page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      {ui}
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TasksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPlanningTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockTaskViewState.viewMode = "board";
    mockTaskViewState.statusFilters = [];
    mockTaskViewState.priorityFilters = [];
  });

  it("shows loading skeletons initially", () => {
    renderWithQuery(<TasksPage />);
    expect(
      screen.getAllByRole("generic").some((el) => el.getAttribute("data-slot") === "skeleton"),
    ).toBe(true);
  });

  it("renders task titles after data loads", async () => {
    mockListPlanningTasks.mockImplementation((params: any) =>
      Promise.resolve({
        tasks: mockTasks.filter((t) => t.status === params?.status),
        total: mockTasks.filter((t) => t.status === params?.status).length,
      }),
    );

    renderWithQuery(<TasksPage />);

    await screen.findByText("Implement login flow");
    expect(screen.getByText("Design dashboard")).toBeInTheDocument();
    expect(screen.getByText("Write unit tests")).toBeInTheDocument();
  });

  it("renders board column headers", async () => {
    mockListPlanningTasks.mockImplementation((params: any) =>
      Promise.resolve({
        tasks: mockTasks.filter((t) => t.status === params?.status),
        total: mockTasks.filter((t) => t.status === params?.status).length,
      }),
    );

    renderWithQuery(<TasksPage />);

    await screen.findByText("Pending");
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Done").length).toBeGreaterThanOrEqual(1);
  });

  it("shows workspace breadcrumb with 'Tasks' label", async () => {
    mockListPlanningTasks.mockImplementation((params: any) =>
      Promise.resolve({
        tasks: mockTasks.filter((t) => t.status === params?.status),
        total: mockTasks.filter((t) => t.status === params?.status).length,
      }),
    );

    renderWithQuery(<TasksPage />);

    await screen.findByText("Tasks");
    expect(screen.getByText("Test WS")).toBeInTheDocument();
  });

  it("shows empty state when there are no tasks", async () => {
    mockListPlanningTasks.mockResolvedValue({ tasks: [], total: 0 });

    renderWithQuery(<TasksPage />);

    await screen.findByText("No tasks yet");
    expect(
      screen.getByText("Create a task to get started."),
    ).toBeInTheDocument();
  });

  it("displays task identifiers (TASK-N)", async () => {
    mockListPlanningTasks.mockImplementation((params: any) =>
      Promise.resolve({
        tasks: mockTasks.filter((t) => t.status === params?.status),
        total: mockTasks.filter((t) => t.status === params?.status).length,
      }),
    );

    renderWithQuery(<TasksPage />);

    await screen.findByText("TASK-1");
    expect(screen.getByText("TASK-2")).toBeInTheDocument();
    expect(screen.getByText("TASK-3")).toBeInTheDocument();
  });
});
