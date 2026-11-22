import * as repo from './repository.js';
import {
  digest, dummyRecord, hashPassword, logoutCookie, matchesSetupToken,
  readSession, sessionFingerprint, sessionLifetimeSeconds, signSession, verifyPassword,
} from './auth.js';
import { scoreCandidate } from './matching.js';
import { validateApplicant, validateJob } from './validation.js';

const maxBodyBytes = 128 * 1024;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const turnstileEndpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const challengeErrors = new Set(['missing-input-response', 'invalid-input-response', 'timeout-or-duplicate']);

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      ...headers,
    },
  });
}

function receipt() {
  return json({ message: 'Candidatura recebida.' }, 201);
}

function jobNotFound() {
  return json({ error: 'Vaga não encontrada.' }, 404);
}

function verificationUnavailable() {
  return json({ error: 'Candidaturas indisponíveis no momento. Tente novamente mais tarde.' }, 503);
}

function isLocalDevelopment(url, env) {
  return env.APP_ENV === 'development' && loopbackHosts.has(url.hostname);
}

export function requireHttps(request, url, env) {
  if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocalDevelopment(url, env))) return null;
  if (request.method === 'GET' || request.method === 'HEAD') {
    const target = new URL(url);
    target.protocol = 'https:';
    if (target.pathname.startsWith('/api/admin/')) target.searchParams.delete('q');
    return new Response(null, { status: 308, headers: {
      Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    } });
  }
  return json({ error: 'Acesse o portal por HTTPS.' }, 403);
}

export async function readJson(request) {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { error: json({ error: 'Envie os dados no formato JSON.' }, 415) };
  }
  const tooLarge = () => ({ error: json({ error: 'Os dados enviados são muito grandes.' }, 413) });
  if (Number(request.headers.get('content-length')) > maxBodyBytes) return tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return { error: json({ error: 'Envie um JSON válido.' }, 400) };

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0;
    let body = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return tooLarge();
      }
      body += decoder.decode(value, { stream: true });
    }
    return { data: JSON.parse(body + decoder.decode()) };
  } catch {
    return { error: json({ error: 'Envie um JSON válido.' }, 400) };
  } finally {
    reader.releaseLock();
  }
}

async function verifyTurnstile(token, env) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const response = await fetch(turnstileEndpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
  });
  if (!response.ok) throw new Error('Turnstile service unavailable');
  const result = await response.json();
  const codes = result?.['error-codes'] ?? [];
  if (typeof result?.success !== 'boolean' || !Array.isArray(codes) ||
      (result.success && codes.length > 0) || codes.some(code => !challengeErrors.has(code))) {
    throw new Error('Turnstile service unavailable');
  }
  return result.success === true && result.hostname === env.TURNSTILE_HOSTNAME &&
    result.action === 'application';
}

function applicationsOpen(url, env) {
  const localDevelopment = isLocalDevelopment(url, env);
  if (!localDevelopment && (env.PRIVACY_READY !== 'true' || !env.APPLICATION_RATE_LIMITER)) return false;
  if (!env.TURNSTILE_SECRET_KEY) return localDevelopment;
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_HOSTNAME === url.hostname);
}

async function submitApplication(request, url, env) {
  if (!applicationsOpen(url, env)) return verificationUnavailable();

  if (env.APPLICATION_RATE_LIMITER) {
    const result = await env.APPLICATION_RATE_LIMITER.limit({
      key: `${url.pathname}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`,
    });
    if (!result.success) {
      return json({ error: 'Muitas tentativas. Tente novamente em um minuto.' }, 429, { 'Retry-After': '60' });
    }
  }

  const { data, error } = await readJson(request);
  if (error) return error;
  if (data?.website) return receipt();

  const profile = validateApplicant(data);
  if (!profile.ok) return json({ error: 'Revise os dados da candidatura.', errors: profile.errors }, 400);

  if (env.TURNSTILE_SECRET_KEY) {
    try {
      if (!await verifyTurnstile(data.turnstile_token, env)) {
        return json({ error: 'Conclua a verificação de segurança e tente novamente.' }, 400);
      }
    } catch {
      return verificationUnavailable();
    }
  }

  const applied = await repo.upsertCandidateAndApply(env.DB, profile.value, profile.value.job_id);
  return applied ? receipt() : jobNotFound();
}

