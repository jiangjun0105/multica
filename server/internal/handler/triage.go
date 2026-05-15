package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/multica-ai/multica/server/internal/logger"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// --- Request / Response types ------------------------------------------------

type ProposedTask struct {
	Title        string                `json:"title"`
	Description  string                `json:"description"`
	Priority     string                `json:"priority"`
	Suitability  *string               `json:"suitability,omitempty"`
	ManualTest   *string               `json:"manual_test,omitempty"`
	Dependencies []ProposedDependency  `json:"dependencies,omitempty"`
}

type ProposedDependency struct {
	RefIndex int    `json:"ref_index"`
	Type     string `json:"type"`
}

type TriageProposalRequest struct {
	Tasks []ProposedTask `json:"tasks"`
}

type TriageProposalResponse struct {
	ID             string         `json:"id"`
	IssueID        string         `json:"issue_id"`
	WorkspaceID    string         `json:"workspace_id"`
	Status         string         `json:"status"`
	ProposedByType string         `json:"proposed_by_type"`
	ProposedByID   string         `json:"proposed_by_id"`
	Proposal       any            `json:"proposal"`
	CreatedAt      string         `json:"created_at"`
	UpdatedAt      string         `json:"updated_at"`
}

type TriageFinalizeRequest struct {
	ProposalID string `json:"proposal_id"`
}

type TaskResponse struct {
	ID           string              `json:"id"`
	WorkspaceID  string              `json:"workspace_id"`
	Number       int32               `json:"number"`
	Title        string              `json:"title"`
	Description  string              `json:"description"`
	Status       string              `json:"status"`
	Priority     string              `json:"priority"`
	Suitability  *string             `json:"suitability,omitempty"`
	ManualTest   *string             `json:"manual_test,omitempty"`
	IssueID      *string             `json:"issue_id,omitempty"`
	CreatorType  string              `json:"creator_type"`
	CreatorID    string              `json:"creator_id"`
	CreatedAt    string              `json:"created_at"`
	UpdatedAt    string              `json:"updated_at"`
	Dependencies []DependencyResponse `json:"dependencies,omitempty"`
}

type DependencyResponse struct {
	TaskID          string `json:"task_id"`
	DependsOnTaskID string `json:"depends_on_task_id"`
	Type            string `json:"type"`
}

type TriageFinalizeResponse struct {
	Proposal TriageProposalResponse `json:"proposal"`
	Tasks    []TaskResponse         `json:"tasks"`
}

// --- Helpers -----------------------------------------------------------------

func triageProposalToResponse(p db.TriageProposal) TriageProposalResponse {
	var proposal any
	if err := json.Unmarshal(p.Proposal, &proposal); err != nil {
		slog.Warn("failed to unmarshal triage proposal JSON", "proposal_id", uuidToString(p.ID), "error", err)
	}
	return TriageProposalResponse{
		ID:             uuidToString(p.ID),
		IssueID:        uuidToString(p.IssueID),
		WorkspaceID:    uuidToString(p.WorkspaceID),
		Status:         p.Status,
		ProposedByType: p.ProposedByType,
		ProposedByID:   uuidToString(p.ProposedByID),
		Proposal:       proposal,
		CreatedAt:      timestampToString(p.CreatedAt),
		UpdatedAt:      timestampToString(p.UpdatedAt),
	}
}

func planTaskToResponse(t db.Task) TaskResponse {
	return TaskResponse{
		ID:          uuidToString(t.ID),
		WorkspaceID: uuidToString(t.WorkspaceID),
		Number:      t.Number,
		Title:       t.Title,
		Description: t.Description,
		Status:      t.Status,
		Priority:    t.Priority,
		Suitability: textToPtr(t.Suitability),
		ManualTest:  textToPtr(t.ManualTest),
		IssueID:     uuidToPtr(t.IssueID),
		CreatorType: t.CreatorType,
		CreatorID:   uuidToString(t.CreatorID),
		CreatedAt:   timestampToString(t.CreatedAt),
		UpdatedAt:   timestampToString(t.UpdatedAt),
	}
}

