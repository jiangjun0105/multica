package main

import (
	"testing"
)

func TestParseFrontmatter_Issue(t *testing.T) {
	parsed, err := parseIssueFrontmatter("testdata/issues/2026-04-10-test-issue.md")
	if err != nil {
		t.Fatalf("parseIssueFrontmatter: %v", err)
	}

	if parsed.Meta.Title != "Test issue for importer" {
		t.Errorf("title = %q, want %q", parsed.Meta.Title, "Test issue for importer")
	}
	if parsed.Meta.Status != "open" {
		t.Errorf("status = %q, want %q", parsed.Meta.Status, "open")
	}
	if parsed.Meta.Priority != "high" {
		t.Errorf("priority = %q, want %q", parsed.Meta.Priority, "high")
	}
	if parsed.Meta.Type != "bug" {
		t.Errorf("type = %q, want %q", parsed.Meta.Type, "bug")
	}
	if len(parsed.Meta.Related) != 1 || parsed.Meta.Related[0] != "2026-04-10-related-issue" {
		t.Errorf("related = %v, want [2026-04-10-related-issue]", parsed.Meta.Related)
	}
	if parsed.Slug != "2026-04-10-test-issue" {
		t.Errorf("slug = %q, want %q", parsed.Slug, "2026-04-10-test-issue")
	}
	if parsed.Body == "" {
		t.Error("body is empty, expected markdown content")
	}
}

func TestParseFrontmatter_Task(t *testing.T) {
	parsed, err := parseTaskFrontmatter("testdata/tasks/2026-04-15-test-task.md")
	if err != nil {
		t.Fatalf("parseTaskFrontmatter: %v", err)
	}

	if parsed.Meta.Title != "Test task for importer" {
		t.Errorf("title = %q, want %q", parsed.Meta.Title, "Test task for importer")
	}
	if parsed.Meta.Status != "in-progress" {
		t.Errorf("status = %q, want %q", parsed.Meta.Status, "in-progress")
	}
	if parsed.Meta.Suitability != "auto_agent_ready" {
		t.Errorf("suitability = %q, want %q", parsed.Meta.Suitability, "auto_agent_ready")
	}
	if parsed.Meta.Branch != "feat/test-branch" {
		t.Errorf("branch = %q, want %q", parsed.Meta.Branch, "feat/test-branch")
	}
	if parsed.Meta.PR != "https://github.com/example/pr/1" {
		t.Errorf("pr = %q, want %q", parsed.Meta.PR, "https://github.com/example/pr/1")
	}
	if parsed.Meta.AutoAgentTask != "a1b2c3d4-e5f6-7890-abcd-ef1234567890" {
		t.Errorf("auto_agent_task_id = %q", parsed.Meta.AutoAgentTask)
	}
	if len(parsed.Meta.Related) != 1 || parsed.Meta.Related[0] != "2026-04-15-related-task" {
		t.Errorf("related = %v, want [2026-04-15-related-task]", parsed.Meta.Related)
	}
}

func TestRemapStatus(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"in-progress", "in_progress"},
		{"in_progress", "in_progress"},
		{"open", "open"},
		{"blocked", "blocked"},
		{"done", "done"},
	}
	for _, tt := range tests {
		got := remapStatus(tt.input)
		if got != tt.want {
			t.Errorf("remapStatus(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestSlugFromFilename(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"testdata/issues/2026-04-10-test-issue.md", "2026-04-10-test-issue"},
		{"/some/path/my-file.md", "my-file"},
	}
	for _, tt := range tests {
		got := slugFromFilename(tt.input)
		if got != tt.want {
			t.Errorf("slugFromFilename(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestWalkMarkdown(t *testing.T) {
	files, err := walkMarkdown("testdata/issues")
	if err != nil {
		t.Fatalf("walkMarkdown: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("walkMarkdown returned %d files, want 2", len(files))
	}
}

func TestWalkMarkdown_MissingDir(t *testing.T) {
	_, err := walkMarkdown("testdata/nonexistent")
	if err == nil {
		t.Error("walkMarkdown on nonexistent dir should return error")
	}
}

func TestParseCreated(t *testing.T) {
	ts := parseCreated("2026-04-10T15:00")
	if ts.Year() != 2026 || ts.Month() != 4 || ts.Day() != 10 {
		t.Errorf("parseCreated returned %v", ts)
	}
}

func TestSplitFrontmatter(t *testing.T) {
	fm, body, err := splitFrontmatter("testdata/issues/2026-04-10-test-issue.md")
	if err != nil {
		t.Fatalf("splitFrontmatter: %v", err)
	}
	if fm == "" {
		t.Error("frontmatter is empty")
	}
	if body == "" {
		t.Error("body is empty")
	}
}

func TestBuildContextRefs(t *testing.T) {
	meta := IssueMeta{GithubIssue: "https://github.com/org/repo/issues/42"}
	refs := buildContextRefs(meta)
	if string(refs) == "[]" {
		t.Error("context_refs should not be empty when github_issue is set")
	}

	meta2 := IssueMeta{}
	refs2 := buildContextRefs(meta2)
	if string(refs2) != "{}" {
		t.Errorf("context_refs should be {} when no fields set, got %s", string(refs2))
	}
}
