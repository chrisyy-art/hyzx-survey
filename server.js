// 数科行研中心 2026 年度用户体验问卷 —— 零依赖 Node.js 服务（Node 18+）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'responses.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_HOURS = 12;
const MAX_ANSWER = 3000;
const KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'];
const QUESTIONS = [
  '请描述您最近一次使用行研中心的具体情景：当时在处理什么工作？查找了哪些内容？最终用在了哪里？',
  '过去一年里，有没有哪次在行研中心没找到需要的内容？当时您想找什么，最后是通过什么渠道解决的？',
  '明年您最希望行研中心新增哪些行业、主题或内容类型（如专家纪要、AI日报等）？请说明原因。',
  '对于现有报告的呈现方式（篇幅复杂度、信息深度等），您希望做哪些调整？',
  '您希望行研中心通过哪些方式触达您（如邮件周报、群内快讯、线下分享、研究员答疑），频率如何？还有哪些运营活动会让您更愿意使用或推荐给同事？',
];

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('请通过环境变量 ADMIN_PASSWORD 设置管理员密码（至少 8 位）。');
  process.exit(1);
}

// ---------- 存储 ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let responses = [];
try { responses = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
let writing = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(responses, null, 1);
  writing = writing.then(async () => {
    const tmp = DATA_FILE + '.tmp';
    await fs.promises.writeFile(tmp, snapshot);
    await fs.promises.rename(tmp, DATA_FILE);
  }).catch(err => console.error('保存失败', err));
  return writing;
}

// ---------- 会话与限流 ----------
const sessions = new Map(); // token -> expiresAt
const hits = new Map();     // key -> [timestamps]
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of sessions) if (exp < now) sessions.delete(k);
  for (const [k, arr] of hits) if (!arr.some(t => now - t < 3600e3)) hits.delete(k);
}, 600e3).unref();

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function isAdmin(req) {
  const t = parseCookies(req).sid;
  const exp = t && sessions.get(t);
  return !!exp && exp > Date.now();
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function clientIp(req) {
  const remote = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  // 只有来自本机或内网反向代理的请求才信任 X-Forwarded-For，避免被伪造绕过限流
  const fromProxy = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$)/.test(remote);
  const fwd = fromProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || remote;
}

// ---------- 工具 ----------
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}
const clean = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
function fmtTime(ts) {
  const d = new Date(ts + 8 * 3600e3); // 北京时间
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // 防止表格公式注入
  return '"' + s.replace(/"/g, '""') + '"';
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
function serveStatic(req, res, file) {
  const fp = path.join(PUBLIC_DIR, file);
  if (!fp.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, '未找到');
  fs.readFile(fp, (err, buf) => {
    if (err) return send(res, 404, '未找到');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
      'Cache-Control': path.extname(fp) === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(buf);
  });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // 前台
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveStatic(req, res, 'index.html');
    if (req.method === 'GET' && (p === '/admin' || p === '/admin/')) return serveStatic(req, res, 'admin.html');
    if (req.method === 'GET' && /^\/assets\/[\w.-]+$/.test(p)) return serveStatic(req, res, p.slice(1));
    if (req.method === 'GET' && p === '/healthz') return send(res, 200, { ok: true });

    if (req.method === 'POST' && p === '/api/responses') {
      if (rateLimited('submit:' + clientIp(req), 10, 3600e3)) return send(res, 429, { error: '提交过于频繁，请稍后再试。' });
      const body = await readJson(req);
      const answers = Object.fromEntries(KEYS.map(k => [k, clean(body[k], MAX_ANSWER)]));
      if (!KEYS.some(k => answers[k])) return send(res, 400, { error: '请至少回答一道题后再提交。' });
      const editToken = typeof body.editToken === 'string' && /^[a-f0-9]{32}$/.test(body.editToken) ? body.editToken : null;
      const now = Date.now();
      const meta = { name: clean(body.name, 40), dept: clean(body.dept, 60) };
      let rec = editToken && responses.find(r => r.editToken === editToken);
      if (rec) {
        Object.assign(rec, meta, answers, { updatedAt: now });
      } else {
        rec = { id: crypto.randomBytes(6).toString('hex'), editToken: crypto.randomBytes(16).toString('hex'), ...meta, ...answers, submittedAt: now, updatedAt: now };
        responses.push(rec);
      }
      await persist();
      return send(res, 200, { ok: true, editToken: rec.editToken, submittedAt: rec.submittedAt, updated: rec.submittedAt !== rec.updatedAt });
    }

    if (req.method === 'GET' && p === '/api/responses/mine') {
      const t = url.searchParams.get('token');
      const rec = t && responses.find(r => r.editToken === t);
      if (!rec) return send(res, 404, { error: 'not_found' });
      const { editToken, id, ...rest } = rec;
      return send(res, 200, rest);
    }

    // 后台
    if (req.method === 'POST' && p === '/api/admin/login') {
      if (rateLimited('login:' + clientIp(req), 8, 900e3)) return send(res, 429, { error: '尝试次数过多，请 15 分钟后再试。' });
      const body = await readJson(req, 4096);
      if (!safeEqual(body.password || '', ADMIN_PASSWORD)) return send(res, 401, { error: '密码不正确。' });
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, Date.now() + SESSION_HOURS * 3600e3);
      const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
      return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}` });
    }
    if (req.method === 'POST' && p === '/api/admin/logout') {
      sessions.delete(parseCookies(req).sid);
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: '请先登录。' });
      if (req.method === 'GET' && p === '/api/admin/responses') {
        const list = responses.map(({ editToken, ...r }) => r).sort((a, b) => b.updatedAt - a.updatedAt);
        return send(res, 200, { questions: QUESTIONS, responses: list });
      }
      if (req.method === 'GET' && p === '/api/admin/export.csv') {
        const head = ['编号', '姓名', '部门', '提交时间', '最近更新', ...QUESTIONS.map((q, i) => `Q${i + 1} ${q}`)];
        const rows = [head, ...responses.slice().sort((a, b) => a.submittedAt - b.submittedAt)
          .map(r => [r.id, r.name, r.dept, fmtTime(r.submittedAt), fmtTime(r.updatedAt), ...KEYS.map(k => r[k])])];
        const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
        return send(res, 200, csv, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="survey-responses.csv"; filename*=UTF-8''${encodeURIComponent('行研中心2026用户体验问卷回复.csv')}`,
        });
      }
      const m = p.match(/^\/api\/admin\/responses\/([a-f0-9]{12})$/);
      if (req.method === 'DELETE' && m) {
        const i = responses.findIndex(r => r.id === m[1]);
        if (i < 0) return send(res, 404, { error: '该回复不存在。' });
        responses.splice(i, 1); await persist();
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: '未找到' });
  } catch (err) {
    if (err.message === 'too_large') return send(res, 413, { error: '内容过长。' });
    if (err.message === 'bad_json') return send(res, 400, { error: '请求格式错误。' });
    console.error(err);
    return send(res, 500, { error: '服务器出错，请稍后再试。' });
  }
});

server.listen(PORT, HOST, () => console.log(`问卷服务已启动：http://${HOST}:${PORT}  后台：/admin  数据：${DATA_FILE}`));
