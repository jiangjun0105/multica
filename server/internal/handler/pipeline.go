package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type PipelineResponse struct {
	ID           string                   `json:"id"`
	WorkspaceID  string                   `json:"workspace_id"`
	IssueID      *string                  `json:"issue_id"`
	Status       string                   `json:"status"`
	CreatorType  string                   `json:"creator_type"`
	CreatorID    string                   `json:"creator_id"`
	CreatedAt    string                   `json:"created_at"`
	UpdatedAt    string                   `json:"updated_at"`
	Tasks        []PlanningTaskResponse   `json:"tasks,omitempty"`
	Dependencies []TaskDependencyResponse `json:"dependencies,omitempty"`
}

func pipelineToResponse(p db.Pipeline) PipelineResponse {
	return PipelineResponse{
		ID:          uuidToString(p.ID),
		WorkspaceID: uuidToString(p.WorkspaceID),
		IssueID:     uuidToPtr(p.IssueID),
		Status:      p.Status,
		CreatorType: p.CreatorType,
		CreatorID:   uuidToString(p.CreatorID),
		CreatedAt:   timestampToString(p.CreatedAt),
		UpdatedAt:   timestampToString(p.UpdatedAt),
	}
}

func (h *Handler) loadPipelineForUser(w http.ResponseWriter, r *http.Request, pipelineID string) (db.Pipeline, bool) {
	if _, ok := requireUserID(w, r); !ok {
		return db.Pipeline{}, false
	}

	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return db.Pipeline{}, false
	}

	idUUID, ok := parseUUIDOrBadRequest(w, pipelineID, "pipeline id")
	if !ok {
		return db.Pipeline{}, false
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return db.Pipeline{}, false
	}

	pipeline, err := h.Queries.GetPipelineInWorkspace(r.Context(), db.GetPipelineInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "pipeline not found")
		return db.Pipeline{}, false
	}
	return pipeline, true
}

// GetPipeline returns a pipeline with its tasks and dependencies.
//
// GET /api/pipelines/{id}
func (h *Handler) GetPipeline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pipeline, ok := h.loadPipelineForUser(w, r, id)
	if !ok {
		return
	}

	tasks, err := h.Queries.ListTasksByPipelineID(r.Context(), pipeline.ID)
	if err != nil {
		slog.Warn("list pipeline tasks failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to load pipeline tasks")
		return
	}

	taskIDs := make([]pgtype.UUID, len(tasks))
	for i, t := range tasks {
		taskIDs[i] = t.ID
	}

	var depResps []TaskDependencyResponse
	if len(taskIDs) > 0 {
		deps, err := h.Queries.ListTaskDependenciesByTaskIDs(r.Context(), taskIDs)
		if err != nil {
			slog.Warn("list pipeline task dependencies failed", append(logger.RequestAttrs(r), "error", err)...)
		} else {
			depResps = make([]TaskDependencyResponse, len(deps))
			for i, d := range deps {
				depResps[i] = taskDependencyToResponse(d)
			}
		}
	}

	resp := pipelineToResponse(pipeline)
	taskResps := make([]PlanningTaskResponse, len(tasks))
	for i, t := range tasks {
		taskResps[i] = planningTaskToResponse(t)
	}
	resp.Tasks = taskResps
	resp.Dependencies = depResps

	writeJSON(w, http.StatusOK, resp)
}

// CreatePipelineTaskInput is one task in the CreatePipeline request body.
//
// `depends_on` is a list of zero-based indices into the `tasks` array (NOT
// task UUIDs — the tasks don't exist yet when the request is built). Each
// index produces a `task_dependency` row of type `blocked_by` between the
// task at index i and the task at the referenced index.
type CreatePipelineTaskInput struct {
	Title          string  `json:"title"`
	Description    string  `json:"description"`
	Status         string  `json:"status"`
	Priority       string  `json:"priority"`
	Suitability    *string `json:"suitability"`
	IsDraft        bool    `json:"is_draft"`
	TransitionMode string  `json:"transition_mode"`
	DependsOn      []int   `json:"depends_on"`
}

var validTransitionModes = map[string]bool{
	"auto":   true,
	"manual": true,
}

// CreatePipelineRequest is the body for POST /api/pipelines.
//
// `issue_id` is optional. When set, the pipeline is anchored to that issue
// (the same model as triage-finalize). When omitted, the pipeline stands
// alone — for cross-issue work imported from external systems like
// auto-agent.
type CreatePipelineRequest struct {
	IssueID *string                   `json:"issue_id"`
	Status  string                    `json:"status"`
	Tasks   []CreatePipelineTaskInput `json:"tasks"`
}