export async function handleApi(request, env, url = new URL(request.url)) {
  const insecure = requireHttps(request, url, env);
  if (insecure) return insecure;
  const { pathname } = url;
  if (pathname.startsWith('/api/admin/')) {
    try {
      return await handleAdmin(request, env, url);
    } catch {
      return json({ error: 'Não foi possível concluir a solicitação.' }, 500);
    }
  }
  const detail = /^\/api\/jobs\/([1-9]\d*)$/u.exec(pathname);
  const allowedMethod = pathname === '/api/applications' ? 'POST' : 'GET';
  if (pathname !== '/api/config' && pathname !== '/api/jobs' &&
      pathname !== '/api/applications' && !detail) {
    return json({ error: 'Rota não encontrada.' }, 404);
  }
  if (request.method !== allowedMethod) {
    return json({ error: 'Método não permitido.' }, 405, { Allow: allowedMethod });
  }

  try {
    if (pathname === '/api/config') {
      return json({
        turnstile_site_key: env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY || '' : '',
        applications_open: applicationsOpen(url, env),
      });
    }
    if (pathname === '/api/jobs') {
      const country = url.searchParams.get('country')?.trim() || '';
      const area = url.searchParams.get('area')?.trim() || '';
      if (country.length > 100 || area.length > 100) {
        return json({ error: 'Use até 100 caracteres em cada filtro.' }, 400);
      }
      return json({ jobs: await repo.listPublishedJobs(env.DB, { country, area }) });
    }
    if (detail) {
      const id = Number(detail[1]);
      const job = Number.isSafeInteger(id) ? await repo.findPublishedJob(env.DB, id) : null;
      return job ? json({ job }) : jobNotFound();
    }
    return await submitApplication(request, url, env);
  } catch {
    return json({ error: 'Não foi possível concluir a solicitação.' }, 500);
  }
}

const sessionUnavailable = () => json({ error: 'Acesso administrativo indisponível.' }, 503);
const unauthorized = () => json({ error: 'Entre para continuar.' }, 401);
const notFound = () => json({ error: 'Registro não encontrado.' }, 404);
const invalid = () => json({ error: 'Revise os dados enviados.' }, 400);
const loginWindow = 15 * 60;
const validStatuses = new Set(['recebido', 'em_analise', 'selecionado', 'recusado']);

function normalizeEmail(input) {
  if (typeof input !== 'string' || input.length > 254) return '';
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : '';
}

async function addAccount(db, data, firstOnly) {
  const email = normalizeEmail(data.email);
  if (!email || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 256) {
    return json({ error: 'Informe um e-mail válido e uma senha de 12 a 256 caracteres.' }, 400);
  }
  const admin = await repo.createAdmin(db, email, await hashPassword(data.password), firstOnly);
  if (!admin) return json({ error: firstOnly ? 'Instalação já concluída.' : 'E-mail já cadastrado.' }, 409);
  return json({ admin }, 201);
}

async function login(request, env, data) {
  const now = Math.floor(Date.now() / 1000);
  const email = normalizeEmail(data.email);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const invalidLogin = () => json({ error: 'E-mail ou senha inválidos.' }, 401);
  // Reserve before password derivation, even when other logins are in flight.
  const reservations = [];
  for (const [prefix, value, limit] of [['ip:', ip, 50], ['email:', email, 5]]) {
    const key = prefix + await digest(value);
    const count = await repo.reserveLogin(env.DB, key, now, loginWindow, limit);
    if (count.attempts > limit) {
      const remaining = Math.max(1, count.window_start + loginWindow - now);
      return json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, { 'Retry-After': String(remaining) });
    }
    reservations.push([key, count.window_start]);
  }
  if (Math.random() < 0.02) await repo.pruneLoginAttempts(env.DB, now - loginWindow);
  if (!email || typeof data.password !== 'string' || !data.password || data.password.length > 256) return invalidLogin();
  const account = await repo.getLogin(env.DB, email);
  const valid = await verifyPassword(data.password, account?.password_hash ?? dummyRecord);
  if (!account || !valid) return invalidLogin();
  for (const [key, start] of reservations) await repo.releaseLoginAttempt(env.DB, key, start);
  const { password_hash, ...admin } = account;
  const issuedAt = Date.now();
  const cookie = await signSession(admin.id, env.SESSION_SECRET, issuedAt);
  const start = Math.floor(issuedAt / 1000);
  await repo.saveSession(env.DB, await sessionFingerprint(cookie), admin.id, start + sessionLifetimeSeconds, start);
  return json({ admin }, 200, { 'Set-Cookie': cookie });
}

function candidateFilters(url, body) {
  if (url.searchParams.has('q')) return null;
  const filters = {};
  for (const key of ['q', 'area', 'country']) {
    const value = body ? body[key] : url.searchParams.get(key);
    if (value != null && (typeof value !== 'string' || value.length > 160)) return null;
    filters[key] = value?.trim() ?? '';
  }
  return filters;
}

async function jobsRoute(db, method, id, matches, url, data) {
  if (!id && method === 'GET') return json({ jobs: await repo.listJobs(db) });
  const existing = id ? await repo.getJob(db, id) : null;
  if (id && !existing) return jobNotFound();
  if (matches) {
    const filters = candidateFilters(url);
    if (!filters) return invalid();
    const rows = await repo.listCandidates(db, filters, id);
    const ranking = rows.map(({ application_id, status, ...candidate }) => ({
      candidate, application_id, status, applied: application_id !== null, ...scoreCandidate(existing, candidate),
    }));
    ranking.sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id);
    return json({ job: existing, matches: ranking });
  }
  const result = validateJob(id ? { ...existing, ...data } : data);
  if (!result.ok) return json({ error: 'Revise os dados da vaga.', errors: result.errors }, 400);
  const job = id ? await repo.patchJob(db, id, result.value, data) : await repo.createJob(db, result.value);
  return job ? json({ job }, id ? 200 : 201) : jobNotFound();
}

