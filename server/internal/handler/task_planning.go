package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

type PlanningTaskResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	Number      int32   `json:"number"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Suitability *string `json:"suitability,omitempty"`
	Branch      *string `json:"branch,omitempty"`
	PR          *string `json:"pr,omitempty"`
	ManualTest  *string `json:"manual_test,omitempty"`
	IssueID     *string `json:"issue_id,omitempty"`
	PipelineID  *string `json:"pipeline_id,omitempty"`
	CreatorType string  `json:"creator_type"`
	CreatorID   string  `json:"creator_id"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func planningTaskToResponse(t db.Task) PlanningTaskResponse {
	return PlanningTaskResponse{
		ID:           uuidToString(t.ID),
		WorkspaceID:  uuidToString(t.WorkspaceID),
		Number:       t.Number,
		Title:        t.Title,
		Description:  t.Description,
		Status:       t.Status,
		Priority:     t.Priority,
		Suitability:  textToPtr(t.Suitability),
		Branch:       textToPtr(t.Branch),
		PR:           textToPtr(t.Pr),
		ManualTest:   textToPtr(t.ManualTest),
		IssueID:    uuidToPtr(t.IssueID),
		PipelineID: uuidToPtr(t.PipelineID),
		CreatorType:  t.CreatorType,
		CreatorID:    uuidToString(t.CreatorID),
		CreatedAt:    timestampToString(t.CreatedAt),
		UpdatedAt:    timestampToString(t.UpdatedAt),
	}
}

type TaskDependencyResponse struct {
	TaskID          string `json:"task_id"`
	DependsOnTaskID string `json:"depends_on_task_id"`
	Type            string `json:"type"`
	CreatedAt       string `json:"created_at"`
}

func taskDependencyToResponse(d db.TaskDependency) TaskDependencyResponse {
	return TaskDependencyResponse{
		TaskID:          uuidToString(d.TaskID),
		DependsOnTaskID: uuidToString(d.DependsOnTaskID),
		Type:            d.Type,
		CreatedAt:       timestampToString(d.CreatedAt),
	}
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

type CreatePlanningTaskRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Suitability *string `json:"suitability"`
	IssueID     *string `json:"issue_id"`
}

type UpdatePlanningTaskRequest struct {
	Title        *string `json:"title"`
	Description  *string `json:"description"`
	Status       *string `json:"status"`
	Priority     *string `json:"priority"`
	Suitability  *string `json:"suitability"`
	Branch       *string `json:"branch"`
	PR           *string `json:"pr"`
	ManualTest   *string `json:"manual_test"`
	IssueID *string `json:"issue_id"`
}

type TaskDependencyRequest struct {
	DependsOnTaskID string `json:"depends_on_task_id"`
	Type            string `json:"type"`
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

var validTaskStatuses = map[string]bool{
	"draft":           true,
	"pending":         true,
	"queued":          true,
	"dispatched":      true,
	"running":         true,
	"human_reviewing": true,
	"done":            true,
	"failed":          true,
	"blocked":         true,
	"cancelled":       true,
}

var validTaskPriorities = map[string]bool{
	"high":   true,
	"medium": true,
	"low":    true,
}

var validSuitabilities = map[string]bool{
	"auto_agent_ready": true,
	"needs_design":     true,
	"needs_human":      true,
	"unknown":          true,
}

var validDependencyTypes = map[string]bool{
	"blocks":     true,
	"blocked_by": true,
	"related":    true,
}

// ---------------------------------------------------------------------------
// loadPlanningTaskForUser resolves a task by UUID within the user's workspace.
// ---------------------------------------------------------------------------

func (h *Handler) loadPlanningTaskForUser(w http.ResponseWriter, r *http.Request, taskID string) (db.Task, bool) {
	if _, ok := requireUserID(w, r); !ok {
		return db.Task{}, false
	}

	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return db.Task{}, false
	}

	idUUID, ok := parseUUIDOrBadRequest(w, taskID, "task id")
	if !ok {
		return db.Task{}, false
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return db.Task{}, false
	}

	task, err := h.Queries.GetTaskInWorkspace(r.Context(), db.GetTaskInWorkspaceParams{
		ID:          idUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "task not found")
		return db.Task{}, false
	}
	return task, true
}

// ---------------------------------------------------------------------------
// Handlers — planning task CRUD
// ---------------------------------------------------------------------------

