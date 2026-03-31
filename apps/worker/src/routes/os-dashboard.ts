import { Hono } from 'hono';
import type { Env } from '../index.js';

const osDashboard = new Hono<Env>();

// 集計API: 問い合わせ統計
osDashboard.get('/api/os/stats', async (c) => {
  const db = c.env.DB;
  const days = parseInt(c.req.query('days') ?? '7');

  const [total, byModule, byDay, recent] = await Promise.all([
    // 総件数
    db.prepare(
      `SELECT COUNT(*) as count FROM os_inquiry_log WHERE created_at >= datetime('now', '-' || ? || ' days')`
    ).bind(days).first<{ count: number }>(),

    // モジュール別
    db.prepare(
      `SELECT module, COUNT(*) as count FROM os_inquiry_log WHERE created_at >= datetime('now', '-' || ? || ' days') GROUP BY module ORDER BY count DESC`
    ).bind(days).all(),

    // 日別
    db.prepare(
      `SELECT date(created_at) as day, COUNT(*) as count FROM os_inquiry_log WHERE created_at >= datetime('now', '-' || ? || ' days') GROUP BY date(created_at) ORDER BY day`
    ).bind(days).all(),

    // 直近10件
    db.prepare(
      `SELECT line_user_id, message, module, confidence, status, created_at FROM os_inquiry_log ORDER BY created_at DESC LIMIT 10`
    ).all(),
  ]);

  return c.json({
    period: `${days}d`,
    total: total?.count ?? 0,
    byModule: byModule.results,
    byDay: byDay.results,
    recent: recent.results,
  });
});

// HTMLダッシュボード
osDashboard.get('/os/dashboard', async (c) => {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Business OS Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:24px;margin-bottom:20px;color:#60a5fa}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px}
.card-label{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
.card-value{font-size:32px;font-weight:700;margin-top:4px}
.table{width:100%;border-collapse:collapse;margin-top:16px}
.table th{text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;border-bottom:1px solid #334155;text-transform:uppercase}
.table td{padding:8px 12px;font-size:13px;border-bottom:1px solid #1e293b}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.badge-inquiry{background:rgba(59,130,246,.2);color:#93c5fd}
.badge-research{background:rgba(139,92,246,.2);color:#c4b5fd}
.badge-content{background:rgba(245,158,11,.2);color:#fcd34d}
.chart{height:120px;display:flex;align-items:flex-end;gap:4px;margin-top:12px}
.bar{background:#3b82f6;border-radius:4px 4px 0 0;flex:1;min-width:20px;position:relative}
.bar-label{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:9px;color:#64748b;white-space:nowrap}
select{background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:6px 10px;font-size:13px;margin-bottom:16px}
</style>
</head>
<body>
<h1>Business OS Dashboard</h1>
<select id="period" onchange="load()">
<option value="7">過去7日</option>
<option value="14">過去14日</option>
<option value="30">過去30日</option>
</select>
<div class="grid" id="cards"></div>
<div class="card"><h3 style="font-size:14px;margin-bottom:8px">日別推移</h3><div class="chart" id="chart"></div></div>
<div class="card" style="margin-top:16px"><h3 style="font-size:14px;margin-bottom:8px">直近の問い合わせ</h3><table class="table" id="recent"><thead><tr><th>日時</th><th>メッセージ</th><th>分類</th><th>確信度</th></tr></thead><tbody></tbody></table></div>
<script>
async function load(){
  const days=document.getElementById('period').value;
  const r=await fetch('/api/os/stats?days='+days);
  const d=await r.json();
  document.getElementById('cards').innerHTML=
    '<div class="card"><div class="card-label">総件数</div><div class="card-value">'+d.total+'</div></div>'+
    d.byModule.map(m=>'<div class="card"><div class="card-label">'+m.module+'</div><div class="card-value">'+m.count+'</div></div>').join('');
  const max=Math.max(...d.byDay.map(x=>x.count),1);
  document.getElementById('chart').innerHTML=d.byDay.map(x=>'<div class="bar" style="height:'+(x.count/max*100)+'%"><div class="bar-label">'+x.day.slice(5)+'</div></div>').join('');
  document.getElementById('recent').querySelector('tbody').innerHTML=d.recent.map(r=>'<tr><td>'+r.created_at+'</td><td>'+(r.message.length>50?r.message.slice(0,50)+'...':r.message)+'</td><td><span class="badge badge-'+r.module+'">'+r.module+'</span></td><td>'+(r.confidence*100).toFixed(0)+'%</td></tr>').join('');
}
load();
</script>
</body></html>`;
  return c.html(html);
});

export { osDashboard };
