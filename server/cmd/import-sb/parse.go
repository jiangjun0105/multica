package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.yaml.in/yaml/v2"
)

type IssueMeta struct {
	ID            string   `yaml:"id"`
	Title         string   `yaml:"title"`
	Created       string   `yaml:"created"`
	Status        string   `yaml:"status"`
	Priority      string   `yaml:"priority"`
	Type          string   `yaml:"type"`
	Suitability   string   `yaml:"suitability"`
	DependsOn     []string `yaml:"depends_on"`
	Related       []string `yaml:"related"`
	Branch        string   `yaml:"branch"`
	PR            string   `yaml:"pr"`
	AutoAgentTask string   `yaml:"auto_agent_task_id"`
	GithubIssue   string   `yaml:"github_issue"`
}

type TaskMeta struct {
	ID            string   `yaml:"id"`
	Title         string   `yaml:"title"`
	Created       string   `yaml:"created"`
	Status        string   `yaml:"status"`
	Priority      string   `yaml:"priority"`
	Type          string   `yaml:"type"`
	Suitability   string   `yaml:"suitability"`
	DependsOn     []string `yaml:"depends_on"`
	Related       []string `yaml:"related"`
	Branch        string   `yaml:"branch"`
	PR            string   `yaml:"pr"`
	AutoAgentTask string   `yaml:"auto_agent_task_id"`
	ManualTest    string   `yaml:"manual_test"`
	SkipTester    bool     `yaml:"skip_tester"`
}

type ParsedFile struct {
	Slug string
	Body string
}

type ParsedIssue struct {
	ParsedFile
	Meta IssueMeta
}

type ParsedTask struct {
	ParsedFile
	Meta TaskMeta
}

func parseIssueFrontmatter(path string) (ParsedIssue, error) {
	fm, body, err := splitFrontmatter(path)
	if err != nil {
		return ParsedIssue{}, err
	}
	var meta IssueMeta
	if err := yaml.Unmarshal([]byte(fm), &meta); err != nil {
		return ParsedIssue{}, fmt.Errorf("parse frontmatter %s: %w", path, err)
	}
	slug := slugFromFilename(path)
	if meta.ID == "" {
		meta.ID = slug
	}
	return ParsedIssue{
		ParsedFile: ParsedFile{Slug: slug, Body: body},
		Meta:       meta,
	}, nil
}

func parseTaskFrontmatter(path string) (ParsedTask, error) {
	fm, body, err := splitFrontmatter(path)
	if err != nil {
		return ParsedTask{}, err
	}
	var meta TaskMeta
	if err := yaml.Unmarshal([]byte(fm), &meta); err != nil {
		return ParsedTask{}, fmt.Errorf("parse frontmatter %s: %w", path, err)
	}
	slug := slugFromFilename(path)
	if meta.ID == "" {
		meta.ID = slug
	}
	return ParsedTask{
		ParsedFile: ParsedFile{Slug: slug, Body: body},
		Meta:       meta,
	}, nil
}

func splitFrontmatter(path string) (string, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var fmLines, bodyLines []string
	inFrontmatter := false
	fmDone := false

	for scanner.Scan() {
		line := scanner.Text()
		if !inFrontmatter && !fmDone && strings.TrimSpace(line) == "---" {
			inFrontmatter = true
			continue
		}
		if inFrontmatter && strings.TrimSpace(line) == "---" {
			inFrontmatter = false
			fmDone = true
			continue
		}
		if inFrontmatter {
			fmLines = append(fmLines, line)
		} else if fmDone {
			bodyLines = append(bodyLines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", "", err
	}

	fm := strings.Join(fmLines, "\n")
	body := strings.TrimSpace(strings.Join(bodyLines, "\n"))
	return fm, body, nil
}

func slugFromFilename(path string) string {
	base := filepath.Base(path)
	return strings.TrimSuffix(base, ".md")
}

func walkMarkdown(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read directory %s: %w", dir, err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		files = append(files, filepath.Join(dir, e.Name()))
	}
	return files, nil
}

func remapStatus(status string) string {
	return strings.ReplaceAll(status, "-", "_")
}

func parseCreated(s string) time.Time {
	for _, layout := range []string{
		"2006-01-02T15:04",
		"2006-01-02T15:04:05",
		time.RFC3339,
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Now()
}
