import { handleApi, requireHttps } from './api.js';

export async function onRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env, url);
  return requireHttps(request, url, env) ?? env.ASSETS.fetch(request);
}

export default { fetch: onRequest };
