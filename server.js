// Vidu 视频生成 Web 服务 —— 零依赖 Node.js 服务器
//
// 职责：
//  1. 提供静态前端 (public/)
//  2. 作为代理转发到 Vidu 开放平台 API（在服务端注入 API Key，避免泄露到浏览器）
//  3. 支持四种创建任务接口 + 任务查询 + 任务取消
//
// 环境变量：
//  VIDU_API_KEY   默认 API Key（前端也可覆盖）
//  VIDU_BASE_URL  默认 https://api.vidu.cn/ent/v2
//  PORT           默认 8080
//  HOST           默认 0.0.0.0

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const BASE_URL = (process.env.VIDU_BASE_URL || 'https://api.vidu.cn/ent/v2').replace(/\/$/, '');
// NS（Vidu-W 系列，有声视频）模型走海外站 api.vidu.com。
// 默认把基址里的 api.vidu.cn 替换为 api.vidu.com，也可用 VIDU_NS_BASE_URL 显式覆盖。
const NS_BASE_URL = (process.env.VIDU_NS_BASE_URL || BASE_URL.replace('api.vidu.cn', 'api.vidu.com')).replace(/\/$/, '');
const ENV_API_KEY = process.env.VIDU_API_KEY || '';

// 站点基址：前端的「国内/海外」选择驱动。cn→api.vidu.cn，com→api.vidu.com；
// 未指定时回退到环境变量 VIDU_BASE_URL（默认 .cn）。
function siteBase(region) {
  if (region === 'com') return 'https://api.vidu.com/ent/v2';
  if (region === 'cn') return 'https://api.vidu.cn/ent/v2';
  return BASE_URL;
}

// NS（Vidu-W 系列）模型集合——这些模型为海外站专有，始终走 .com。
const NS_MODELS = new Set(['viduq3-ns', 'viduq3-ns-flash', 'viduq2-ns']);
function baseForModel(model, region) {
  if (NS_MODELS.has(String(model))) return NS_BASE_URL;
  return siteBase(region);
}

// v3 协议（drama 系列）：POST/GET/DELETE /ent/api/v3/contents/generations/tasks
// 与 v2 的差异：Bearer 鉴权、content 数组请求体、status/content.video_url 响应。
function v3Base(region) {
  const b = siteBase(region);
  try { return new URL(b).origin + '/ent/api/v3'; }
  catch { return 'https://api.vidu.cn/ent/api/v3'; }
}
const DRAMA_MODELS = new Set([
  'viduq3.1-drama-std', 'viduq3-drama-std', 'viduq3-drama-fast', 'viduq3-drama-mini',
]);
const V3_ENDPOINTS = {
  drama2video: '/contents/generations/tasks',
};
const MODE_PROTOCOL = { drama2video: 'v3', 'explain-comic': 'ec', 'short-play': 'sp', 'kling-video': 'kling' };

// 将 v3 响应归一化为前端已有的 v2 结构（state + creations[].url）
function normalizeV3(data) {
  const d = data || {};
  const map = { succeeded: 'success', failed: 'failed', expired: 'failed', queued: 'processing', running: 'processing' };
  const out = { ...d, state: map[d.status] || d.status || 'unknown' };
  const creations = [];
  if (d.content && d.content.video_url) creations.push({ url: d.content.video_url });
  if (d.content && d.content.last_frame_url) out.last_frame_url = d.content.last_frame_url;
  if (creations.length) out.creations = creations;
  return out;
}

// 解说剧成片（explain-comic，v1 协议）：POST /ent/v1/explain-comic/tasks
// Token 鉴权；请求体为 script_content + assets[] 结构；查询用 POST .../tasks/custom/{id}。
function ecBase(region) {
  const b = siteBase(region);
  try { return new URL(b).origin + '/ent/v1'; }
  catch { return 'https://api.vidu.cn/ent/v1'; }
}
// 将 explain-comic 的查询响应归一化为前端已有结构（state + creations[].url）
function normalizeEC(data) {
  const d = data || {};
  const map = {
    created: 'processing', parsing: 'processing', storyboard_generating: 'processing',
    rendering: 'processing', composing: 'processing', succeeded: 'success', failed: 'failed',
  };
  const out = { ...d, state: map[d.state] || d.state || 'unknown' };
  if (d.video_url) out.creations = [{ url: d.video_url }];
  return out;
}

