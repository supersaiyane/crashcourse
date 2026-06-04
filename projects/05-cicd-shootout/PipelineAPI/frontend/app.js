const API = 'http://localhost:5000';
async function refresh() {
  try { const r = await fetch(API+'/health'); const d = await r.json(); document.getElementById('health-val').textContent = d.status === 'ok' ? 'Healthy' : d.status; document.getElementById('health-val').classList.add('ok'); } catch { document.getElementById('health-val').textContent = 'offline'; }
  try { const r = await fetch(API+'/api/items'); const d = await r.json(); document.getElementById('item-count').textContent = d.total || 0;
    const tbody = document.getElementById('items-body'); tbody.innerHTML = '';
    (d.items||[]).forEach(i => { const tr = document.createElement('tr'); tr.innerHTML = '<td>'+i.id+'</td><td>'+i.name+'</td><td>'+new Date(i.created*1000).toLocaleString()+'</td><td><button class="del-btn" onclick="delItem(\''+i.id+'\')">Delete</button></td>'; tbody.appendChild(tr); });
  } catch {}
}
document.getElementById('item-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const res = document.getElementById('item-result'); res.className = 'result hidden';
  try { const r = await fetch(API+'/api/items', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:document.getElementById('item-name').value}) });
    const d = await r.json(); res.textContent = JSON.stringify(d,null,2); res.className = 'result '+(r.ok?'success':'error'); document.getElementById('item-name').value=''; refresh();
  } catch(err) { res.textContent = 'Error: '+err.message; res.className = 'result error'; }
});
async function delItem(id) { await fetch(API+'/api/items/'+id, {method:'DELETE'}); refresh(); }
refresh(); setInterval(refresh, 5000);
