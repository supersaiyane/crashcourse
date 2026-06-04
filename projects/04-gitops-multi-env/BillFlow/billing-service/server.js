const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || 'development';

// In-memory store
const subscriptions = [];
const invoices = [];

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', env: ENV, version: '1.0.0' }));

// Subscriptions
app.post('/api/subscriptions', (req, res) => {
  const sub = { id: uuidv4().slice(0, 8), customer: req.body.customer, plan: req.body.plan, status: 'active', created: new Date().toISOString() };
  subscriptions.push(sub);
  console.log(JSON.stringify({ level: 'info', msg: 'subscription created', sub_id: sub.id, plan: sub.plan }));
  res.status(201).json(sub);
});

app.get('/api/subscriptions', (req, res) => res.json({ subscriptions, total: subscriptions.length }));

// Invoices
app.post('/api/invoices', (req, res) => {
  const inv = { id: uuidv4().slice(0, 8), subscription_id: req.body.subscription_id, amount: req.body.amount, currency: req.body.currency || 'USD', status: 'pending', created: new Date().toISOString() };
  invoices.push(inv);
  console.log(JSON.stringify({ level: 'info', msg: 'invoice created', inv_id: inv.id, amount: inv.amount }));
  res.status(201).json(inv);
});

app.get('/api/invoices', (req, res) => res.json({ invoices, total: invoices.length }));

// Payment webhook
app.post('/api/webhooks/payment', (req, res) => {
  const { invoice_id, status } = req.body;
  const inv = invoices.find(i => i.id === invoice_id);
  if (!inv) return res.status(404).json({ error: 'invoice not found' });
  inv.status = status;
  console.log(JSON.stringify({ level: 'info', msg: 'payment webhook', inv_id: invoice_id, status }));
  res.json({ updated: true, invoice: inv });
});

app.listen(PORT, () => console.log(JSON.stringify({ level: 'info', msg: `BillFlow started on :${PORT}`, env: ENV })));

module.exports = app;