// CreatePipeline creates a pipeline plus its tasks and dependency edges in a
// single transaction.
//
// POST /api/pipelines
func (h *Handler) CreatePipeline(w http.ResponseWriter, r *http.Request) {
	var req CreatePipelineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Tasks) == 0 {
		writeError(w, http.StatusBadRequest, "tasks is required")
		return
	}

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	pipelineStatus := req.Status
	if pipelineStatus == "" {
		pipelineStatus = "pending"
	}
	if !validPipelineStatuses[pipelineStatus] {
		writeError(w, http.StatusBadRequest, "invalid pipeline status")
		return
	}

	var issueUUID pgtype.UUID
	if req.IssueID != nil && *req.IssueID != "" {
		id, ok := parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
		if !ok {
			return
		}
		issueUUID = id
	}

	// Validate each task's depends_on indices up-front so we don't partially
	// create a pipeline and then bail on a bad index.
	for i, t := range req.Tasks {
		if t.Title == "" {
			writeError(w, http.StatusBadRequest, "task title is required")
			return
		}
		status := t.Status
		if status == "" {
			status = "pending"
		}
		if !validTaskStatuses[status] {
			writeError(w, http.StatusBadRequest, "invalid task status")
			return
		}
		priority := t.Priority
		if priority == "" {
			priority = "medium"
		}
		if !validTaskPriorities[priority] {
			writeError(w, http.StatusBadRequest, "invalid task priority")
			return
		}
		if t.Suitability != nil && !validSuitabilities[*t.Suitability] {
			writeError(w, http.StatusBadRequest, "invalid task suitability")
			return
		}
		if t.TransitionMode != "" && !validTransitionModes[t.TransitionMode] {
			writeError(w, http.StatusBadRequest, "invalid task transition_mode")
			return
		}
		for _, dep := range t.DependsOn {
			if dep < 0 || dep >= len(req.Tasks) {
				writeError(w, http.StatusBadRequest, "depends_on index out of range")
				return
			}
			if dep == i {
				writeError(w, http.StatusBadRequest, "task cannot depend on itself")
				return
			}
		}
	}

	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	actorUUID, ok := parseUUIDOrBadRequest(w, actorID, "actor_id")
	if !ok {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	pipeline, err := qtx.CreatePipeline(r.Context(), db.CreatePipelineParams{
		WorkspaceID: wsUUID,
		IssueID:     issueUUID, // zero pgtype.UUID with Valid=false becomes NULL
		Status:      pipelineStatus,
		CreatorType: actorType,
		CreatorID:   actorUUID,
	})
	if err != nil {
		slog.Warn("create pipeline failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create pipeline")
		return
	}

	taskCount := int32(len(req.Tasks))
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

	createdTasks := make([]db.Task, len(req.Tasks))
	for i, t := range req.Tasks {
		status := t.Status
		if status == "" {
			status = "pending"
		}
		priority := t.Priority
		if priority == "" {
			priority = "medium"
		}
		var suitability pgtype.Text
		if t.Suitability != nil {
			suitability = pgtype.Text{String: *t.Suitability, Valid: true}
		}
		var transitionMode pgtype.Text
		if t.TransitionMode != "" {
			transitionMode = pgtype.Text{String: t.TransitionMode, Valid: true}
		}
		task, err := qtx.CreateTask(r.Context(), db.CreateTaskParams{
			WorkspaceID:    wsUUID,
			Number:         firstNumber + int32(i),
			Title:          t.Title,
			Description:    t.Description,
			Status:         status,
			Priority:       priority,
			Suitability:    suitability,
			IssueID:        issueUUID,
			PipelineID:     pipeline.ID,
			CreatorType:    actorType,
			CreatorID:      actorUUID,
			IsDraft:        pgtype.Bool{Bool: t.IsDraft, Valid: true},
			TransitionMode: transitionMode,
		})
		if err != nil {
			slog.Warn("create pipeline task failed", append(logger.RequestAttrs(r), "error", err, "index", i)...)
			writeError(w, http.StatusInternalServerError, "failed to create pipeline tasks")
			return
		}
		createdTasks[i] = task
	}

	var createdDeps []db.TaskDependency
	for i, t := range req.Tasks {
		for _, depIdx := range t.DependsOn {
			err := qtx.CreateTaskDependency(r.Context(), db.CreateTaskDependencyParams{
				TaskID:          createdTasks[i].ID,
				DependsOnTaskID: createdTasks[depIdx].ID,
				Type:            "blocked_by",
			})
			if err != nil {
				slog.Warn("create task dependency failed", append(logger.RequestAttrs(r), "error", err, "task_index", i, "dep_index", depIdx)...)
				writeError(w, http.StatusInternalServerError, "failed to create task dependencies")
				return
			}
			createdDeps = append(createdDeps, db.TaskDependency{
				TaskID:          createdTasks[i].ID,
				DependsOnTaskID: createdTasks[depIdx].ID,
				Type:            "blocked_by",
			})
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Warn("commit create pipeline failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create pipeline")
		return
	}

	resp := pipelineToResponse(pipeline)
	resp.Tasks = make([]PlanningTaskResponse, len(createdTasks))
	for i, t := range createdTasks {
		resp.Tasks[i] = planningTaskToResponse(t)
	}
	resp.Dependencies = make([]TaskDependencyResponse, len(createdDeps))
	for i, d := range createdDeps {
		resp.Dependencies[i] = taskDependencyToResponse(d)
	}

	h.publish(protocol.EventPipelineCreated, workspaceID, actorType, actorID, pipelineToResponse(pipeline))
	writeJSON(w, http.StatusCreated, resp)
}

var validPipelineStatuses = map[string]bool{
	"pending":   true,
	"running":   true,
	"completed": true,
	"failed":    true,
	"cancelled": true,
}

// ListPipelines returns paginated pipelines for a workspace.
//
// GET /api/pipelines
func (h *Handler) ListPipelines(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireUserID(w, r); !ok {
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > 100 {
		limit = 100
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	ctx := r.Context()
	pipelines, err := h.Queries.ListPipelines(ctx, db.ListPipelinesParams{
		WorkspaceID: wsUUID,
		Limit:       int32(limit),
		Offset:      int32(offset),
	})
	if err != nil {
		slog.Warn("list pipelines failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list pipelines")
		return
	}

	total, err := h.Queries.CountPipelines(ctx, wsUUID)
	if err != nil {
		total = int64(len(pipelines))
	}

	resp := make([]PipelineResponse, len(pipelines))
	for i, p := range pipelines {
		resp[i] = pipelineToResponse(p)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"pipelines": resp,
		"total":     total,
	})
}

// CancelPipeline cancels a pipeline and all its non-terminal tasks.
//
// POST /api/pipelines/{id}/cancel
func (h *Handler) CancelPipeline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pipeline, ok := h.loadPipelineForUser(w, r, id)
	if !ok {
		return
	}

	if pipeline.Status == "completed" || pipeline.Status == "cancelled" {
		writeError(w, http.StatusConflict, "pipeline is already in a terminal status")
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	updated, err := qtx.UpdatePipelineStatus(r.Context(), db.UpdatePipelineStatusParams{
		ID:     pipeline.ID,
		Status: "cancelled",
	})
	if err != nil {
		slog.Warn("cancel pipeline failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to cancel pipeline")
		return
	}

	tasks, err := qtx.ListTasksByPipelineID(r.Context(), pipeline.ID)
	if err != nil {
		slog.Warn("list pipeline tasks for cancel failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to cancel pipeline tasks")
		return
	}

	for _, t := range tasks {
		if t.Status == "done" || t.Status == "cancelled" {
			continue
		}
		_, err := qtx.UpdateTaskStatus(r.Context(), db.UpdateTaskStatusParams{
			ID:     t.ID,
			Status: "cancelled",
		})
		if err != nil {
			slog.Warn("cancel pipeline task failed", append(logger.RequestAttrs(r), "error", err, "task_id", uuidToString(t.ID))...)
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Warn("commit cancel pipeline failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to cancel pipeline")
		return
	}

	userID := requestUserID(r)
	workspaceID := uuidToString(pipeline.WorkspaceID)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	h.publish(protocol.EventPipelineUpdated, workspaceID, actorType, actorID, pipelineToResponse(updated))

	writeJSON(w, http.StatusOK, pipelineToResponse(updated))
}

// recomputePipelineStatus recalculates a pipeline's status from its tasks.
// Call this after any task status change if the task belongs to a pipeline.
func (h *Handler) recomputePipelineStatus(r *http.Request, pipelineID string) {
	pUUID, err := util.ParseUUID(pipelineID)
	if err != nil {
		return
	}

	pipeline, err := h.Queries.GetPipeline(r.Context(), pUUID)
	if err != nil {
		return
	}
	if pipeline.Status == "cancelled" {
		return
	}

	tasks, err := h.Queries.ListTasksByPipelineID(r.Context(), pUUID)
	if err != nil || len(tasks) == 0 {
		return
	}

	newStatus := rollupPipelineStatus(tasks)
	if newStatus == pipeline.Status {
		return
	}

	updated, err := h.Queries.UpdatePipelineStatus(r.Context(), db.UpdatePipelineStatusParams{
		ID:     pUUID,
		Status: newStatus,
	})
	if err != nil {
		slog.Warn("recompute pipeline status failed", "pipeline_id", pipelineID, "error", err)
		return
	}

	userID := requestUserID(r)
	workspaceID := uuidToString(pipeline.WorkspaceID)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	h.publish(protocol.EventPipelineUpdated, workspaceID, actorType, actorID, pipelineToResponse(updated))
}

func rollupPipelineStatus(tasks []db.Task) string {
	var doneCount, cancelledCount, runningCount int

	for _, t := range tasks {
		switch t.Status {
		case "done":
			doneCount++
		case "cancelled":
			cancelledCount++
		case "in_progress":
			runningCount++
		}
	}

	terminal := doneCount + cancelledCount
	allTerminal := terminal == len(tasks)

	if allTerminal && cancelledCount == len(tasks) {
		return "cancelled"
	}
	if allTerminal {
		return "completed"
	}
	if runningCount > 0 {
		return "running"
	}
	return "pending"
}
