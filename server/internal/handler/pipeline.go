package handler

import (
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
	ID           string                  `json:"id"`
	WorkspaceID  string                  `json:"workspace_id"`
	IssueID      string                  `json:"issue_id"`
	Status       string                  `json:"status"`
	CreatorType  string                  `json:"creator_type"`
	CreatorID    string                  `json:"creator_id"`
	CreatedAt    string                  `json:"created_at"`
	UpdatedAt    string                  `json:"updated_at"`
	Tasks        []PlanningTaskResponse  `json:"tasks,omitempty"`
	Dependencies []TaskDependencyResponse `json:"dependencies,omitempty"`
}

func pipelineToResponse(p db.Pipeline) PipelineResponse {
	return PipelineResponse{
		ID:          uuidToString(p.ID),
		WorkspaceID: uuidToString(p.WorkspaceID),
		IssueID:     uuidToString(p.IssueID),
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

// ListPipelines returns paginated pipelines for a workspace.
//
// GET /api/pipelines
func (h *Handler) ListPipelines(w http.ResponseWriter, r *http.Request) {
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
	allDone := true
	anyFailed := false
	anyRunning := false

	for _, t := range tasks {
		switch t.Status {
		case "done":
			// ok
		case "cancelled":
			anyFailed = true
			allDone = false
		case "in_progress":
			anyRunning = true
			allDone = false
		default:
			allDone = false
		}
	}

	if allDone {
		return "completed"
	}
	if anyFailed && !anyRunning {
		return "failed"
	}
	if anyRunning {
		return "running"
	}
	return "pending"
}