// 将 short-play 的查询响应（嵌套 task.meta / task.derived_data）归一化
function normalizeSP(data) {
  const d = data || {};
  const t = d.task || d;
  const meta = t.meta || {};
  const dd = t.derived_data || {};
  const map = {
    created: 'processing', processing: 'processing', pending: 'processing',
    queued: 'processing', running: 'processing', success: 'success',
    succeeded: 'success', failed: 'failed',
  };
  const out = { ...d, state: map[meta.state] || meta.state || 'unknown' };
  const video = dd.signed_final_video_url || dd.signed_final_watermarked_video_url;
  if (video) out.creations = [{ url: video, watermarked_url: dd.signed_final_watermarked_video_url || '' }];
  if (Array.isArray(dd.shots)) out.shots = dd.shots.map((s) => ({ id: s.shot_id, url: s.signed_video_url || '' }));
  if (meta.err_msg) out.err_msg = meta.err_msg;
  if (meta.err_code) out.err_code = meta.err_code;
  if (d.credits != null) out.credits = d.credits;
  return out;
}

// ---- Kling（第三方网关 www.ysxxai.com，Bearer 鉴权，独立 API Key）----
const KLING_BASE_URL = (process.env.KLING_BASE_URL || 'https://www.ysxxai.com').replace(/\/$/, '');
// 归一化 Kling 查询响应：{ code:"success", data:{ status(大写), result_url, fail_reason, progress } }
function normalizeKling(data) {
  const d = data || {};
  const dd = d.data || {};
  const map = {
    NOT_START: 'processing', SUBMITTED: 'processing', QUEUED: 'processing',
    IN_PROGRESS: 'processing', BILLING_PENDING: 'processing', UNKNOWN: 'processing',
    SUCCESS: 'success', FAILURE: 'failed',
  };
  const raw = dd.status || '';
  const out = { ...d, state: map[raw] || (raw ? 'processing' : 'unknown') };
  if (dd.result_url) out.creations = [{ url: dd.result_url }];
  if (dd.fail_reason) out.err_msg = dd.fail_reason;
  if (dd.progress) out.progress = dd.progress;
  return out;
}

// mode -> Vidu 创建任务端点
const MODE_ENDPOINTS = {
  reference2video: '/reference2video', // 参考生视频
  reference2image: '/reference2image', // 参考生图
  img2video: '/img2video',             // 图生视频
  text2video: '/text2video',           // 文生视频（NS 模型）
  'start-end2video': '/start-end2video', // 首尾帧生视频
  multiframe: '/multiframe',           // 智能多帧
  drama2video: '/contents/generations/tasks', // drama 系列（v3 协议）
  'explain-comic': '/explain-comic/tasks', // 解说剧成片（v1 协议）
  'short-play': '/short-play/tasks',       // 短剧成片（v1 协议）
  'kling-video': '/v1/video/generations',  // Kling（第三方 www.ysxxai.com）
};


