package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"
	enumspb "go.temporal.io/api/enums/v1"
	workflowpb "go.temporal.io/api/workflow/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"
	"google.golang.org/protobuf/types/known/timestamppb"

	// Needed for OperatorService return type.
	"go.temporal.io/api/operatorservice/v1"
)

// mockWorkflowRun satisfies client.WorkflowRun.
type mockWorkflowRun struct{}

func (m *mockWorkflowRun) GetID() string                              { return "mock-run-id" }
func (m *mockWorkflowRun) GetRunID() string                           { return "mock-run-id" }
func (m *mockWorkflowRun) Get(context.Context, interface{}) error     { return nil }
func (m *mockWorkflowRun) GetWithOptions(context.Context, interface{}, client.WorkflowRunGetOptions) error {
	return nil
}

// mockTemporalClient implements client.Client with stubs for all methods.
type mockTemporalClient struct {
	executeWorkflowCalled bool
	describeCalled        bool
	describeResponse      *workflowservice.DescribeWorkflowExecutionResponse
	describeErr           error
}

// Methods actually exercised by TaskHandler:
func (m *mockTemporalClient) ExecuteWorkflow(_ context.Context, _ client.StartWorkflowOptions, _ interface{}, _ ...interface{}) (client.WorkflowRun, error) {
	m.executeWorkflowCalled = true
	return &mockWorkflowRun{}, nil
}
func (m *mockTemporalClient) DescribeWorkflowExecution(_ context.Context, _ string, _ string) (*workflowservice.DescribeWorkflowExecutionResponse, error) {
	m.describeCalled = true
	if m.describeErr != nil {
		return nil, m.describeErr
	}
	return m.describeResponse, nil
}