async function candidatesRoute(db, method, id, url, data) {
  if (!id) {
    const filters = candidateFilters(url, data);
    return filters ? json({ candidates: await repo.listCandidates(db, filters) }) : invalid();
  }
  if (method === 'DELETE') return await repo.deleteCandidate(db, id) ? json({ deleted: true }) : notFound();
  const candidate = await repo.getCandidate(db, id);
  if (!candidate) return notFound();
  return json({ candidate, applications: await repo.listApplications(db, { candidateId: id }) });
}

async function applicationsRoute(db, method, id, url, data) {
  if (!id) {
    const jobId = url.searchParams.get('job_id');
    if (jobId !== null && (!/^[1-9]\d*$/u.test(jobId) || !Number.isSafeInteger(Number(jobId)))) return invalid();
    return json({ applications: await repo.listApplications(db, { jobId: Number(jobId) }) });
  }
  if (method === 'DELETE') return await repo.deleteApplication(db, id) ? json({ deleted: true }) : notFound();
  if (!validStatuses.has(data.status)) return invalid();
  const application = await repo.updateApplication(db, id, data.status);
  return application ? json({ application }) : notFound();
}

const adminMethods = new Map([
  ['bootstrap', ['POST']], ['login', ['POST']], ['logout', ['POST']], ['me', ['GET']],
  ['stats', ['GET']], ['users', ['GET', 'POST']], ['users/:id', ['DELETE']],
  ['jobs', ['GET', 'POST']], ['jobs/:id', ['PATCH']], ['jobs/:id/matches', ['GET']],
  ['candidates', ['GET']], ['candidates/search', ['POST']], ['candidates/:id', ['GET', 'DELETE']],
  ['applications', ['GET']], ['applications/:id', ['PATCH', 'DELETE']],
]);

async function handleAdmin(request, env, url) {
  const path = url.pathname.slice('/api/admin/'.length);
  const route = /^([a-z]+)(?:\/([1-9]\d*))?(\/matches|\/search)?$/u.exec(path);
  if (!route) return notFound();
  const [, resource, rawId, suffix = ''] = route;
  const id = rawId ? Number(rawId) : null;
  const allowed = adminMethods.get(resource + (rawId ? '/:id' : '') + suffix);
  if (!allowed || (id !== null && !Number.isSafeInteger(id))) return notFound();
  const method = request.method;
  if (!allowed.includes(method)) return json({ error: 'Método não permitido.' }, 405, { Allow: allowed.join(', ') });
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return sessionUnavailable();
  const db = env.DB;
  let admin;
  let tokenHash;
  if (resource !== 'bootstrap' && resource !== 'login') {
    const adminId = await readSession(request, env.SESSION_SECRET);
    if (!adminId) return unauthorized();
    tokenHash = await sessionFingerprint(request.headers.get('Cookie'));
    admin = await repo.getSessionAdmin(db, tokenHash, adminId, Math.floor(Date.now() / 1000));
    if (!admin) return unauthorized();
  }
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return json({ error: 'Origem não autorizada.' }, 403);
  }
  if (resource === 'bootstrap') {
    if (!env.ADMIN_SETUP_TOKEN) return sessionUnavailable();
    if (!await matchesSetupToken(request.headers.get('X-Admin-Setup-Token'), env.ADMIN_SETUP_TOKEN)) {
      return json({ error: 'Instalação não autorizada.' }, 403);
    }
  }
  let data;
  if ((method === 'POST' || method === 'PATCH') && resource !== 'logout') {
    const body = await readJson(request);
    if (body.error) return body.error;
    data = body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid();
  }
  switch (resource) {
    case 'bootstrap': return addAccount(db, data, true);
    case 'login': return login(request, env, data);
    case 'me': return json({ admin });
    case 'logout':
      await repo.revokeSession(db, tokenHash);
      return json({ message: 'Sessão encerrada.' }, 200, { 'Set-Cookie': logoutCookie });
    case 'stats': return json(await repo.dashboardStats(db));
    case 'users':
      if (method === 'POST') return addAccount(db, data, false);
      if (method === 'GET') return json({ users: await repo.listAdmins(db) });
      if (id === admin.id) return json({ error: 'Sua própria conta deve permanecer ativa.' }, 409);
      return await repo.removeAdmin(db, id, admin.id) ? json({ deleted: true }) : notFound();
    case 'jobs': return jobsRoute(db, method, id, suffix === '/matches', url, data);
    case 'candidates': return candidatesRoute(db, method, id, url, data);
    case 'applications': return applicationsRoute(db, method, id, url, data);
  }
}
