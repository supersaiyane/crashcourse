const API = 'http://localhost:8080';
async function refresh() {
  try { const r = await fetch(API+'/health'); const d = await r.json(); document.getElementById('health-val').textContent = d.status === 'ok' ? 'Healthy' : d.status; document.getElementById('health-val').classList.add('ok'); } catch { document.getElementById('health-val').textContent = 'offline'; }
  try { const r = await fetch(API+'/api/transactions'); const d = await r.json(); document.getElementById('tx-count').textContent = d.total || 0;
    const tbody = document.getElementById('tx-body'); tbody.innerHTML = '';
    (d.transactions||[]).slice(-10).reverse().forEach(t => { const tr = document.createElement('tr'); tr.innerHTML = '<td>'+t.id+'</td><td>'+t.from+'</td><td>'+t.to+'</td><td>'+t.amount+' '+t.currency+'</td><td>'+t.status+'</td>'; tbody.appendChild(tr); });
  } catch {}
  try { const r = await fetch(API+'/api/audit'); const d = await r.json(); document.getElementById('audit-count').textContent = d.total || 0; } catch {}
}
document.getElementById('tx-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const res = document.getElementById('tx-result'); res.className = 'result hidden';
  try { const r = await fetch(API+'/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({from:document.getElementById('tx-from').value, to:document.getElementById('tx-to').value, amount:parseFloat(document.getElementById('tx-amount').value), currency:document.getElementById('tx-currency').value}) });
    const d = await r.json(); res.textContent = JSON.stringify(d,null,2); res.className = 'result '+(r.ok?'success':'error'); refresh();
  } catch(err) { res.textContent = 'Error: '+err.message; res.className = 'result error'; }
});
refresh(); setInterval(refresh, 5000);