// --- Handlers ----------------------------------------------------------------

// CreateTriageProposal persists a triage agent's proposed task breakdown for
// an issue. Called by the AutoAgent submit_plan tool.
//
// POST /api/issues/{id}/triage/proposal
func (h *Handler) CreateTriageProposal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	issue, ok := h.loadIssueForUser(w, r, id)
	if !ok {
		return
	}

	var req TriageProposalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if len(req.Tasks) == 0 {
		writeError(w, http.StatusBadRequest, "at least one task is required")
		return
	}

	for i, t := range req.Tasks {
		if t.Title == "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("task[%d].title is required", i))
			return
		}
		if t.Priority == "" {
			req.Tasks[i].Priority = "medium"
		}
		for _, dep := range t.Dependencies {
			if dep.RefIndex < 0 || dep.RefIndex >= len(req.Tasks) {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("task[%d] dependency ref_index %d out of range", i, dep.RefIndex))
				return
			}
			if dep.RefIndex == i {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("task[%d] cannot depend on itself", i))
				return
			}
			switch dep.Type {
			case "blocks", "blocked_by", "related":
			default:
				writeError(w, http.StatusBadRequest, fmt.Sprintf("task[%d] dependency type %q is invalid", i, dep.Type))
				return
			}
		}
	}

	workspaceID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	creatorType, creatorID := h.resolveActor(r, requestUserID(r), workspaceID)
	creatorUUID, ok := parseUUIDOrBadRequest(w, creatorID, "creator_id")
	if !ok {
		return
	}

	proposalJSON, err := json.Marshal(req.Tasks)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode proposal")
		return
	}

	proposal, err := h.Queries.CreateTriageProposal(r.Context(), db.CreateTriageProposalParams{
		IssueID:        issue.ID,
		WorkspaceID:    wsUUID,
		ProposedByType: creatorType,
		ProposedByID:   creatorUUID,
		Proposal:       proposalJSON,
	})
	if err != nil {
		slog.Warn("create triage proposal failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create proposal")
		return
	}

	writeJSON(w, http.StatusCreated, triageProposalToResponse(proposal))
}

