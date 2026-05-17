package main

import (
	"context"
	"io"
	"testing"
)

// createPipelineViaPOST exercises POST /api/pipelines directly (no triage flow).
// Returns (pipelineID, taskIDs in request order).
func createPipelineViaPOST(t *testing.T, body map[string]any) (string, []string) {
	t.Helper()
	resp := authRequest(t, "POST", "/api/pipelines?workspace_id="+testWorkspaceID, body)
	if resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("CreatePipeline: expected 201, got %d: %s", resp.StatusCode, b)
	}
	var result map[string]any
	readJSON(t, resp, &result)
	pipelineID := result["id"].(string)

	tasks := result["tasks"].([]any)
	taskIDs := make([]string, len(tasks))
	for i, ti := range tasks {
		taskIDs[i] = ti.(map[string]any)["id"].(string)
	}

	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM task_dependency WHERE task_id IN (SELECT id FROM task WHERE pipeline_id = $1)`, pipelineID)
		testPool.Exec(context.Background(), `DELETE FROM task WHERE pipeline_id = $1`, pipelineID)
		testPool.Exec(context.Background(), `DELETE FROM pipeline WHERE id = $1`, pipelineID)
	})
	return pipelineID, taskIDs
}

func createTestIssueForPipeline(t *testing.T) string {
	t.Helper()
	resp := authRequest(t, "POST", "/api/issues?workspace_id="+testWorkspaceID, map[string]any{
		"title":    "Pipeline integration test issue",
		"status":   "open",
		"priority": "high",
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("CreateIssue: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var issue map[string]any
	readJSON(t, resp, &issue)
	issueID := issue["id"].(string)
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM task_dependency WHERE task_id IN (SELECT id FROM task WHERE issue_id = $1)`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM task WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM pipeline WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM chat_session WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM triage_proposal WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, issueID)
	})
	return issueID
}

