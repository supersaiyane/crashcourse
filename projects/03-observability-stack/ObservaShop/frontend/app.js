const API = 'http://localhost:8080';
const prices = { 'LAPTOP-001': 1299.99, 'PHONE-001': 899.99, 'CABLE-001': 12.99, 'MOUSE-001': 99.99, 'KB-001': 89.99 };

async function refresh() {
  // Gateway health
  try {
    const r = await fetch(API + '/health');
    const d = await r.json();
    const el = document.getElementById('gw-health');
    el.textContent = d.status === 'ok' ? 'Healthy' : d.status;
    el.classList.add('ok');
  } catch { document.getElementById('gw-health').textContent = 'offline'; }

  // Orders
  try {
    const r = await fetch(API + '/api/orders');
    const d = await r.json();
    document.getElementById('order-count').textContent = d.total || 0;
    const tbody = document.getElementById('orders-body');
    tbody.innerHTML = '';
    (d.orders || []).slice(-10).reverse().forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + o.order_id + '</td><td>' + (o.items||[]).map(i => i.sku).join(', ') + '</td><td>$' + (o.total||0).toFixed(2) + '</td><td>' + o.status + '</td>';
      tbody.appendChild(tr);
    });
  } catch {}

  // Inventory
  try {
    const r = await fetch(API + '/api/inventory');
    const d = await r.json();
    const inv = d.inventory || {};
    document.getElementById('inventory-count').textContent = Object.keys(inv).length;
    const tbody = document.getElementById('inv-body');
    tbody.innerHTML = '';
    Object.entries(inv).forEach(([sku, item]) => {
      const tr = document.createElement('tr');
      const stockColor = item.stock < 10 ? 'color:#ef4444' : item.stock < 30 ? 'color:#f59e0b' : '';
      tr.innerHTML = '<td>' + sku + '</td><td>' + item.name + '</td><td>$' + item.price.toFixed(2) + '</td><td style="' + stockColor + '">' + item.stock + '</td>';
      tbody.appendChild(tr);
    });
  } catch {}
}

document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sku = document.getElementById('order-sku').value;
  const qty = parseInt(document.getElementById('order-qty').value);
  const result = document.getElementById('order-result');
  result.className = 'result hidden';
  try {
    const r = await fetch(API + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ sku, quantity: qty }], total: prices[sku] * qty })
    });
    const d = await r.json();
    result.textContent = JSON.stringify(d, null, 2);
    result.className = 'result ' + (r.ok ? 'success' : 'error');
    refresh();
  } catch (err) {
    result.textContent = 'Error: ' + err.message;
    result.className = 'result error';
  }
});

refresh();
setInterval(refresh, 5000);