func (h *Handler) CreatePlanningTask(w http.ResponseWriter, r *http.Request) {
	var req CreatePlanningTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	creatorID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	status := req.Status
	if status == "" {
		status = "pending"
	}
	if !validTaskStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}
	if !validTaskPriorities[priority] {
		writeError(w, http.StatusBadRequest, "invalid priority")
		return
	}

	var suitability pgtype.Text
	if req.Suitability != nil {
		if !validSuitabilities[*req.Suitability] {
			writeError(w, http.StatusBadRequest, "invalid suitability")
			return
		}
		suitability = pgtype.Text{String: *req.Suitability, Valid: true}
	}

	var issueID pgtype.UUID
	if req.IssueID != nil {
		id, ok := parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
		if !ok {
			return
		}
		issueID = id
	}

	creatorType, actualCreatorID := h.resolveActor(r, creatorID, workspaceID)

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)
	taskNumber, err := qtx.IncrementTaskCounter(r.Context(), db.IncrementTaskCounterParams{
		ID:          wsUUID,
		TaskCounter: 1,
	})
	if err != nil {
		slog.Warn("increment task counter failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", workspaceID)...)
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	task, err := qtx.CreateTask(r.Context(), db.CreateTaskParams{
		WorkspaceID: wsUUID,
		Number:      taskNumber,
		Title:       req.Title,
		Description: req.Description,
		Status:      status,
		Priority:    priority,
		Suitability: suitability,
		IssueID:     issueID,
		CreatorType: creatorType,
		CreatorID:   parseUUID(actualCreatorID),
	})
	if err != nil {
		slog.Warn("create task failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", workspaceID)...)
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	resp := planningTaskToResponse(task)
	slog.Info("planning task created", append(logger.RequestAttrs(r), "task_id", resp.ID, "title", task.Title, "workspace_id", workspaceID)...)
	h.publish(protocol.EventPlanningTaskCreated, workspaceID, creatorType, actualCreatorID, map[string]any{"task": resp})

	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) ListPlanningTasks(w http.ResponseWriter, r *http.Request) {
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

	var statusFilter pgtype.Text
	if s := r.URL.Query().Get("status"); s != "" {
		statusFilter = pgtype.Text{String: s, Valid: true}
	}
	var priorityFilter pgtype.Text
	if p := r.URL.Query().Get("priority"); p != "" {
		priorityFilter = pgtype.Text{String: p, Valid: true}
	}
	var issueFilter pgtype.UUID
	if i := r.URL.Query().Get("issue_id"); i != "" {
		id, ok := parseUUIDOrBadRequest(w, i, "issue_id")
		if !ok {
			return
		}
		issueFilter = id
	}

	ctx := r.Context()
	tasks, err := h.Queries.ListTasks(ctx, db.ListTasksParams{
		WorkspaceID: wsUUID,
		Limit:       int32(limit),
		Offset:      int32(offset),
		Status:      statusFilter,
		Priority:    priorityFilter,
		IssueID:     issueFilter,
	})
	if err != nil {
		slog.Warn("list tasks failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}

	total, err := h.Queries.CountTasks(ctx, db.CountTasksParams{
		WorkspaceID: wsUUID,
		Status:      statusFilter,
		Priority:    priorityFilter,
		IssueID:     issueFilter,
	})
	if err != nil {
		total = int64(len(tasks))
	}

	resp := make([]PlanningTaskResponse, len(tasks))
	for i, t := range tasks {
		resp[i] = planningTaskToResponse(t)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tasks": resp,
		"total": total,
	})
}

func (h *Handler) GetPlanningTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, planningTaskToResponse(task))
}

