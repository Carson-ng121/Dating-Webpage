// Worker 入口：静态页面由 Assets 提供，/api/* 由这里处理
//
// 需要的绑定（在 wrangler.jsonc 里配置）：
//   ASSETS —— 静态资源（public/ 目录），自动
//   DATES  —— KV namespace，存她填的结果
// 管理密码（三选一，看 resolveAdminKey）：
//   最简单：在 DATES 这个 KV 里加一条记录，key = config:admin_key，value = 你的密码

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

// 多选字段：接受数组，也接受单个字符串（旧版前端）。去空、去重、限制条数
const cleanList = (v, max = 40, maxItems = 20) => {
  const arr = Array.isArray(v) ? v : (v == null ? [] : [v]);
  const out = [];
  for (const item of arr) {
    const c = clean(item, max);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= maxItems) break;
  }
  return out;
};

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

  // 日期和活动现在可以多选，同时兼容旧版前端的单个写法
  const dates = cleanList(body.dates ?? body.date, 10, 20);
  const activities = cleanList(body.activities ?? body.activity, 20, 20);

  const record = {
    dates,                               // ["2026-09-13","2026-09-20"]
    time: clean(body.time, 5),           // "17:00"
    activities,                          // ["猫咖","滑雪"]，可能含她自己填的
    food: clean(body.food, 20),
    dodges: Number.isFinite(body.dodges) ? Math.min(Math.max(0, body.dodges | 0), 9999) : null,
    at: new Date().toISOString(),
    country: request.headers.get('cf-ipcountry') || null,
  };

  if (!dates.length && !record.time && !activities.length && !record.food) {
    return json({ ok: false, error: '空内容' }, 400);
  }

  const key = 'sub:' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await env.DATES.put(key, JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 180,   // 存 180 天后自动清掉
  });

  return json({ ok: true });
}

// 找出管理密码。三种设置方式任选其一，按顺序尝试：
//   1) 纯文本变量 / wrangler secret put ADMIN_KEY  → env.ADMIN_KEY 是字符串
//   2) Secrets Store 绑定，变量名 ADMIN_KEY        → env.ADMIN_KEY.get()
//   3) 退路：KV 里存一条 key 为 config:admin_key 的记录（后台点几下就能加）
export async function resolveAdminKey(env) {
  const v = env.ADMIN_KEY;

  if (typeof v === 'string' && v.trim()) return v.trim();

  if (v && typeof v.get === 'function') {
    try {
      const s = await v.get();
      if (typeof s === 'string' && s.trim()) return s.trim();
    } catch { /* 读不到就往下试 */ }
  }

  if (env.DATES) {
    try {
      const s = await env.DATES.get('config:admin_key');
      if (typeof s === 'string' && s.trim()) return s.trim();
    } catch { /* 读不到就当没设 */ }
  }

  return null;
}

// GET /api/list —— 你自己看结果，要密码
async function handleList(request, env) {
  if (!env.DATES) return json({ ok: false, error: 'KV binding "DATES" 未绑定' }, 503);

  const adminKey = await resolveAdminKey(env);
  if (!adminKey) {
    return json({
      ok: false,
      error: '管理密码未设置：在 KV 里加一条 key 为 config:admin_key 的记录，' +
             '或设一个名为 ADMIN_KEY 的变量／Secrets Store 绑定',
    }, 503);
  }

  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-key') || url.searchParams.get('key') || '';
  if (!keyMatches(provided, adminKey)) {
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
