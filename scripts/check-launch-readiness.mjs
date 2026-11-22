import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function checkNotice() {
  const source = await readFile('wrangler.jsonc', 'utf8');
  // Preserve quoted strings, including URLs, while removing JSONC comments and trailing commas.
  const json = source
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n\r]*|\/\*[\s\S]*?\*\//gu, token => token.startsWith('"') ? token : ' ')
    .replace(/"(?:\\.|[^"\\])*"|,\s*(?=[\]}])/gu, token => token.startsWith('"') ? token : '');
  const config = JSON.parse(json);
  if (config.vars?.PRIVACY_READY === 'false') return;
  if (config.vars?.PRIVACY_READY !== 'true') {
    throw new Error('Em wrangler.jsonc, defina PRIVACY_READY como a string "true" ou "false".');
  }

  const path = join(config.assets.directory, 'privacidade.html');
  const notice = await readFile(path, 'utf8');
  if (!notice.trim() || /\[[^\]]*\]|\bminuta\b/iu.test(notice)) {
    throw new Error('Complete privacidade.html e remova os campos entre colchetes e a marca de minuta antes de abrir as candidaturas.');
  }
}

try {
  await checkNotice();
} catch (error) {
  console.error('Publicação bloqueada.', error.message);
  process.exitCode = 1;
}