func (h *Handler) UpdatePlanningTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	prevTask, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}
	userID := requestUserID(r)
	workspaceID := uuidToString(prevTask.WorkspaceID)

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	var req UpdatePlanningTaskRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var rawFields map[string]json.RawMessage
	json.Unmarshal(bodyBytes, &rawFields)

	params := db.UpdateTaskParams{
		ID:          prevTask.ID,
		WorkspaceID: prevTask.WorkspaceID,
		Suitability: prevTask.Suitability,
		Branch:      prevTask.Branch,
		Pr:          prevTask.Pr,
		ManualTest:  prevTask.ManualTest,
		IssueID:     prevTask.IssueID,
		PipelineID:  prevTask.PipelineID,
	}

	if req.Title != nil {
		params.Title = pgtype.Text{String: *req.Title, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.Status != nil {
		if !validTaskStatuses[*req.Status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
		params.Status = pgtype.Text{String: *req.Status, Valid: true}
	}
	if req.Priority != nil {
		if !validTaskPriorities[*req.Priority] {
			writeError(w, http.StatusBadRequest, "invalid priority")
			return
		}
		params.Priority = pgtype.Text{String: *req.Priority, Valid: true}
	}
	if _, ok := rawFields["suitability"]; ok {
		if req.Suitability != nil {
			if !validSuitabilities[*req.Suitability] {
				writeError(w, http.StatusBadRequest, "invalid suitability")
				return
			}
			params.Suitability = pgtype.Text{String: *req.Suitability, Valid: true}
		} else {
			params.Suitability = pgtype.Text{Valid: false}
		}
	}
	if _, ok := rawFields["branch"]; ok {
		if req.Branch != nil {
			params.Branch = pgtype.Text{String: *req.Branch, Valid: true}
		} else {
			params.Branch = pgtype.Text{Valid: false}
		}
	}
	if _, ok := rawFields["pr"]; ok {
		if req.PR != nil {
			params.Pr = pgtype.Text{String: *req.PR, Valid: true}
		} else {
			params.Pr = pgtype.Text{Valid: false}
		}
	}
	if _, ok := rawFields["manual_test"]; ok {
		if req.ManualTest != nil {
			params.ManualTest = pgtype.Text{String: *req.ManualTest, Valid: true}
		} else {
			params.ManualTest = pgtype.Text{Valid: false}
		}
	}
	if _, ok := rawFields["issue_id"]; ok {
		if req.IssueID != nil {
			iid, ok := parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
			if !ok {
				return
			}
			params.IssueID = iid
		} else {
			params.IssueID = pgtype.UUID{Valid: false}
		}
	}
	task, err := h.Queries.UpdateTask(r.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		slog.Warn("update task failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to update task")
		return
	}

	resp := planningTaskToResponse(task)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	h.publish(protocol.EventPlanningTaskUpdated, workspaceID, actorType, actorID, map[string]any{"task": resp})

	if task.PipelineID.Valid {
		h.recomputePipelineStatus(r, uuidToString(task.PipelineID))
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeletePlanningTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}
	userID := requestUserID(r)
	workspaceID := uuidToString(task.WorkspaceID)

	if _, err := h.Queries.DeleteTask(r.Context(), db.DeleteTaskParams{
		ID:          task.ID,
		WorkspaceID: task.WorkspaceID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		slog.Warn("delete task failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to delete task")
		return
	}

	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	h.publish(protocol.EventPlanningTaskDeleted, workspaceID, actorType, actorID, map[string]any{"task_id": uuidToString(task.ID)})
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Handlers — task lifecycle actions (dispatch, cancel, retry)
// ---------------------------------------------------------------------------

func (h *Handler) DispatchPlanningTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}

	if task.Status != "pending" && task.Status != "blocked" {
		writeError(w, http.StatusConflict, "task must be in pending or blocked status to dispatch")
		return
	}

	updated, err := h.Queries.UpdateTaskStatus(r.Context(), db.UpdateTaskStatusParams{
		ID:     task.ID,
		Status: "running",
	})
	if err != nil {
		slog.Warn("dispatch task failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to dispatch task")
		return
	}

	userID := requestUserID(r)
	workspaceID := uuidToString(task.WorkspaceID)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)

	resp := planningTaskToResponse(updated)
	h.publish(protocol.EventPlanningTaskDispatched, workspaceID, actorType, actorID, map[string]any{"task": resp})

	if updated.PipelineID.Valid {
		h.recomputePipelineStatus(r, uuidToString(updated.PipelineID))
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CancelPlanningTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}

	if task.Status == "done" || task.Status == "cancelled" {
		writeError(w, http.StatusConflict, "task is already in a terminal status")
		return
	}

	updated, err := h.Queries.UpdateTaskStatus(r.Context(), db.UpdateTaskStatusParams{
		ID:     task.ID,
		Status: "cancelled",
	})
	if err != nil {
		slog.Warn("cancel task failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to cancel task")
		return
	}

	userID := requestUserID(r)
	workspaceID := uuidToString(task.WorkspaceID)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)

	resp := planningTaskToResponse(updated)
	h.publish(protocol.EventPlanningTaskCancelled, workspaceID, actorType, actorID, map[string]any{"task": resp})

	if updated.PipelineID.Valid {
		h.recomputePipelineStatus(r, uuidToString(updated.PipelineID))
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) RetryPlanningTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}

	if task.Status != "cancelled" && task.Status != "done" {
		writeError(w, http.StatusConflict, "only cancelled or done tasks can be retried")
		return
	}

	updated, err := h.Queries.UpdateTaskStatus(r.Context(), db.UpdateTaskStatusParams{
		ID:     task.ID,
		Status: "pending",
	})
	if err != nil {
		slog.Warn("retry task failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to retry task")
		return
	}

	userID := requestUserID(r)
	workspaceID := uuidToString(task.WorkspaceID)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)

	resp := planningTaskToResponse(updated)
	h.publish(protocol.EventPlanningTaskUpdated, workspaceID, actorType, actorID, map[string]any{"task": resp})

	if updated.PipelineID.Valid {
		h.recomputePipelineStatus(r, uuidToString(updated.PipelineID))
	}

	writeJSON(w, http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Handlers — task dependency management
// ---------------------------------------------------------------------------

func (h *Handler) AddTaskDependency(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}

	var req TaskDependencyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.DependsOnTaskID == "" {
		writeError(w, http.StatusBadRequest, "depends_on_task_id is required")
		return
	}
	if !validDependencyTypes[req.Type] {
		writeError(w, http.StatusBadRequest, "type must be one of: blocks, blocked_by, related")
		return
	}

	depUUID, ok := parseUUIDOrBadRequest(w, req.DependsOnTaskID, "depends_on_task_id")
	if !ok {
		return
	}

	// Self-reference check
	if uuidToString(task.ID) == req.DependsOnTaskID {
		writeError(w, http.StatusBadRequest, "a task cannot depend on itself")
		return
	}

	// Verify the dependency target exists in the same workspace
	wsUUID, _ := parseUUIDOrBadRequest(w, uuidToString(task.WorkspaceID), "workspace_id")
	if _, err := h.Queries.GetTaskInWorkspace(r.Context(), db.GetTaskInWorkspaceParams{
		ID:          depUUID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "dependency target task not found")
		return
	}

	if err := h.Queries.CreateTaskDependency(r.Context(), db.CreateTaskDependencyParams{
		TaskID:          task.ID,
		DependsOnTaskID: depUUID,
		Type:            req.Type,
	}); err != nil {
		slog.Warn("add task dependency failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to add dependency")
		return
	}

	deps, err := h.Queries.ListTaskDependencies(r.Context(), task.ID)
	if err != nil {
		slog.Warn("list task dependencies failed after add", append(logger.RequestAttrs(r), "error", err)...)
		writeJSON(w, http.StatusCreated, map[string]any{})
		return
	}

	resp := make([]TaskDependencyResponse, len(deps))
	for i, d := range deps {
		resp[i] = taskDependencyToResponse(d)
	}
	writeJSON(w, http.StatusCreated, map[string]any{"dependencies": resp})
}

