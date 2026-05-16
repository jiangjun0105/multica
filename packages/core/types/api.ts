import type { Issue, IssueStatus, IssuePriority, IssueAssigneeType } from "./issue";
import type { MemberRole } from "./workspace";

// Issue API
export interface CreateIssueRequest {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_type?: IssueAssigneeType;
  assignee_id?: string;
  parent_issue_id?: string;
  project_id?: string;
  due_date?: string;
  attachment_ids?: string[];
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_type?: IssueAssigneeType | null;
  assignee_id?: string | null;
  position?: number;
  due_date?: string | null;
  parent_issue_id?: string | null;
  project_id?: string | null;
}

export interface ListIssuesParams {
  limit?: number;
  offset?: number;
  workspace_id?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string;
  assignee_ids?: string[];
  creator_id?: string;
  project_id?: string;
  open_only?: boolean;
}

/** Raw backend response shape for `GET /api/issues`. */
export interface ListIssuesResponse {
  issues: Issue[];
  total: number;
}

/** Per-status bucket in the paginated issue cache. `total` is the server count (all pages), not the length of `issues`. */
export interface IssueStatusBucket {
  issues: Issue[];
  total: number;
}

/**
 * Frontend cache shape for the issue list. Data is bucketed by status so
 * each column can paginate independently. Assembled from per-status
 * `api.listIssues` responses by the query functions in `issues/queries.ts`.
 */
export interface ListIssuesCache {
  byStatus: Partial<Record<IssueStatus, IssueStatusBucket>>;
}

export interface SearchIssueResult extends Issue {
  match_source: "title" | "description" | "comment";
  matched_snippet?: string;
}

export interface SearchIssuesResponse {
  issues: SearchIssueResult[];
  total: number;
}

// Triage API
export interface StartTriageResponse {
  chat_session: import("./chat").ChatSession;
  created: boolean;
}

export interface TriageProposedTask {
  title: string;
  description: string;
  priority: string;
  suitability?: string;
  manual_test?: string;
  dependencies?: TriageProposedDependency[];
}

export interface TriageProposedDependency {
  ref_index: number;
  type: "blocks" | "blocked_by" | "related";
}

export interface TriageProposal {
  id: string;
  issue_id: string;
  workspace_id: string;
  status: "pending" | "approved" | "rejected";
  proposed_by_type: string;
  proposed_by_id: string;
  proposal: TriageProposedTask[];
  created_at: string;
  updated_at: string;
}

export interface ListTriageProposalsResponse {
  proposals: TriageProposal[];
}

export interface TriageFinalizeResponse {
  proposal: TriageProposal;
  tasks: TriageFinalizedTask[];
}

export interface TriageFinalizedTask {
  id: string;
  workspace_id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  suitability?: string;
  manual_test?: string;
  issue_id?: string;
  creator_type: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateMeRequest {
  name?: string;
  avatar_url?: string;
}

export interface CreateMemberRequest {
  email: string;
  role?: MemberRole;
}

export interface UpdateMemberRequest {
  role: MemberRole;
}

// Personal Access Tokens
export interface PersonalAccessToken {
  id: string;
  name: string;
  token_prefix: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CreatePersonalAccessTokenRequest {
  name: string;
  expires_in_days?: number;
}

export interface CreatePersonalAccessTokenResponse extends PersonalAccessToken {
  token: string;
}

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
}
