package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRuntimeHandlersRejectMalformedRuntimeID(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		handle func(http.ResponseWriter, *http.Request)
	}{
		{
			name:   "delete",
			method: "DELETE",
			path:   "/api/runtimes/not-a-uuid",
			handle: testHandler.DeleteAgentRuntime,
		},
		{
			name:   "models",
			method: "POST",
			path:   "/api/runtimes/not-a-uuid/models",
			handle: testHandler.InitiateListModels,
		},
		{
			name:   "update",
			method: "POST",
			path:   "/api/runtimes/not-a-uuid/update",
			handle: testHandler.InitiateUpdate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := newRequest(tt.method, tt.path, nil)
			req = withURLParam(req, "runtimeId", "not-a-uuid")
			tt.handle(w, req)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("%s: expected 400 for malformed runtimeId, got %d: %s", tt.name, w.Code, w.Body.String())
			}
		})
	}
}
