package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPlanningTaskCRUD(t *testing.T) {
	// Create
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"title":       "Implement auth flow",
		"description": "Build the login page",
		"priority":    "high",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreatePlanningTask: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&created)
	if created.Title != "Implement auth flow" {
		t.Fatalf("CreatePlanningTask: unexpected title: %s", created.Title)
	}
	if created.Priority != "high" {
		t.Fatalf("CreatePlanningTask: unexpected priority: %s", created.Priority)
	}
	if created.Status != "pending" {
		t.Fatalf("CreatePlanningTask: expected default status 'pending', got %s", created.Status)
	}
	if created.Number < 1 {
		t.Fatalf("CreatePlanningTask: expected positive number, got %d", created.Number)
	}
	taskID := created.ID

	t.Cleanup(func() {
		w := httptest.NewRecorder()
		req := newRequest("DELETE", "/api/tasks/"+taskID, nil)
		req = withURLParam(req, "id", taskID)
		testHandler.DeletePlanningTask(w, req)
	})

	// List
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks", nil)
	testHandler.ListPlanningTasks(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListPlanningTasks: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listResp struct {
		Tasks []PlanningTaskResponse `json:"tasks"`
		Total int64                  `json:"total"`
	}
	json.NewDecoder(w.Body).Decode(&listResp)
	if listResp.Total < 1 {
		t.Fatalf("ListPlanningTasks: expected >= 1 task, got %d", listResp.Total)
	}
	found := false
	for _, tsk := range listResp.Tasks {
		if tsk.ID == taskID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("ListPlanningTasks: created task not found in list")
	}

	// Get
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks/"+taskID, nil)
	req = withURLParam(req, "id", taskID)
	testHandler.GetPlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GetPlanningTask: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&got)
	if got.ID != taskID {
		t.Fatalf("GetPlanningTask: expected id %s, got %s", taskID, got.ID)
	}

	// Update (PATCH)
	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/tasks/"+taskID, map[string]any{
		"title":    "Updated auth flow",
		"priority": "low",
		"branch":   "feat/auth",
	})
	req = withURLParam(req, "id", taskID)
	testHandler.UpdatePlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdatePlanningTask: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var updated PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&updated)
	if updated.Title != "Updated auth flow" {
		t.Fatalf("UpdatePlanningTask: unexpected title: %s", updated.Title)
	}
	if updated.Priority != "low" {
		t.Fatalf("UpdatePlanningTask: unexpected priority: %s", updated.Priority)
	}
	if updated.Branch == nil || *updated.Branch != "feat/auth" {
		t.Fatalf("UpdatePlanningTask: unexpected branch: %v", updated.Branch)
	}

	// Get not found
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks/00000000-0000-0000-0000-000000000000", nil)
	req = withURLParam(req, "id", "00000000-0000-0000-0000-000000000000")
	testHandler.GetPlanningTask(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("GetPlanningTask (missing): expected 404, got %d", w.Code)
	}
}

func TestPlanningTaskCreateValidation(t *testing.T) {
	// Missing title
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"description": "No title",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Missing title: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Invalid status
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks", map[string]any{
		"title":  "test",
		"status": "invalid_status",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Invalid status: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Invalid priority
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks", map[string]any{
		"title":    "test",
		"priority": "urgent",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Invalid priority: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Invalid suitability
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks", map[string]any{
		"title":       "test",
		"suitability": "not_valid",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Invalid suitability: expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPlanningTaskListFilters(t *testing.T) {
	// Create two tasks with different statuses/priorities.
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"title":    "Filter test high",
		"priority": "high",
		"status":   "pending",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var t1 PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&t1)

	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks", map[string]any{
		"title":    "Filter test low",
		"priority": "low",
		"status":   "running",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var t2 PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&t2)

	t.Cleanup(func() {
		for _, id := range []string{t1.ID, t2.ID} {
			w := httptest.NewRecorder()
			req := newRequest("DELETE", "/api/tasks/"+id, nil)
			req = withURLParam(req, "id", id)
			testHandler.DeletePlanningTask(w, req)
		}
	})

	// Filter by status
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks?status=in_progress", nil)
	testHandler.ListPlanningTasks(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListPlanningTasks status filter: expected 200, got %d", w.Code)
	}
	var statusResp struct {
		Tasks []PlanningTaskResponse `json:"tasks"`
	}
	json.NewDecoder(w.Body).Decode(&statusResp)
	for _, tsk := range statusResp.Tasks {
		if tsk.Status != "running" {
			t.Fatalf("status filter: found task with status %s", tsk.Status)
		}
	}

	// Filter by priority
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks?priority=high", nil)
	testHandler.ListPlanningTasks(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListPlanningTasks priority filter: expected 200, got %d", w.Code)
	}
	var priorityResp struct {
		Tasks []PlanningTaskResponse `json:"tasks"`
	}
	json.NewDecoder(w.Body).Decode(&priorityResp)
	for _, tsk := range priorityResp.Tasks {
		if tsk.Priority != "high" {
			t.Fatalf("priority filter: found task with priority %s", tsk.Priority)
		}
	}
}