const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limitBytes = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('请求体过大 (payload too large)'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function resolveApiKey(req, bodyKey) {
  if (bodyKey && String(bodyKey).trim()) return String(bodyKey).trim();
  const header = req.headers['x-api-key'];
  if (header && String(header).trim()) return String(header).trim();
  return ENV_API_KEY;
}

// 转发到 Vidu 并回传结果
async function forward({ method, url, apiKey, body, bearer = false, extraHeaders }) {
  const headers = {
    'Content-Type': 'application/json',
    // v2 用 Token，v3（drama）用 Bearer
    Authorization: bearer ? `Bearer ${apiKey}` : `Token ${apiKey}`,
    ...(extraHeaders || {}),
  };
  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: resp.status, data };
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','generate']

  // POST /api/generate  { mode, apiKey, params }
  if (req.method === 'POST' && parts[1] === 'generate') {
    let payload;
    try {
      payload = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return sendJSON(res, 400, { error: '无效的 JSON 请求体', detail: String(e.message || e) });
    }
    const { mode, apiKey: bodyKey, params } = payload;
    const endpoint = MODE_ENDPOINTS[mode];
    if (!endpoint) return sendJSON(res, 400, { error: `未知的生成模式: ${mode}` });
    const apiKey = resolveApiKey(req, bodyKey);
    if (!apiKey) return sendJSON(res, 400, { error: '缺少 API Key（请在页面顶部填写，或设置 VIDU_API_KEY 环境变量）' });
    if (!params || typeof params !== 'object') return sendJSON(res, 400, { error: '缺少 params 参数' });
    // 协议分流：v2（默认）/ v3（drama）/ ec（解说剧成片）/ kling（第三方）
    const proto = MODE_PROTOCOL[mode] || 'v2';

    // Kling：独立基址（www.ysxxai.com）+ Bearer，创建返回扁平 {id,status}
    if (proto === 'kling') {
      const url2 = KLING_BASE_URL + endpoint;
      console.log(`\n[generate] mode=${mode} proto=kling endpoint=${url2} model=${params.model}`);
      try {
        const result = await forward({ method: 'POST', url: url2, apiKey, body: params, bearer: true });
        console.log(`[generate] kling RESULT → HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 200)}`);
        return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: result.data, endpoint: url2 });
      } catch (e) {
        return sendJSON(res, 502, { error: '调用 Kling 失败', detail: String(e.message || e) });
      }
    }

    const isV3 = proto === 'v3';
    // region=国内(cn)/海外(com) 由前端选择；NS 模型始终走 .com
    const region = payload.region;
    const base = proto === 'v3' ? v3Base(region)
      : (proto === 'ec' || proto === 'sp') ? ecBase(region)
      : baseForModel(params.model, region);
    // 调试日志：打印真正发给 Vidu 的请求体（图片/视频 base64 截断）
    console.log(`\n[generate] mode=${mode} proto=${proto} endpoint=${base + endpoint}`);
    console.log('[generate] body=', JSON.stringify(params, (k, v) =>
      (typeof v === 'string' && v.length > 120) ? v.slice(0, 60) + `…(${v.length}chars)` : v, 2));
    try {
      const result = await forward({ method: 'POST', url: base + endpoint, apiKey, body: params, bearer: isV3 });
      // 调试日志：Vidu 的返回（只打印关键错误信息）
      const d = result.data || {};
      console.log(`[generate] RESULT model=${params.model} → HTTP ${result.status} ` +
        JSON.stringify({ code: d.code, reason: d.reason, message: d.message, metadata: d.metadata }));
      // 创建接口：v3 需归一化（含 content），ec/v2 创建仅返回 {id}，无需归一化
      const data = isV3 ? normalizeV3(result.data) : result.data;
      return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data, endpoint: base + endpoint });
    } catch (e) {
      return sendJSON(res, 502, { error: '调用 Vidu 失败', detail: String(e.message || e) });
    }
  }

  // GET /api/tasks/:id   -> 查询任务
  if (req.method === 'GET' && parts[1] === 'tasks' && parts[2] && !parts[3]) {
    const apiKey = resolveApiKey(req, url.searchParams.get('apiKey'));
    if (!apiKey) return sendJSON(res, 400, { error: '缺少 API Key' });
    const proto = url.searchParams.get('proto') || 'v2';
    const region = url.searchParams.get('region');
    const id = encodeURIComponent(parts[2]);
    // 解说剧成片（ec）查询为 POST .../tasks/custom/{id}，其余为 GET
    if (proto === 'ec') {
      try {
        const result = await forward({ method: 'POST', url: `${ecBase(region)}/explain-comic/tasks/custom/${id}`, apiKey });
        return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: normalizeEC(result.data) });
      } catch (e) {
        return sendJSON(res, 502, { error: '查询任务失败', detail: String(e.message || e) });
      }
    }
    // Kling 查询：GET /v1/video/generations/{id} + Bearer
    if (proto === 'kling') {
      const target = `${KLING_BASE_URL}/v1/video/generations/${id}`;
      try {
        const result = await forward({ method: 'GET', url: target, apiKey, bearer: true });
        return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: normalizeKling(result.data) });
      } catch (e) {
        return sendJSON(res, 502, { error: '查询任务失败', detail: String(e.message || e) });
      }
    }
    // 短剧成片（sp）查询为 GET .../short-play/tasks/{id}，响应嵌套 task.derived_data
    if (proto === 'sp') {
      try {
        const result = await forward({ method: 'GET', url: `${ecBase(region)}/short-play/tasks/${id}`, apiKey });
        return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: normalizeSP(result.data) });
      } catch (e) {
        return sendJSON(res, 502, { error: '查询任务失败', detail: String(e.message || e) });
      }
    }
    const isV3 = proto === 'v3';
    // ns=1 表示该任务由 NS 模型创建，查询需走 .com
    const base = isV3 ? v3Base(region) : url.searchParams.get('ns') === '1' ? NS_BASE_URL : siteBase(region);
    const target = isV3
      ? `${base}/contents/generations/tasks/${id}`
      : `${base}/tasks/${id}/creations`;
    try {
      const result = await forward({ method: 'GET', url: target, apiKey, bearer: isV3 });
      const data = isV3 ? normalizeV3(result.data) : result.data;
      return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data });
    } catch (e) {
      return sendJSON(res, 502, { error: '查询任务失败', detail: String(e.message || e) });
    }
  }

  // POST /api/tasks/:id/cancel  -> 取消错峰任务
  // v3（drama）没有 cancel 接口，改用 DELETE 删除任务
  if (req.method === 'POST' && parts[1] === 'tasks' && parts[2] && parts[3] === 'cancel') {
    const apiKey = resolveApiKey(req, url.searchParams.get('apiKey'));
    if (!apiKey) return sendJSON(res, 400, { error: '缺少 API Key' });
    const proto = url.searchParams.get('proto') || 'v2';
    // 解说剧/短剧成片（ec/sp）无取消接口
    if (proto === 'ec' || proto === 'sp' || proto === 'kling') return sendJSON(res, 400, { error: '该任务类型不支持取消' });
    const isV3 = proto === 'v3';
    const region = url.searchParams.get('region');
    const base = isV3 ? v3Base(region) : url.searchParams.get('ns') === '1' ? NS_BASE_URL : siteBase(region);
    const target = isV3
      ? `${base}/contents/generations/tasks/${encodeURIComponent(parts[2])}`
      : `${base}/tasks/${encodeURIComponent(parts[2])}/cancel`;
    try {
      const result = await forward({
        method: isV3 ? 'DELETE' : 'POST', url: target, apiKey, bearer: isV3,
      });
      return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: result.data });
    } catch (e) {
      return sendJSON(res, 502, { error: '取消任务失败', detail: String(e.message || e) });
    }
  }

  // ---- 主体库 Subjects（v2，Token 鉴权，/ent/v2/subjects）----
  // GET /api/subjects  -> 查询主体列表
  if (req.method === 'GET' && parts[1] === 'subjects' && !parts[2]) {
    const apiKey = resolveApiKey(req, url.searchParams.get('apiKey'));
    if (!apiKey) return sendJSON(res, 400, { error: '缺少 API Key' });
    const base = siteBase(url.searchParams.get('region'));
    const qs = new URLSearchParams();
    for (const k of ['count', 'next_page_token', 'ownership']) {
      const v = url.searchParams.get(k);
      if (v) qs.set(k, v);
    }
    const query = qs.toString();
    try {
      const result = await forward({ method: 'GET', url: `${base}/subjects${query ? '?' + query : ''}`, apiKey });
      return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: result.data });
    } catch (e) {
      return sendJSON(res, 502, { error: '查询主体失败', detail: String(e.message || e) });
    }
  }

  // POST /api/subjects  { apiKey, region, params:{ name, images } }  -> 创建主体
  if (req.method === 'POST' && parts[1] === 'subjects' && !parts[2]) {
    let payload;
    try {
      payload = JSON.parse((await readBody(req)) || '{}');
    } catch (e) {
      return sendJSON(res, 400, { error: '无效的 JSON 请求体', detail: String(e.message || e) });
    }
    const apiKey = resolveApiKey(req, payload.apiKey);
    if (!apiKey) return sendJSON(res, 400, { error: '缺少 API Key' });
    const params = payload.params;
    if (!params || typeof params !== 'object') return sendJSON(res, 400, { error: '缺少 params 参数' });
    const base = siteBase(payload.region);
    console.log(`\n[subjects] CREATE endpoint=${base}/subjects name=${params.name} images=${(params.images || []).length}`);
    try {
      const result = await forward({ method: 'POST', url: `${base}/subjects`, apiKey, body: params });
      return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: result.data });
    } catch (e) {
      return sendJSON(res, 502, { error: '创建主体失败', detail: String(e.message || e) });
    }
  }

  // DELETE /api/subjects/:id  -> 删除主体
  if (req.method === 'DELETE' && parts[1] === 'subjects' && parts[2]) {
    const apiKey = resolveApiKey(req, url.searchParams.get('apiKey'));
    if (!apiKey) return sendJSON(res, 400, { error: '缺少 API Key' });
    const base = siteBase(url.searchParams.get('region'));
    const target = `${base}/subjects/${encodeURIComponent(parts[2])}`;
    try {
      const result = await forward({ method: 'DELETE', url: target, apiKey });
      console.log(`[subjects] DELETE ${target} → HTTP ${result.status} ${JSON.stringify(result.data)}`);
      return sendJSON(res, 200, { ok: result.status >= 200 && result.status < 300, viduStatus: result.status, data: result.data });
    } catch (e) {
      console.log(`[subjects] DELETE ${target} ERROR ${String(e.message || e)}`);
      return sendJSON(res, 502, { error: '删除主体失败', detail: String(e.message || e) });
    }
  }

  // GET /api/config  -> 前端探测是否已配置服务端 key
  if (req.method === 'GET' && parts[1] === 'config') {
    return sendJSON(res, 200, { hasServerKey: Boolean(ENV_API_KEY), baseUrl: BASE_URL, modes: Object.keys(MODE_ENDPOINTS) });
  }

  return sendJSON(res, 404, { error: 'API 路径不存在' });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) throw new Error('is dir');
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (e) {
    sendJSON(res, 500, { error: '服务器内部错误', detail: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Vidu 视频生成 Web 服务已启动`);
  console.log(`  ➜  本地访问: http://localhost:${PORT}`);
  console.log(`  ➜  Vidu API: ${BASE_URL}`);
  console.log(`  ➜  服务端 API Key: ${ENV_API_KEY ? '已配置 (VIDU_API_KEY)' : '未配置 (可在页面顶部填写)'}\n`);
});