func createPipelineViaFinalize(t *testing.T, issueID string) (string, []string) {
	t.Helper()
	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Pipeline task 1", "priority": "high"},
			{
				"title":    "Pipeline task 2",
				"priority": "medium",
				"dependencies": []map[string]any{
					{"ref_index": 0, "type": "blocked_by"},
				},
			},
			{
				"title":    "Pipeline task 3",
				"priority": "low",
				"dependencies": []map[string]any{
					{"ref_index": 1, "type": "blocked_by"},
				},
			},
		},
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("CreateTriageProposal: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var proposal map[string]any
	readJSON(t, resp, &proposal)
	proposalID := proposal["id"].(string)

	resp = authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{
		"proposal_id": proposalID,
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("FinalizeTriageProposal: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var result map[string]any
	readJSON(t, resp, &result)

	pipelineObj := result["pipeline"].(map[string]any)
	pipelineID := pipelineObj["id"].(string)

	tasks := result["tasks"].([]any)
	taskIDs := make([]string, len(tasks))
	for i, t := range tasks {
		taskIDs[i] = t.(map[string]any)["id"].(string)
	}
	return pipelineID, taskIDs
}

func TestFinalizeTriageProposal_CreatesPipelineForMultipleTasks(t *testing.T) {
	issueID := createTestIssueForPipeline(t)
	pipelineID, taskIDs := createPipelineViaFinalize(t, issueID)

	if pipelineID == "" {
		t.Fatal("expected pipeline to be created")
	}
	if len(taskIDs) != 3 {
		t.Fatalf("expected 3 tasks, got %d", len(taskIDs))
	}

	resp := authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("GetPipeline: expected 200, got %d: %s", resp.StatusCode, body)
	}
	var pipeline map[string]any
	readJSON(t, resp, &pipeline)

	if pipeline["status"] != "pending" {
		t.Fatalf("expected pipeline status 'pending', got '%s'", pipeline["status"])
	}
	if pipeline["issue_id"] != issueID {
		t.Fatalf("expected pipeline issue_id %s, got %s", issueID, pipeline["issue_id"])
	}

	pTasks := pipeline["tasks"].([]any)
	if len(pTasks) != 3 {
		t.Fatalf("expected 3 tasks in pipeline, got %d", len(pTasks))
	}

	for _, pt := range pTasks {
		task := pt.(map[string]any)
		if task["pipeline_id"] != pipelineID {
			t.Fatalf("expected task pipeline_id %s, got %v", pipelineID, task["pipeline_id"])
		}
	}
}

func TestFinalizeTriageProposal_NoPipelineForSingleTask(t *testing.T) {
	issueID := createTestIssueForPipeline(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Single task", "priority": "high"},
		},
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("CreateTriageProposal: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var proposal map[string]any
	readJSON(t, resp, &proposal)

	resp = authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{
		"proposal_id": proposal["id"].(string),
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("Finalize: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var result map[string]any
	readJSON(t, resp, &result)

	if result["pipeline"] != nil {
		t.Fatal("expected no pipeline for single-task finalize")
	}
}

func TestListPipelines(t *testing.T) {
	issueID := createTestIssueForPipeline(t)
	createPipelineViaFinalize(t, issueID)

	resp := authRequest(t, "GET", "/api/pipelines?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("ListPipelines: expected 200, got %d: %s", resp.StatusCode, body)
	}
	var result map[string]any
	readJSON(t, resp, &result)

	pipelines := result["pipelines"].([]any)
	if len(pipelines) == 0 {
		t.Fatal("expected at least 1 pipeline")
	}

	total := result["total"].(float64)
	if total < 1 {
		t.Fatalf("expected total >= 1, got %v", total)
	}
}

func TestCancelPipeline(t *testing.T) {
	issueID := createTestIssueForPipeline(t)
	pipelineID, _ := createPipelineViaFinalize(t, issueID)

	resp := authRequest(t, "POST", "/api/pipelines/"+pipelineID+"/cancel?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("CancelPipeline: expected 200, got %d: %s", resp.StatusCode, body)
	}
	var pipeline map[string]any
	readJSON(t, resp, &pipeline)

	if pipeline["status"] != "cancelled" {
		t.Fatalf("expected pipeline status 'cancelled', got '%s'", pipeline["status"])
	}

	resp = authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("GetPipeline after cancel: expected 200, got %d", resp.StatusCode)
	}
	var fetched map[string]any
	readJSON(t, resp, &fetched)

	tasks := fetched["tasks"].([]any)
	for _, pt := range tasks {
		task := pt.(map[string]any)
		if task["status"] != "cancelled" {
			t.Fatalf("expected task status 'cancelled' after pipeline cancel, got '%s'", task["status"])
		}
	}
}

func TestCancelPipeline_AlreadyCancelled(t *testing.T) {
	issueID := createTestIssueForPipeline(t)
	pipelineID, _ := createPipelineViaFinalize(t, issueID)

	resp := authRequest(t, "POST", "/api/pipelines/"+pipelineID+"/cancel?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("first cancel: expected 200, got %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()

	resp = authRequest(t, "POST", "/api/pipelines/"+pipelineID+"/cancel?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 409 {
		resp.Body.Close()
		t.Fatalf("expected 409 for already-cancelled pipeline, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestPipelineStatusRollup(t *testing.T) {
	issueID := createTestIssueForPipeline(t)
	pipelineID, taskIDs := createPipelineViaFinalize(t, issueID)

	// Dispatch task 0 → pipeline should become "running"
	resp := authRequest(t, "POST", "/api/tasks/"+taskIDs[0]+"/dispatch?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("DispatchTask: expected 200, got %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()

	resp = authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("GetPipeline: expected 200, got %d", resp.StatusCode)
	}
	var p map[string]any
	readJSON(t, resp, &p)
	if p["status"] != "running" {
		t.Fatalf("expected pipeline status 'running' after dispatch, got '%s'", p["status"])
	}

	// Complete all 3 tasks → pipeline should become "completed"
	for _, tid := range taskIDs {
		resp := authRequest(t, "PATCH", "/api/tasks/"+tid+"?workspace_id="+testWorkspaceID, map[string]any{
			"status": "done",
		})
		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			t.Fatalf("UpdateTask status=done: expected 200, got %d: %s", resp.StatusCode, body)
		}
		resp.Body.Close()
	}

	resp = authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("GetPipeline: expected 200, got %d", resp.StatusCode)
	}
	readJSON(t, resp, &p)
	if p["status"] != "completed" {
		t.Fatalf("expected pipeline status 'completed', got '%s'", p["status"])
	}
}

func TestGetPipeline_NotFound(t *testing.T) {
	fakeUUID := "00000000-0000-0000-0000-000000000099"
	resp := authRequest(t, "GET", "/api/pipelines/"+fakeUUID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 404 {
		resp.Body.Close()
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

// ---------------------------------------------------------------------------
// POST /api/pipelines — direct create endpoint (no triage flow required).
// ---------------------------------------------------------------------------

func TestCreatePipeline_HappyPath_NoIssue(t *testing.T) {
	pipelineID, taskIDs := createPipelineViaPOST(t, map[string]any{
		"issue_id": nil,
		"status":   "running",
		"tasks": []map[string]any{
			{"title": "Setup", "status": "done"},
			{"title": "Build", "status": "in_progress", "depends_on": []int{0}},
			{"title": "Ship", "status": "pending", "depends_on": []int{1}},
		},
	})
	if len(taskIDs) != 3 {
		t.Fatalf("expected 3 tasks, got %d", len(taskIDs))
	}

	resp := authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("GetPipeline: expected 200, got %d: %s", resp.StatusCode, body)
	}
	var pipeline map[string]any
	readJSON(t, resp, &pipeline)

	if pipeline["status"] != "running" {
		t.Fatalf("expected pipeline status 'running', got %v", pipeline["status"])
	}
	// issue_id should be JSON null when omitted, which decodes to nil in Go.
	if pipeline["issue_id"] != nil {
		t.Fatalf("expected null issue_id, got %v", pipeline["issue_id"])
	}

	pTasks := pipeline["tasks"].([]any)
	if len(pTasks) != 3 {
		t.Fatalf("expected 3 tasks in pipeline, got %d", len(pTasks))
	}
	for i, pt := range pTasks {
		task := pt.(map[string]any)
		if task["pipeline_id"] != pipelineID {
			t.Fatalf("task[%d].pipeline_id = %v, want %s", i, task["pipeline_id"], pipelineID)
		}
	}

	// Two blocked_by edges: 1→0, 2→1.
	deps := pipeline["dependencies"].([]any)
	if len(deps) != 2 {
		t.Fatalf("expected 2 dependency edges, got %d", len(deps))
	}
	depPairs := map[string]string{}
	for _, d := range deps {
		dm := d.(map[string]any)
		if dm["type"] != "blocked_by" {
			t.Fatalf("expected type 'blocked_by', got %v", dm["type"])
		}
		depPairs[dm["task_id"].(string)] = dm["depends_on_task_id"].(string)
	}
	if depPairs[taskIDs[1]] != taskIDs[0] {
		t.Fatalf("task[1] should depend on task[0]")
	}
	if depPairs[taskIDs[2]] != taskIDs[1] {
		t.Fatalf("task[2] should depend on task[1]")
	}
}

func TestCreatePipeline_WithIssue(t *testing.T) {
	issueID := createTestIssueForPipeline(t)
	pipelineID, taskIDs := createPipelineViaPOST(t, map[string]any{
		"issue_id": issueID,
		"tasks": []map[string]any{
			{"title": "T1"},
			{"title": "T2", "depends_on": []int{0}},
		},
	})

	resp := authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("GetPipeline: expected 200, got %d: %s", resp.StatusCode, body)
	}
	var pipeline map[string]any
	readJSON(t, resp, &pipeline)
	if pipeline["issue_id"] != issueID {
		t.Fatalf("expected issue_id %s, got %v", issueID, pipeline["issue_id"])
	}
	// Tasks should inherit the same issue_id.
	tasks := pipeline["tasks"].([]any)
	for i, ti := range tasks {
		task := ti.(map[string]any)
		if task["issue_id"] != issueID {
			t.Fatalf("task[%d].issue_id = %v, want %s (id=%s)", i, task["issue_id"], issueID, taskIDs[i])
		}
	}
}

func TestCreatePipeline_DefaultsStatusAndPriority(t *testing.T) {
	pipelineID, _ := createPipelineViaPOST(t, map[string]any{
		"tasks": []map[string]any{
			{"title": "no-status-no-priority"},
		},
	})

	resp := authRequest(t, "GET", "/api/pipelines/"+pipelineID+"?workspace_id="+testWorkspaceID, nil)
	var pipeline map[string]any
	readJSON(t, resp, &pipeline)

	if pipeline["status"] != "pending" {
		t.Fatalf("expected default pipeline status 'pending', got %v", pipeline["status"])
	}
	task := pipeline["tasks"].([]any)[0].(map[string]any)
	if task["status"] != "pending" {
		t.Fatalf("expected default task status 'pending', got %v", task["status"])
	}
	if task["priority"] != "medium" {
		t.Fatalf("expected default task priority 'medium', got %v", task["priority"])
	}
}

func TestCreatePipeline_EmptyTasks_400(t *testing.T) {
	resp := authRequest(t, "POST", "/api/pipelines?workspace_id="+testWorkspaceID, map[string]any{
		"tasks": []map[string]any{},
	})
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for empty tasks, got %d", resp.StatusCode)
	}
}

func TestCreatePipeline_InvalidDependsOnIndex_400(t *testing.T) {
	resp := authRequest(t, "POST", "/api/pipelines?workspace_id="+testWorkspaceID, map[string]any{
		"tasks": []map[string]any{
			{"title": "A"},
			{"title": "B", "depends_on": []int{5}}, // out of range
		},
	})
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for out-of-range depends_on, got %d", resp.StatusCode)
	}
}

func TestCreatePipeline_SelfDependency_400(t *testing.T) {
	resp := authRequest(t, "POST", "/api/pipelines?workspace_id="+testWorkspaceID, map[string]any{
		"tasks": []map[string]any{
			{"title": "A"},
			{"title": "B", "depends_on": []int{1}}, // depends on itself
		},
	})
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for self-dependency, got %d", resp.StatusCode)
	}
}

func TestCreatePipeline_InvalidTaskStatus_400(t *testing.T) {
	resp := authRequest(t, "POST", "/api/pipelines?workspace_id="+testWorkspaceID, map[string]any{
		"tasks": []map[string]any{
			{"title": "A", "status": "frobnicated"},
		},
	})
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for invalid task status, got %d", resp.StatusCode)
	}
}

func TestCreatePipeline_MissingTitle_400(t *testing.T) {
	resp := authRequest(t, "POST", "/api/pipelines?workspace_id="+testWorkspaceID, map[string]any{
		"tasks": []map[string]any{
			{"title": ""},
		},
	})
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for missing title, got %d", resp.StatusCode)
	}
}