// FinalizeTriageProposal approves a pending triage proposal and materialises
// the proposed tasks + dependencies in a single transaction. Also transitions
// the issue status to "triaged".
//
// POST /api/issues/{id}/triage/finalize
func (h *Handler) FinalizeTriageProposal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	issue, ok := h.loadIssueForUser(w, r, id)
	if !ok {
		return
	}

	var req TriageFinalizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ProposalID == "" {
		writeError(w, http.StatusBadRequest, "proposal_id is required")
		return
	}

	workspaceID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	proposalUUID, ok := parseUUIDOrBadRequest(w, req.ProposalID, "proposal_id")
	if !ok {
		return
	}

	proposal, err := h.Queries.GetTriageProposalInWorkspace(r.Context(), db.GetTriageProposalInWorkspaceParams{
		ID:          proposalUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "proposal not found")
		return
	}

	if uuidToString(proposal.IssueID) != uuidToString(issue.ID) {
		writeError(w, http.StatusBadRequest, "proposal does not belong to this issue")
		return
	}

	if proposal.Status != "pending" {
		writeError(w, http.StatusConflict, fmt.Sprintf("proposal already %s", proposal.Status))
		return
	}

	var proposedTasks []ProposedTask
	if err := json.Unmarshal(proposal.Proposal, &proposedTasks); err != nil {
		slog.Warn("corrupt triage proposal JSON", "proposal_id", req.ProposalID, "error", err)
		writeError(w, http.StatusInternalServerError, "corrupt proposal data")
		return
	}

	actorType, actorID := h.resolveActor(r, requestUserID(r), workspaceID)
	actorUUID, ok := parseUUIDOrBadRequest(w, actorID, "actor_id")
	if !ok {
		return
	}

	var createdTasks []db.Task
	var createdDeps []db.TaskDependency

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	taskCount := int32(len(proposedTasks))
	counterAfter, err := qtx.IncrementTaskCounter(r.Context(), db.IncrementTaskCounterParams{
		ID:          wsUUID,
		TaskCounter: taskCount,
	})
	if err != nil {
		slog.Warn("increment task counter failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to allocate task numbers")
		return
	}
	firstNumber := counterAfter - taskCount + 1

	for i, pt := range proposedTasks {
		priority := pt.Priority
		if priority == "" {
			priority = "medium"
		}

		task, err := qtx.CreateTask(r.Context(), db.CreateTaskParams{
			WorkspaceID: wsUUID,
			Number:      firstNumber + int32(i),
			Title:       pt.Title,
			Description: pt.Description,
			Status:      "pending",
			Priority:    priority,
			Suitability: ptrToText(pt.Suitability),
			ManualTest:  ptrToText(pt.ManualTest),
			IssueID:     issue.ID,
			CreatorType: actorType,
			CreatorID:   actorUUID,
		})
		if err != nil {
			slog.Warn("create task failed", append(logger.RequestAttrs(r), "error", err, "task_index", i)...)
			writeError(w, http.StatusInternalServerError, "failed to create tasks")
			return
		}
		createdTasks = append(createdTasks, task)
	}

	for i, pt := range proposedTasks {
		for _, dep := range pt.Dependencies {
			if dep.RefIndex < 0 || dep.RefIndex >= len(createdTasks) {
				slog.Warn("skipping invalid dependency ref_index during finalize",
					"proposal_id", req.ProposalID, "task_index", i, "ref_index", dep.RefIndex, "task_count", len(createdTasks))
				continue
			}
			err := qtx.CreateTaskDependency(r.Context(), db.CreateTaskDependencyParams{
				TaskID:          createdTasks[i].ID,
				DependsOnTaskID: createdTasks[dep.RefIndex].ID,
				Type:            dep.Type,
			})
			if err != nil {
				slog.Warn("create task dependency failed", append(logger.RequestAttrs(r), "error", err, "task_index", i)...)
				writeError(w, http.StatusInternalServerError, "failed to create task dependencies")
				return
			}
			createdDeps = append(createdDeps, db.TaskDependency{
				TaskID:          createdTasks[i].ID,
				DependsOnTaskID: createdTasks[dep.RefIndex].ID,
				Type:            dep.Type,
			})
		}
	}

	_, err = qtx.UpdateTriageProposalStatus(r.Context(), db.UpdateTriageProposalStatusParams{
		ID:     proposalUUID,
		Status: "approved",
	})
	if err != nil {
		slog.Warn("approve triage proposal failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to approve proposal")
		return
	}

	updatedIssue, err := qtx.UpdateIssueStatus(r.Context(), db.UpdateIssueStatusParams{
		ID:     issue.ID,
		Status: "triaged",
	})
	if err != nil {
		slog.Warn("update issue status to triaged failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to update issue status")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Warn("commit triage finalize failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to finalize triage")
		return
	}

	h.publish(protocol.EventIssueUpdated, workspaceID, actorType, actorID, issueToResponse(updatedIssue, h.getIssuePrefix(r.Context(), issue.WorkspaceID)))

	depMap := make(map[string][]DependencyResponse)
	for _, d := range createdDeps {
		tid := uuidToString(d.TaskID)
		depMap[tid] = append(depMap[tid], DependencyResponse{
			TaskID:          tid,
			DependsOnTaskID: uuidToString(d.DependsOnTaskID),
			Type:            d.Type,
		})
	}

	taskResponses := make([]TaskResponse, len(createdTasks))
	for i, t := range createdTasks {
		resp := planTaskToResponse(t)
		resp.Dependencies = depMap[uuidToString(t.ID)]
		taskResponses[i] = resp
	}

	updatedProposal := proposal
	updatedProposal.Status = "approved"

	writeJSON(w, http.StatusCreated, TriageFinalizeResponse{
		Proposal: triageProposalToResponse(updatedProposal),
		Tasks:    taskResponses,
	})
}
