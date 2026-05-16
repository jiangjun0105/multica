package main

import (
	"context"
	"io"
	"testing"
)

// createTestIssueForTriage creates a minimal issue with status "open" and
// returns its UUID. The caller is responsible for cleanup via t.Cleanup.
func createTestIssueForTriage(t *testing.T) string {
	t.Helper()
	resp := authRequest(t, "POST", "/api/issues?workspace_id="+testWorkspaceID, map[string]any{
		"title":    "Triage integration test issue",
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
		testPool.Exec(context.Background(), `DELETE FROM chat_session WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM triage_proposal WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM task_dependency WHERE task_id IN (SELECT id FROM task WHERE issue_id = $1)`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM task WHERE issue_id = $1`, issueID)
		testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, issueID)
	})
	return issueID
}

// --- Proposal endpoint tests -------------------------------------------------

func TestCreateTriageProposal(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{
				"title":       "Set up database schema",
				"description": "Create migration for new tables",
				"priority":    "high",
				"suitability": "auto_agent_ready",
			},
			{
				"title":       "Implement API endpoints",
				"description": "Add REST handlers",
				"priority":    "medium",
				"dependencies": []map[string]any{
					{"ref_index": 0, "type": "blocked_by"},
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

	if proposal["id"] == nil || proposal["id"] == "" {
		t.Fatal("expected proposal to have an id")
	}
	if proposal["status"] != "pending" {
		t.Fatalf("expected status 'pending', got '%s'", proposal["status"])
	}
	if proposal["issue_id"] != issueID {
		t.Fatalf("expected issue_id %s, got %s", issueID, proposal["issue_id"])
	}
	if proposal["proposal"] == nil {
		t.Fatal("expected proposal to have a proposal field")
	}

	tasks, ok := proposal["proposal"].([]any)
	if !ok {
		t.Fatalf("expected proposal.proposal to be an array, got %T", proposal["proposal"])
	}
	if len(tasks) != 2 {
		t.Fatalf("expected 2 tasks in proposal, got %d", len(tasks))
	}
}

func TestCreateTriageProposal_EmptyTasks(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{},
	})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for empty tasks, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestCreateTriageProposal_MissingTitle(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"description": "no title"},
		},
	})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for missing title, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestCreateTriageProposal_InvalidDependencyRefIndex(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{
				"title": "Task A",
				"dependencies": []map[string]any{
					{"ref_index": 5, "type": "blocks"},
				},
			},
		},
	})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for out-of-range ref_index, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestCreateTriageProposal_SelfDependency(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{
				"title": "Task A",
				"dependencies": []map[string]any{
					{"ref_index": 0, "type": "blocks"},
				},
			},
		},
	})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for self-dependency, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestCreateTriageProposal_InvalidDependencyType(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Task A"},
			{
				"title": "Task B",
				"dependencies": []map[string]any{
					{"ref_index": 0, "type": "invalid_type"},
				},
			},
		},
	})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for invalid dependency type, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestCreateTriageProposal_NonExistentIssue(t *testing.T) {
	fakeUUID := "00000000-0000-0000-0000-000000000000"
	resp := authRequest(t, "POST", "/api/issues/"+fakeUUID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Task A"},
		},
	})
	if resp.StatusCode != 404 {
		resp.Body.Close()
		t.Fatalf("expected 404 for non-existent issue, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

// --- Finalize endpoint tests -------------------------------------------------

func TestFinalizeTriageProposal(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	// Create proposal
	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{
				"title":       "Schema migration",
				"description": "Create the tables",
				"priority":    "high",
				"suitability": "auto_agent_ready",
				"manual_test": "Run migration and verify tables exist",
			},
			{
				"title":       "API handlers",
				"description": "Implement REST endpoints",
				"priority":    "medium",
				"dependencies": []map[string]any{
					{"ref_index": 0, "type": "blocked_by"},
				},
			},
			{
				"title":       "Frontend integration",
				"description": "Wire up the UI",
				"priority":    "low",
				"dependencies": []map[string]any{
					{"ref_index": 1, "type": "blocked_by"},
					{"ref_index": 0, "type": "related"},
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

	// Finalize
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

	// Verify proposal is approved
	proposalResp, ok := result["proposal"].(map[string]any)
	if !ok {
		t.Fatal("expected result to have 'proposal' object")
	}
	if proposalResp["status"] != "approved" {
		t.Fatalf("expected proposal status 'approved', got '%s'", proposalResp["status"])
	}

	// Verify tasks were created
	tasks, ok := result["tasks"].([]any)
	if !ok {
		t.Fatal("expected result to have 'tasks' array")
	}
	if len(tasks) != 3 {
		t.Fatalf("expected 3 tasks, got %d", len(tasks))
	}

	// Verify task details
	task0 := tasks[0].(map[string]any)
	if task0["title"] != "Schema migration" {
		t.Fatalf("expected task[0] title 'Schema migration', got '%s'", task0["title"])
	}
	if task0["priority"] != "high" {
		t.Fatalf("expected task[0] priority 'high', got '%s'", task0["priority"])
	}
	if task0["status"] != "pending" {
		t.Fatalf("expected task[0] status 'pending', got '%s'", task0["status"])
	}
	if task0["suitability"] != "auto_agent_ready" {
		t.Fatalf("expected task[0] suitability 'auto_agent_ready', got '%v'", task0["suitability"])
	}
	if task0["manual_test"] != "Run migration and verify tables exist" {
		t.Fatalf("expected task[0] manual_test, got '%v'", task0["manual_test"])
	}
	if task0["issue_id"] != issueID {
		t.Fatalf("expected task[0] issue_id %s, got '%s'", issueID, task0["issue_id"])
	}

	// Verify task numbers are sequential
	num0 := task0["number"].(float64)
	num1 := tasks[1].(map[string]any)["number"].(float64)
	num2 := tasks[2].(map[string]any)["number"].(float64)
	if num1 != num0+1 || num2 != num0+2 {
		t.Fatalf("expected sequential numbers, got %v, %v, %v", num0, num1, num2)
	}

	// Verify dependencies on task[1] (blocked_by task[0])
	task1 := tasks[1].(map[string]any)
	deps1, ok := task1["dependencies"].([]any)
	if !ok || len(deps1) != 1 {
		t.Fatalf("expected task[1] to have 1 dependency, got %v", task1["dependencies"])
	}
	dep1 := deps1[0].(map[string]any)
	if dep1["depends_on_task_id"] != task0["id"] {
		t.Fatalf("expected task[1] to depend on task[0]")
	}
	if dep1["type"] != "blocked_by" {
		t.Fatalf("expected dependency type 'blocked_by', got '%s'", dep1["type"])
	}

	// Verify dependencies on task[2] (blocked_by task[1] + related task[0])
	task2 := tasks[2].(map[string]any)
	deps2, ok := task2["dependencies"].([]any)
	if !ok || len(deps2) != 2 {
		t.Fatalf("expected task[2] to have 2 dependencies, got %v", task2["dependencies"])
	}

	// Verify issue status changed to "triaged"
	resp = authRequest(t, "GET", "/api/issues/"+issueID, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("GetIssue: expected 200, got %d", resp.StatusCode)
	}
	var updatedIssue map[string]any
	readJSON(t, resp, &updatedIssue)
	if updatedIssue["status"] != "triaged" {
		t.Fatalf("expected issue status 'triaged', got '%s'", updatedIssue["status"])
	}
}

func TestFinalizeTriageProposal_MissingProposalID(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for missing proposal_id, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestFinalizeTriageProposal_NonExistentProposal(t *testing.T) {
	issueID := createTestIssueForTriage(t)
	fakeUUID := "00000000-0000-0000-0000-000000000001"

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{
		"proposal_id": fakeUUID,
	})
	if resp.StatusCode != 404 {
		resp.Body.Close()
		t.Fatalf("expected 404 for non-existent proposal, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestFinalizeTriageProposal_AlreadyApproved(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	// Create and finalize
	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Task A", "priority": "medium"},
		},
	})
	var proposal map[string]any
	readJSON(t, resp, &proposal)
	proposalID := proposal["id"].(string)

	resp = authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{
		"proposal_id": proposalID,
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("first finalize: expected 201, got %d: %s", resp.StatusCode, body)
	}
	resp.Body.Close()

	// Try to finalize again
	resp = authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{
		"proposal_id": proposalID,
	})
	if resp.StatusCode != 409 {
		resp.Body.Close()
		t.Fatalf("expected 409 for already-approved proposal, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestFinalizeTriageProposal_ProposalIssueMismatch(t *testing.T) {
	issueID1 := createTestIssueForTriage(t)
	issueID2 := createTestIssueForTriage(t)

	// Create proposal for issue1
	resp := authRequest(t, "POST", "/api/issues/"+issueID1+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Task A"},
		},
	})
	var proposal map[string]any
	readJSON(t, resp, &proposal)
	proposalID := proposal["id"].(string)

	// Try to finalize against issue2
	resp = authRequest(t, "POST", "/api/issues/"+issueID2+"/triage/finalize", map[string]any{
		"proposal_id": proposalID,
	})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for issue mismatch, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestFinalizeTriageProposal_DefaultPriority(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	// Create proposal with no explicit priority
	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage/proposal", map[string]any{
		"tasks": []map[string]any{
			{"title": "Task with default priority"},
		},
	})
	var proposal map[string]any
	readJSON(t, resp, &proposal)
	proposalID := proposal["id"].(string)

	resp = authRequest(t, "POST", "/api/issues/"+issueID+"/triage/finalize", map[string]any{
		"proposal_id": proposalID,
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("Finalize: expected 201, got %d: %s", resp.StatusCode, body)
	}

	var result map[string]any
	readJSON(t, resp, &result)
	tasks := result["tasks"].([]any)
	task0 := tasks[0].(map[string]any)
	if task0["priority"] != "medium" {
		t.Fatalf("expected default priority 'medium', got '%s'", task0["priority"])
	}
}

// --- StartTriage endpoint tests -----------------------------------------------

// getFirstAgentID returns the ID of the first agent in the test workspace.
func getFirstAgentID(t *testing.T) string {
	t.Helper()
	resp := authRequest(t, "GET", "/api/agents?workspace_id="+testWorkspaceID, nil)
	var agents []map[string]any
	readJSON(t, resp, &agents)
	if len(agents) == 0 {
		t.Skip("no agents in test workspace — skipping triage test")
	}
	return agents[0]["id"].(string)
}

func TestStartTriage(t *testing.T) {
	issueID := createTestIssueForTriage(t)
	agentID := getFirstAgentID(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage", map[string]any{
		"agent_id": agentID,
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("StartTriage: expected 201, got %d: %s", resp.StatusCode, body)
	}

	var result map[string]any
	readJSON(t, resp, &result)

	if result["created"] != true {
		t.Fatalf("expected created=true, got %v", result["created"])
	}

	cs, ok := result["chat_session"].(map[string]any)
	if !ok {
		t.Fatal("expected chat_session in response")
	}
	if cs["id"] == nil || cs["id"] == "" {
		t.Fatal("expected chat_session to have an id")
	}

	// Issue status should be "triaging"
	resp = authRequest(t, "GET", "/api/issues/"+issueID, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("GetIssue: expected 200, got %d", resp.StatusCode)
	}
	var issue map[string]any
	readJSON(t, resp, &issue)
	if issue["status"] != "triaging" {
		t.Fatalf("expected issue status 'triaging', got '%s'", issue["status"])
	}
}

func TestStartTriage_Idempotent(t *testing.T) {
	issueID := createTestIssueForTriage(t)
	agentID := getFirstAgentID(t)

	// First call creates
	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage", map[string]any{
		"agent_id": agentID,
	})
	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("first StartTriage: expected 201, got %d: %s", resp.StatusCode, body)
	}
	var first map[string]any
	readJSON(t, resp, &first)
	firstSessionID := first["chat_session"].(map[string]any)["id"]

	// Second call returns existing
	resp = authRequest(t, "POST", "/api/issues/"+issueID+"/triage", map[string]any{
		"agent_id": agentID,
	})
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("second StartTriage: expected 200, got %d: %s", resp.StatusCode, body)
	}
	var second map[string]any
	readJSON(t, resp, &second)

	if second["created"] != false {
		t.Fatalf("expected created=false on repeat call, got %v", second["created"])
	}
	secondSessionID := second["chat_session"].(map[string]any)["id"]
	if firstSessionID != secondSessionID {
		t.Fatalf("expected same session ID, got %s vs %s", firstSessionID, secondSessionID)
	}
}

func TestStartTriage_MissingAgentID(t *testing.T) {
	issueID := createTestIssueForTriage(t)

	resp := authRequest(t, "POST", "/api/issues/"+issueID+"/triage", map[string]any{})
	if resp.StatusCode != 400 {
		resp.Body.Close()
		t.Fatalf("expected 400 for missing agent_id, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestStartTriage_NonExistentIssue(t *testing.T) {
	agentID := getFirstAgentID(t)
	fakeUUID := "00000000-0000-0000-0000-000000000000"

	resp := authRequest(t, "POST", "/api/issues/"+fakeUUID+"/triage", map[string]any{
		"agent_id": agentID,
	})
	if resp.StatusCode != 404 {
		resp.Body.Close()
		t.Fatalf("expected 404 for non-existent issue, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}
