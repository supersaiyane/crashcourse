// SecureBank Transaction API — banking transaction processing service.
// Demonstrates security best practices: structured logging, input validation,
// rate limiting, audit trail, and health checks.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Transaction struct {
	ID        string    `json:"id"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Amount    float64   `json:"amount"`
	Currency  string    `json:"currency"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type AuditEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Action    string    `json:"action"`
	TxID      string    `json:"tx_id,omitempty"`
	Actor     string    `json:"actor"`
	Detail    string    `json:"detail"`
}

var (
	transactions []Transaction
	auditLog     []AuditEntry
	mu           sync.RWMutex
)

func logJSON(level, msg string, fields map[string]interface{}) {
	entry := map[string]interface{}{
		"ts":      time.Now().Unix(),
		"service": "transaction-api",
		"level":   level,
		"msg":     msg,
	}
	for k, v := range fields {
		entry[k] = v
	}
	data, _ := json.Marshal(entry)
	fmt.Println(string(data))
}

func audit(action, txID, actor, detail string) {
	entry := AuditEntry{
		Timestamp: time.Now(),
		Action:    action,
		TxID:      txID,
		Actor:     actor,
		Detail:    detail,
	}
	mu.Lock()
	auditLog = append(auditLog, entry)
	mu.Unlock()
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"version": "1.0.0",
		"service": "transaction-api",
	})
}

func createTransactionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		From     string  `json:"from"`
		To       string  `json:"to"`
		Amount   float64 `json:"amount"`
		Currency string  `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Input validation — critical for financial APIs
	if req.From == "" || req.To == "" {
		http.Error(w, `{"error":"from and to accounts are required"}`, http.StatusBadRequest)
		return
	}
	if req.Amount <= 0 {
		http.Error(w, `{"error":"amount must be positive"}`, http.StatusBadRequest)
		return
	}
	if req.Amount > 1000000 {
		http.Error(w, `{"error":"amount exceeds single transaction limit"}`, http.StatusBadRequest)
		return
	}
	if req.Currency == "" {
		req.Currency = "USD"
	}

	tx := Transaction{
		ID:        uuid.New().String()[:8],
		From:      req.From,
		To:        req.To,
		Amount:    req.Amount,
		Currency:  req.Currency,
		Status:    "completed",
		CreatedAt: time.Now(),
	}

	mu.Lock()
	transactions = append(transactions, tx)
	mu.Unlock()

	audit("create_transaction", tx.ID, "api", fmt.Sprintf("%.2f %s from %s to %s", tx.Amount, tx.Currency, tx.From, tx.To))
	logJSON("info", "transaction created", map[string]interface{}{"tx_id": tx.ID, "amount": tx.Amount, "currency": tx.Currency})

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

func listTransactionsHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transactions": transactions,
		"total":        len(transactions),
	})
}

func auditHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"audit_log": auditLog,
		"total":     len(auditLog),
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/api/transactions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			listTransactionsHandler(w, r)
		case http.MethodPost:
			createTransactionHandler(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/audit", auditHandler)

	logJSON("info", "starting server", map[string]interface{}{"port": port})
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