func TestPlanningTaskDispatchCancelRetry(t *testing.T) {
	// Create task
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"title": "Lifecycle test task",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var task PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&task)
	taskID := task.ID

	t.Cleanup(func() {
		w := httptest.NewRecorder()
		req := newRequest("DELETE", "/api/tasks/"+taskID, nil)
		req = withURLParam(req, "id", taskID)
		testHandler.DeletePlanningTask(w, req)
	})

	// Dispatch (pending → in_progress)
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+taskID+"/dispatch", nil)
	req = withURLParam(req, "id", taskID)
	testHandler.DispatchPlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("DispatchPlanningTask: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var dispatched PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&dispatched)
	if dispatched.Status != "running" {
		t.Fatalf("DispatchPlanningTask: expected status 'in_progress', got %s", dispatched.Status)
	}

	// Dispatch again should fail (already in_progress)
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+taskID+"/dispatch", nil)
	req = withURLParam(req, "id", taskID)
	testHandler.DispatchPlanningTask(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("DispatchPlanningTask (already dispatched): expected 409, got %d", w.Code)
	}

	// Cancel (in_progress → cancelled)
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+taskID+"/cancel", nil)
	req = withURLParam(req, "id", taskID)
	testHandler.CancelPlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("CancelPlanningTask: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var cancelled PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&cancelled)
	if cancelled.Status != "cancelled" {
		t.Fatalf("CancelPlanningTask: expected status 'cancelled', got %s", cancelled.Status)
	}

	// Cancel again should fail (already terminal)
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+taskID+"/cancel", nil)
	req = withURLParam(req, "id", taskID)
	testHandler.CancelPlanningTask(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("CancelPlanningTask (already cancelled): expected 409, got %d", w.Code)
	}

	// Retry (cancelled → pending)
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+taskID+"/retry", nil)
	req = withURLParam(req, "id", taskID)
	testHandler.RetryPlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("RetryPlanningTask: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var retried PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&retried)
	if retried.Status != "pending" {
		t.Fatalf("RetryPlanningTask: expected status 'pending', got %s", retried.Status)
	}

	// Retry from non-terminal state should fail
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+taskID+"/retry", nil)
	req = withURLParam(req, "id", taskID)
	testHandler.RetryPlanningTask(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("RetryPlanningTask (not terminal): expected 409, got %d", w.Code)
	}
}