func (h *Handler) RemoveTaskDependency(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}

	var req TaskDependencyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.DependsOnTaskID == "" {
		writeError(w, http.StatusBadRequest, "depends_on_task_id is required")
		return
	}
	if !validDependencyTypes[req.Type] {
		writeError(w, http.StatusBadRequest, "type must be one of: blocks, blocked_by, related")
		return
	}

	depUUID, ok := parseUUIDOrBadRequest(w, req.DependsOnTaskID, "depends_on_task_id")
	if !ok {
		return
	}

	if err := h.Queries.DeleteTaskDependency(r.Context(), db.DeleteTaskDependencyParams{
		TaskID:          task.ID,
		DependsOnTaskID: depUUID,
		Type:            req.Type,
	}); err != nil {
		slog.Warn("remove task dependency failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to remove dependency")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListPlanningTaskDependencies(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, ok := h.loadPlanningTaskForUser(w, r, id)
	if !ok {
		return
	}

	deps, err := h.Queries.ListTaskDependencies(r.Context(), task.ID)
	if err != nil {
		slog.Warn("list task dependencies failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list dependencies")
		return
	}

	resp := make([]TaskDependencyResponse, len(deps))
	for i, d := range deps {
		resp[i] = taskDependencyToResponse(d)
	}
	writeJSON(w, http.StatusOK, map[string]any{"dependencies": resp})
}
