/** Self-contained admin page. All data calls go to the existing /api/v1/admin endpoints with the admin JWT. */
export const ADMIN_PANEL_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>X TaIk admin</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:16px}input,button{padding:8px;border-radius:8px;border:1px solid #444;background:#222;color:#eee}
button{cursor:pointer}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border-bottom:1px solid #333;padding:6px;text-align:left;font-size:14px}.card{display:inline-block;background:#1c1c1c;border-radius:12px;padding:12px;margin:4px;min-width:110px}
h2{margin-top:22px}.err{color:#f66}</style></head><body>
<h1>X TaIk admin</h1>
<div id="login"><input id="em" placeholder="email" autocomplete="username"> <input id="pw" type="password" placeholder="password" autocomplete="current-password"> <button onclick="doLogin()">Sign in</button> <span id="le" class="err"></span></div>
<div id="app" style="display:none">
<div id="stats"></div>
<h2>Users</h2><input id="q" placeholder="search username or email"> <button onclick="loadUsers()">Search</button><table id="users"></table>
<h2>Open reports</h2><table id="reports"></table>
<h2>Audit log</h2><table id="audit"></table>
</div>
<script>
var T=null;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
async function api(p,o){o=o||{};o.headers=Object.assign({'Content-Type':'application/json',Authorization:'Bearer '+T},o.headers||{});var r=await fetch('/api/v1/admin/'+p,o);if(r.status==401){location.reload()}return r.json()}
async function doLogin(){var r=await fetch('/api/v1/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('em').value,password:document.getElementById('pw').value})});var d=await r.json();if(!d.accessToken){document.getElementById('le').textContent='Sign-in failed';return}T=d.accessToken;document.getElementById('login').style.display='none';document.getElementById('app').style.display='block';loadAll()}
async function loadAll(){var s=await api('stats');document.getElementById('stats').innerHTML=Object.keys(s).map(function(k){return '<div class="card"><b>'+esc(s[k])+'</b><br>'+esc(k)+'</div>'}).join('');loadUsers();loadReports();var a=await api('audit-log');var rows=(a.results||a.items||[]);document.getElementById('audit').innerHTML=rows.map(function(x){return '<tr><td>'+esc((x.createdAt||'').slice(0,16))+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.targetId||'')+'</td></tr>'}).join('')}
async function loadUsers(){var d=await api('users?search='+encodeURIComponent(document.getElementById('q').value||''));var rows=d.results||d.items||[];document.getElementById('users').innerHTML=rows.map(function(u){return '<tr><td>'+esc(u.username)+'</td><td>'+esc(u.email)+'</td><td>'+esc(u.status)+'</td><td><button data-id="'+esc(u.id)+'" data-a="'+(u.status=='SUSPENDED'?'unsuspend':'suspend')+'" onclick="act(this)">'+(u.status=='SUSPENDED'?'Unsuspend':'Suspend')+'</button></td></tr>'}).join('')}
async function act(b){if(!confirm('Confirm '+b.dataset.a+'?'))return;await api('users/'+b.dataset.id+'/'+b.dataset.a,{method:'POST',body:JSON.stringify({notes:'admin panel'})});loadUsers()}
async function loadReports(){var d=await api('reports?status=OPEN');var rows=d.results||d.items||[];document.getElementById('reports').innerHTML=rows.map(function(r){return '<tr><td>'+esc((r.createdAt||'').slice(0,16))+'</td><td>'+esc(r.reason||r.category)+'</td><td>'+esc(r.targetType||'')+'</td><td><button data-id="'+esc(r.id)+'" onclick="resolveR(this)">Resolve</button></td></tr>'}).join('')}
async function resolveR(b){var a=prompt('Action: WARN, RESTRICT, SUSPEND, REMOVE_CONTENT or DISMISS_REPORT','DISMISS_REPORT');if(!a)return;await api('reports/'+b.dataset.id+'/resolve',{method:'POST',body:JSON.stringify({action:a.trim().toUpperCase()})});loadReports()}
</script></body></html>`;