func TestPlanningTaskDependencies(t *testing.T) {
	// Create two tasks
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"title": "Parent task",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var parent PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&parent)

	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks", map[string]any{
		"title": "Child task",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var child PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&child)

	t.Cleanup(func() {
		for _, id := range []string{parent.ID, child.ID} {
			w := httptest.NewRecorder()
			req := newRequest("DELETE", "/api/tasks/"+id, nil)
			req = withURLParam(req, "id", id)
			testHandler.DeletePlanningTask(w, req)
		}
	})

	// Add dependency: child blocks parent
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+parent.ID+"/dependencies", map[string]any{
		"depends_on_task_id": child.ID,
		"type":               "blocked_by",
	})
	req = withURLParam(req, "id", parent.ID)
	testHandler.AddTaskDependency(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("AddTaskDependency: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var addResp struct {
		Dependencies []TaskDependencyResponse `json:"dependencies"`
	}
	json.NewDecoder(w.Body).Decode(&addResp)
	if len(addResp.Dependencies) != 1 {
		t.Fatalf("AddTaskDependency: expected 1 dependency, got %d", len(addResp.Dependencies))
	}
	if addResp.Dependencies[0].DependsOnTaskID != child.ID {
		t.Fatalf("AddTaskDependency: unexpected depends_on_task_id: %s", addResp.Dependencies[0].DependsOnTaskID)
	}

	// Add duplicate (idempotent — ON CONFLICT DO NOTHING)
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+parent.ID+"/dependencies", map[string]any{
		"depends_on_task_id": child.ID,
		"type":               "blocked_by",
	})
	req = withURLParam(req, "id", parent.ID)
	testHandler.AddTaskDependency(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("AddTaskDependency (idempotent): expected 201, got %d", w.Code)
	}

	// List dependencies
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks/"+parent.ID+"/dependencies", nil)
	req = withURLParam(req, "id", parent.ID)
	testHandler.ListPlanningTaskDependencies(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListPlanningTaskDependencies: expected 200, got %d", w.Code)
	}
	var listResp struct {
		Dependencies []TaskDependencyResponse `json:"dependencies"`
	}
	json.NewDecoder(w.Body).Decode(&listResp)
	if len(listResp.Dependencies) != 1 {
		t.Fatalf("ListPlanningTaskDependencies: expected 1, got %d", len(listResp.Dependencies))
	}

	// Self-reference should fail
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+parent.ID+"/dependencies", map[string]any{
		"depends_on_task_id": parent.ID,
		"type":               "blocks",
	})
	req = withURLParam(req, "id", parent.ID)
	testHandler.AddTaskDependency(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Self-reference: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Invalid type should fail
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/tasks/"+parent.ID+"/dependencies", map[string]any{
		"depends_on_task_id": child.ID,
		"type":               "invalid",
	})
	req = withURLParam(req, "id", parent.ID)
	testHandler.AddTaskDependency(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("Invalid type: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Remove dependency
	w = httptest.NewRecorder()
	req = newRequest("DELETE", "/api/tasks/"+parent.ID+"/dependencies", map[string]any{
		"depends_on_task_id": child.ID,
		"type":               "blocked_by",
	})
	req = withURLParam(req, "id", parent.ID)
	testHandler.RemoveTaskDependency(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("RemoveTaskDependency: expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify list is now empty
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks/"+parent.ID+"/dependencies", nil)
	req = withURLParam(req, "id", parent.ID)
	testHandler.ListPlanningTaskDependencies(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListPlanningTaskDependencies (after remove): expected 200, got %d", w.Code)
	}
	json.NewDecoder(w.Body).Decode(&listResp)
	if len(listResp.Dependencies) != 0 {
		t.Fatalf("ListPlanningTaskDependencies (after remove): expected 0, got %d", len(listResp.Dependencies))
	}
}

func TestPlanningTaskUpdateNullableFields(t *testing.T) {
	// Create task with suitability
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"title":       "Nullable test",
		"suitability": "auto_agent_ready",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&created)
	taskID := created.ID

	t.Cleanup(func() {
		w := httptest.NewRecorder()
		req := newRequest("DELETE", "/api/tasks/"+taskID, nil)
		req = withURLParam(req, "id", taskID)
		testHandler.DeletePlanningTask(w, req)
	})

	if created.Suitability == nil || *created.Suitability != "auto_agent_ready" {
		t.Fatalf("Expected suitability 'auto_agent_ready', got %v", created.Suitability)
	}

	// Clear suitability by sending explicit null
	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/tasks/"+taskID, map[string]any{
		"suitability": nil,
	})
	req = withURLParam(req, "id", taskID)
	testHandler.UpdatePlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("UpdatePlanningTask (clear suitability): expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var updated PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&updated)
	if updated.Suitability != nil {
		t.Fatalf("Expected suitability nil after clearing, got %v", *updated.Suitability)
	}

	// Set branch, then verify it's preserved when updating only title
	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/tasks/"+taskID, map[string]any{
		"branch": "feat/test",
	})
	req = withURLParam(req, "id", taskID)
	testHandler.UpdatePlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/tasks/"+taskID, map[string]any{
		"title": "Just title update",
	})
	req = withURLParam(req, "id", taskID)
	testHandler.UpdatePlanningTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	json.NewDecoder(w.Body).Decode(&updated)
	if updated.Title != "Just title update" {
		t.Fatalf("Expected title update, got %s", updated.Title)
	}
	if updated.Branch == nil || *updated.Branch != "feat/test" {
		t.Fatalf("Branch was not preserved across title-only update: %v", updated.Branch)
	}
}

func TestPlanningTaskDelete(t *testing.T) {
	// Create
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/tasks", map[string]any{
		"title": "Task to delete",
	})
	testHandler.CreatePlanningTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var task PlanningTaskResponse
	json.NewDecoder(w.Body).Decode(&task)
	taskID := task.ID

	// Delete
	w = httptest.NewRecorder()
	req = newRequest("DELETE", "/api/tasks/"+taskID, nil)
	req = withURLParam(req, "id", taskID)
	testHandler.DeletePlanningTask(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("DeletePlanningTask: expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify it's gone
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/tasks/"+taskID, nil)
	req = withURLParam(req, "id", taskID)
	testHandler.GetPlanningTask(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("GetPlanningTask (after delete): expected 404, got %d", w.Code)
	}

	// Delete again → 404
	w = httptest.NewRecorder()
	req = newRequest("DELETE", "/api/tasks/"+taskID, nil)
	req = withURLParam(req, "id", taskID)
	testHandler.DeletePlanningTask(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("DeletePlanningTask (already deleted): expected 404, got %d", w.Code)
	}
}