// Remaining stubs to satisfy client.Client interface:
func (m *mockTemporalClient) GetWorkflow(context.Context, string, string) client.WorkflowRun {
	return &mockWorkflowRun{}
}
func (m *mockTemporalClient) SignalWorkflow(context.Context, string, string, string, interface{}) error {
	return nil
}
func (m *mockTemporalClient) SignalWithStartWorkflow(context.Context, string, string, interface{}, client.StartWorkflowOptions, interface{}, ...interface{}) (client.WorkflowRun, error) {
	return nil, nil
}
func (m *mockTemporalClient) NewWithStartWorkflowOperation(client.StartWorkflowOptions, interface{}, ...interface{}) client.WithStartWorkflowOperation {
	return nil
}
func (m *mockTemporalClient) CancelWorkflow(context.Context, string, string) error { return nil }
func (m *mockTemporalClient) TerminateWorkflow(context.Context, string, string, string, ...interface{}) error {
	return nil
}
func (m *mockTemporalClient) GetWorkflowHistory(context.Context, string, string, bool, enumspb.HistoryEventFilterType) client.HistoryEventIterator {
	return nil
}
func (m *mockTemporalClient) CompleteActivity(context.Context, []byte, interface{}, error) error {
	return nil
}
func (m *mockTemporalClient) CompleteActivityByID(context.Context, string, string, string, string, interface{}, error) error {
	return nil
}
func (m *mockTemporalClient) CompleteActivityByActivityID(context.Context, string, string, string, interface{}, error) error {
	return nil
}
func (m *mockTemporalClient) RecordActivityHeartbeat(context.Context, []byte, ...interface{}) error {
	return nil
}
func (m *mockTemporalClient) RecordActivityHeartbeatByID(context.Context, string, string, string, string, ...interface{}) error {
	return nil
}
func (m *mockTemporalClient) ListClosedWorkflow(context.Context, *workflowservice.ListClosedWorkflowExecutionsRequest) (*workflowservice.ListClosedWorkflowExecutionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) ListOpenWorkflow(context.Context, *workflowservice.ListOpenWorkflowExecutionsRequest) (*workflowservice.ListOpenWorkflowExecutionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) ListWorkflow(context.Context, *workflowservice.ListWorkflowExecutionsRequest) (*workflowservice.ListWorkflowExecutionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) ListArchivedWorkflow(context.Context, *workflowservice.ListArchivedWorkflowExecutionsRequest) (*workflowservice.ListArchivedWorkflowExecutionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) ScanWorkflow(context.Context, *workflowservice.ScanWorkflowExecutionsRequest) (*workflowservice.ScanWorkflowExecutionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) CountWorkflow(context.Context, *workflowservice.CountWorkflowExecutionsRequest) (*workflowservice.CountWorkflowExecutionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) GetSearchAttributes(context.Context) (*workflowservice.GetSearchAttributesResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) QueryWorkflow(context.Context, string, string, string, ...interface{}) (converter.EncodedValue, error) {
	return nil, nil
}
func (m *mockTemporalClient) QueryWorkflowWithOptions(context.Context, *client.QueryWorkflowWithOptionsRequest) (*client.QueryWorkflowWithOptionsResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) DescribeWorkflow(context.Context, string, string) (*client.WorkflowExecutionDescription, error) {
	return nil, nil
}
func (m *mockTemporalClient) DescribeTaskQueue(context.Context, string, enumspb.TaskQueueType) (*workflowservice.DescribeTaskQueueResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) DescribeTaskQueueEnhanced(context.Context, client.DescribeTaskQueueEnhancedOptions) (client.TaskQueueDescription, error) {
	return client.TaskQueueDescription{}, nil
}
func (m *mockTemporalClient) ResetWorkflowExecution(context.Context, *workflowservice.ResetWorkflowExecutionRequest) (*workflowservice.ResetWorkflowExecutionResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) UpdateWorkerBuildIdCompatibility(context.Context, *client.UpdateWorkerBuildIdCompatibilityOptions) error {
	return nil
}
func (m *mockTemporalClient) GetWorkerBuildIdCompatibility(context.Context, *client.GetWorkerBuildIdCompatibilityOptions) (*client.WorkerBuildIDVersionSets, error) {
	return nil, nil
}
func (m *mockTemporalClient) GetWorkerTaskReachability(context.Context, *client.GetWorkerTaskReachabilityOptions) (*client.WorkerTaskReachability, error) {
	return nil, nil
}
func (m *mockTemporalClient) UpdateWorkerVersioningRules(context.Context, client.UpdateWorkerVersioningRulesOptions) (*client.WorkerVersioningRules, error) {
	return nil, nil
}
func (m *mockTemporalClient) GetWorkerVersioningRules(context.Context, client.GetWorkerVersioningOptions) (*client.WorkerVersioningRules, error) {
	return nil, nil
}
func (m *mockTemporalClient) CheckHealth(context.Context, *client.CheckHealthRequest) (*client.CheckHealthResponse, error) {
	return nil, nil
}
func (m *mockTemporalClient) UpdateWorkflow(context.Context, client.UpdateWorkflowOptions) (client.WorkflowUpdateHandle, error) {
	return nil, nil
}
func (m *mockTemporalClient) UpdateWorkflowExecutionOptions(context.Context, client.UpdateWorkflowExecutionOptionsRequest) (client.WorkflowExecutionOptions, error) {
	return client.WorkflowExecutionOptions{}, nil
}
func (m *mockTemporalClient) UpdateWithStartWorkflow(context.Context, client.UpdateWithStartWorkflowOptions) (client.WorkflowUpdateHandle, error) {
	return nil, nil
}
func (m *mockTemporalClient) GetWorkflowUpdateHandle(client.GetWorkflowUpdateHandleOptions) client.WorkflowUpdateHandle {
	return nil
}
func (m *mockTemporalClient) ExecuteActivity(context.Context, client.StartActivityOptions, any, ...any) (client.ActivityHandle, error) {
	return nil, nil
}
func (m *mockTemporalClient) GetActivityHandle(client.GetActivityHandleOptions) client.ActivityHandle {
	return nil
}
func (m *mockTemporalClient) ListActivities(context.Context, client.ListActivitiesOptions) (client.ListActivitiesResult, error) {
	return client.ListActivitiesResult{}, nil
}
func (m *mockTemporalClient) CountActivities(context.Context, client.CountActivitiesOptions) (*client.CountActivitiesResult, error) {
	return nil, nil
}
func (m *mockTemporalClient) WorkflowService() workflowservice.WorkflowServiceClient { return nil }
func (m *mockTemporalClient) OperatorService() operatorservice.OperatorServiceClient  { return nil }
func (m *mockTemporalClient) ScheduleClient() client.ScheduleClient                   { return nil }
func (m *mockTemporalClient) DeploymentClient() client.DeploymentClient                { return nil }
func (m *mockTemporalClient) WorkerDeploymentClient() client.WorkerDeploymentClient    { return nil }
func (m *mockTemporalClient) Close()                                                   {}

func newTestTaskHandler(tc *mockTemporalClient) *TaskHandler {
	// Test encryption key (32 bytes).
	testKey := []byte("0123456789abcdef0123456789abcdef")
	return NewTaskHandler(tc, testKey, zerolog.Nop())
}

