// GET /api/list —— 给你自己看结果用的接口
//
// 需要在 Cloudflare Pages 项目里设置：
//   KV namespace binding，变量名 DATES
//   环境变量（建议设为 Secret），变量名 ADMIN_KEY —— 你自己定的一串密码
//
// 用法：/api/list?key=你的ADMIN_KEY   或带 header  x-admin-key: 你的ADMIN_KEY

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

// 定长比较，避免用 === 比较密码时的时序差异
function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!env.DATES) return json({ ok: false, error: 'KV binding "DATES" 未绑定' }, 503);
  if (!env.ADMIN_KEY) return json({ ok: false, error: '环境变量 ADMIN_KEY 未设置' }, 503);

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
