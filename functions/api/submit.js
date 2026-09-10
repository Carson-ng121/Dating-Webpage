// POST /api/submit —— 接收她填完的约会结果，写进 KV
//
// 需要在 Cloudflare Pages 项目里绑定：
//   KV namespace binding，变量名 DATES
//
// 没绑定 KV 时会回 503，但前端是「发了就不管」，不影响页面正常使用。

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

// 只留字符串、砍掉超长内容，避免有人往 KV 里塞垃圾
const clean = (v, max = 40) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function onRequestPost({ request, env }) {
  if (!env.DATES) return json({ ok: false, error: 'KV binding "DATES" 未绑定' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: '请求格式不对' }, 400);
  }

  const record = {
    date: clean(body.date, 10),          // "2026-07-12"
    time: clean(body.time, 5),           // "17:00"
    activity: clean(body.activity, 20),  // 可能是她自己填的
    food: clean(body.food, 20),
    dodges: Number.isFinite(body.dodges) ? Math.min(Math.max(0, body.dodges | 0), 9999) : null,
    at: new Date().toISOString(),
    country: request.headers.get('cf-ipcountry') || null,
  };

  // 四项全空的请求直接丢掉
  if (!record.date && !record.time && !record.activity && !record.food) {
    return json({ ok: false, error: '空内容' }, 400);
  }

  const key = 'sub:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await env.DATES.put(key, JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 180,   // 存 180 天，之后自动清掉
  });

  return json({ ok: true });
}

// 只导出 onRequestPost：其他方法 Pages 会自动回 405，不需要自己处理