func TestBulkMoveValidRequest(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"emailIds":      []string{"e1", "e2"},
		"fromMailboxId": "inbox",
		"toMailboxId":   "archive",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/bulk-move", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.BulkMove(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rr.Code, rr.Body.String())
	}
	if !tc.executeWorkflowCalled {
		t.Fatal("expected ExecuteWorkflow to be called")
	}

	var resp taskResponse
	json.NewDecoder(rr.Body).Decode(&resp)
	if resp.TaskID == "" {
		t.Error("expected non-empty taskId")
	}
	if resp.Status != "running" {
		t.Errorf("expected status 'running', got %q", resp.Status)
	}
}

func TestBulkMoveMissingFields(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"emailIds":      []string{"e1"},
		"fromMailboxId": "inbox",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/bulk-move", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.BulkMove(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestBulkDeleteValidRequest(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"emailIds": []string{"e1", "e2", "e3"},
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/bulk-delete", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.BulkDelete(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rr.Code, rr.Body.String())
	}
	if !tc.executeWorkflowCalled {
		t.Fatal("expected ExecuteWorkflow to be called")
	}
}

func TestBulkMarkReadValidRequest(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"emailIds": []string{"e1"},
		"markRead": true,
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/bulk-mark-read", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.BulkMarkRead(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestExportMailboxValidRequest(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"mailboxId": "mbox-1",
		"format":    "mbox",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/export-mailbox", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.ExportMailbox(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestExportMailboxMissingMailboxId(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"format": "mbox",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/export-mailbox", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.ExportMailbox(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestImportMailboxValidRequest(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	body := map[string]interface{}{
		"mailboxId": "mbox-1",
		"blobId":    "blob-123",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tasks/import-mailbox", bytes.NewReader(b))
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rr := httptest.NewRecorder()
	h.ImportMailbox(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestGetTaskStatusReturnsStatus(t *testing.T) {
	now := timestamppb.Now()
	tc := &mockTemporalClient{
		describeResponse: &workflowservice.DescribeWorkflowExecutionResponse{
			WorkflowExecutionInfo: &workflowpb.WorkflowExecutionInfo{
				CloseTime: now,
				Status:    enumspb.WORKFLOW_EXECUTION_STATUS_COMPLETED,
			},
		},
	}
	h := newTestTaskHandler(tc)

	req := httptest.NewRequest(http.MethodGet, "/api/tasks/task-123", nil)
	sess := makeTestSession()
	req = req.WithContext(withSession(req.Context(), sess))

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("taskId", "task-123")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rr := httptest.NewRecorder()
	h.GetTaskStatus(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp taskStatusResponse
	json.NewDecoder(rr.Body).Decode(&resp)
	if resp.TaskID != "task-123" {
		t.Errorf("expected taskId 'task-123', got %q", resp.TaskID)
	}
	if resp.Status != "completed" {
		t.Errorf("expected status 'completed', got %q", resp.Status)
	}
}

func TestAllEndpointsReturn401WithoutSession(t *testing.T) {
	tc := &mockTemporalClient{}
	h := newTestTaskHandler(tc)

	endpoints := []struct {
		name    string
		handler http.HandlerFunc
		method  string
		url     string
		body    interface{}
	}{
		{"BulkMove", h.BulkMove, http.MethodPost, "/api/tasks/bulk-move", map[string]interface{}{"emailIds": []string{"e1"}, "fromMailboxId": "a", "toMailboxId": "b"}},
		{"BulkDelete", h.BulkDelete, http.MethodPost, "/api/tasks/bulk-delete", map[string]interface{}{"emailIds": []string{"e1"}}},
		{"BulkMarkRead", h.BulkMarkRead, http.MethodPost, "/api/tasks/bulk-mark-read", map[string]interface{}{"emailIds": []string{"e1"}}},
		{"ExportMailbox", h.ExportMailbox, http.MethodPost, "/api/tasks/export-mailbox", map[string]interface{}{"mailboxId": "m1"}},
		{"ImportMailbox", h.ImportMailbox, http.MethodPost, "/api/tasks/import-mailbox", map[string]interface{}{"mailboxId": "m1", "blobId": "b1"}},
		{"GetTaskStatus", h.GetTaskStatus, http.MethodGet, "/api/tasks/task-1", nil},
	}

	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			var body []byte
			if ep.body != nil {
				body, _ = json.Marshal(ep.body)
			} else {
				body = []byte(`{}`)
			}
			req := httptest.NewRequest(ep.method, ep.url, bytes.NewReader(body))
			rr := httptest.NewRecorder()
			ep.handler(rr, req)

			if rr.Code != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d", rr.Code)
			}
		})
	}
}
