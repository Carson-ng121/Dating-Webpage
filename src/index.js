// Worker 入口：静态页面由 Assets 提供，/api/* 由这里处理
//
// 需要的绑定（在 wrangler.jsonc 里配置）：
//   ASSETS —— 静态资源（public/ 目录），自动
//   DATES  —— KV namespace，存她填的结果
// 需要的密钥（在 Cloudflare 后台 Settings → Variables and Secrets 设为 Secret）：
//   ADMIN_KEY —— 你自己定的一串密码，用来查看结果

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

// 只留字符串、砍掉超长内容，避免有人往 KV 里塞垃圾
const clean = (v, max = 40) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

// 定长比较，避免用 === 比较密码时的时序差异
function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// POST /api/submit —— 她填完时前端发过来
async function handleSubmit(request, env) {
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

  if (!record.date && !record.time && !record.activity && !record.food) {
    return json({ ok: false, error: '空内容' }, 400);
  }

  const key = 'sub:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await env.DATES.put(key, JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 180,   // 存 180 天后自动清掉
  });

  return json({ ok: true });
}

// GET /api/list —— 你自己看结果，要密码
async function handleList(request, env) {
  if (!env.DATES) return json({ ok: false, error: 'KV binding "DATES" 未绑定' }, 503);
  if (!env.ADMIN_KEY) return json({ ok: false, error: '密钥 ADMIN_KEY 未设置' }, 503);

  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-key') || url.searchParams.get('key') || '';
  if (!keyMatches(provided, env.ADMIN_KEY)) {
    return json({ ok: false, error: '密码不对' }, 401);
  }

  const listed = await env.DATES.list({ prefix: 'sub:' });
  const items = [];
  for (const k of listed.keys) {
    const value = await env.DATES.get(k.name, 'json');
    if (value) items.push({ key: k.name, ...value });
  }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));   // 最新的排前面

  return json({ ok: true, count: items.length, items });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/submit') {
      return request.method === 'POST'
        ? handleSubmit(request, env)
        : json({ ok: false, error: 'Method Not Allowed' }, 405);
    }

    if (pathname === '/api/list') {
      return request.method === 'GET'
        ? handleList(request, env)
        : json({ ok: false, error: 'Method Not Allowed' }, 405);
    }

    // 其余交给静态资源（public/）
    return env.ASSETS.fetch(request);
  },
};
