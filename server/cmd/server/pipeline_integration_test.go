package main

import (
	"context"
	"io"
	"testing"
)

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
