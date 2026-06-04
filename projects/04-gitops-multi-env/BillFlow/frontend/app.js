const API = 'http://localhost:3000';
async function refresh() {
  try { const r = await fetch(API+'/health'); const d = await r.json(); const el = document.getElementById('health-val'); el.textContent = d.status === 'ok' ? 'Healthy' : d.status; el.classList.add('ok'); document.getElementById('env-badge').textContent = d.env || 'development'; } catch { document.getElementById('health-val').textContent = 'offline'; }
  try { const r = await fetch(API+'/api/subscriptions'); const d = await r.json(); document.getElementById('sub-count').textContent = d.total || 0; } catch {}
  try { const r = await fetch(API+'/api/invoices'); const d = await r.json(); document.getElementById('inv-count').textContent = d.total || 0; } catch {}
}
document.getElementById('sub-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const res = document.getElementById('sub-result'); res.className = 'result hidden';
  try { const r = await fetch(API+'/api/subscriptions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({customer:document.getElementById('sub-customer').value, plan:document.getElementById('sub-plan').value}) });
    const d = await r.json(); res.textContent = JSON.stringify(d, null, 2); res.className = 'result success'; refresh();
  } catch(err) { res.textContent = 'Error: '+err.message; res.className = 'result error'; }
});
document.getElementById('inv-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const res = document.getElementById('inv-result'); res.className = 'result hidden';
  try { const r = await fetch(API+'/api/invoices', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({subscription_id:document.getElementById('inv-sub-id').value, amount:parseFloat(document.getElementById('inv-amount').value)}) });
    const d = await r.json(); res.textContent = JSON.stringify(d, null, 2); res.className = 'result success'; refresh();
  } catch(err) { res.textContent = 'Error: '+err.message; res.className = 'result error'; }
});
refresh(); setInterval(refresh, 5000);
