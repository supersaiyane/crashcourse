package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	healthHandler(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", body["status"])
	}
}

func TestCreateTransaction(t *testing.T) {
	payload := `{"from":"ACC001","to":"ACC002","amount":100.50,"currency":"USD"}`
	req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBufferString(payload))
	w := httptest.NewRecorder()
	createTransactionHandler(w, req)
	if w.Code != 201 {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var tx Transaction
	json.Unmarshal(w.Body.Bytes(), &tx)
	if tx.Amount != 100.50 {
		t.Fatalf("expected 100.50, got %f", tx.Amount)
	}
}

func TestCreateTransactionMissingFrom(t *testing.T) {
	payload := `{"to":"ACC002","amount":100}`
	req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBufferString(payload))
	w := httptest.NewRecorder()
	createTransactionHandler(w, req)
	if w.Code != 400 {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateTransactionNegativeAmount(t *testing.T) {
	payload := `{"from":"ACC001","to":"ACC002","amount":-50}`
	req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBufferString(payload))
	w := httptest.NewRecorder()
	createTransactionHandler(w, req)
	if w.Code != 400 {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCreateTransactionExceedsLimit(t *testing.T) {
	payload := `{"from":"ACC001","to":"ACC002","amount":2000000}`
	req := httptest.NewRequest("POST", "/api/transactions", bytes.NewBufferString(payload))
	w := httptest.NewRecorder()
	createTransactionHandler(w, req)
	if w.Code != 400 {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestListTransactions(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/transactions", nil)
	w := httptest.NewRecorder()
	listTransactionsHandler(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestAuditLog(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/audit", nil)
	w := httptest.NewRecorder()
	auditHandler(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
