const API = 'http://localhost:8080';

async function fetchHealth() {
  try {
    const r = await fetch(API + '/health');
    const d = await r.json();
    const el = document.getElementById('health-status');
    el.textContent = d.status === 'ok' ? 'Healthy' : d.status;
    el.classList.add(d.status === 'ok' ? 'ok' : 'error');
  } catch { document.getElementById('health-status').textContent = 'offline'; document.getElementById('health-status').classList.add('error'); }
}

async function fetchBalance() {
  try {
    const r = await fetch(API + '/api/balance');
    const d = await r.json();
    document.getElementById('balance-value').textContent = `${d.currency} ${d.balance.toLocaleString()}`;
  } catch { document.getElementById('balance-value').textContent = 'N/A'; }
}

async function fetchStatements() {
  try {
    const r = await fetch(API + '/api/statements');
    const d = await r.json();
    document.getElementById('statements-count').textContent = d.files ? d.files.length + ' files' : '0 files';
  } catch { document.getElementById('statements-count').textContent = 'N/A'; }
}

document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = document.getElementById('payment-result');
  result.className = 'result hidden';
  try {
    const r = await fetch(API + '/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: document.getElementById('pay-from').value,
        to: document.getElementById('pay-to').value,
        amount: parseFloat(document.getElementById('pay-amount').value),
        currency: 'INR'
      })
    });
    const d = await r.json();
    result.textContent = JSON.stringify(d, null, 2);
    result.className = 'result ' + (d.status === 'accepted' ? 'success' : 'error');
    fetchBalance();
  } catch (err) {
    result.textContent = 'Error: ' + err.message;
    result.className = 'result error';
  }
});

fetchHealth();
fetchBalance();
fetchStatements();
setInterval(fetchHealth, 10000);
