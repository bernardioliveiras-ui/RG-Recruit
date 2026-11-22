import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const asset = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');
const fields = ['name', 'phone', 'email', 'country', 'city', 'areas', 'years_experience', 'skills', 'languages', 'qualifications', 'willing_to_relocate', 'notes', 'consent'];

test('public shell provides real navigation, labeled filters, branded artwork and accessible states', async () => {
  const html = await asset('index.html');
  assert.match(html, /<html lang="pt-BR">/);
  for (const id of ['vagas', 'como-funciona', 'candidate-root', 'admin-root', 'jobs-status', 'job-detail', 'application-form', 'receipt']) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  for (const id of ['filter-country', 'filter-area']) assert.ok(html.includes('for="' + id + '"'));
  assert.match(html, /href="#vagas"/);
  assert.match(html, /href="https:\/\/wa\.me\/34614856858">Espanha/);
  assert.match(html, /href="https:\/\/wa\.me\/61485685858">Austrália/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /src="\/assets\/rg-mark.png"[^>]*alt="[^"]+"/);
  const logo = await readFile(new URL('../public/assets/rg-mark.png', import.meta.url));
  assert.equal(logo.toString('hex', 0, 8), '89504e470d0a1a0a');
});

test('every applicant field has an associated label and inline error target', async () => {
  const html = await asset('index.html');
  for (const field of fields) {
    for (const part of ['name="' + field + '"', 'id="field-' + field + '"', 'for="field-' + field + '"', 'id="error-' + field + '"']) {
      assert.ok(html.includes(part), part);
    }
    assert.match(html, new RegExp('aria-describedby="[^"]*error-' + field + '(?: |")'));
  }
  assert.match(html, /type="checkbox"[^>]*name="consent"[^>]*required/);
  assert.ok(html.includes('href="/privacidade.html"'));
  const notice = await asset('privacidade.html');
  for (const term of ['controlador', 'retenção', 'exclusão']) assert.ok(notice.toLowerCase().includes(term));
});

test('routes support links to an individual job, application and admin without public profile URLs', async () => {
  const { publicRoute } = await import('../public/app.js');
  assert.deepEqual(publicRoute('#vaga/17'), { view: 'detail', id: 17 });
  assert.deepEqual(publicRoute('#vaga/17/candidatura'), { view: 'apply', id: 17 });
  assert.equal(publicRoute('#admin/candidatos').view, 'admin');
  assert.equal(publicRoute('#vagas').view, 'home');
  assert.equal(publicRoute('#vaga/1e3').view, 'home');
});

test('filters intersect and payload keeps opt-ins explicit without returning stored profiles', async () => {
  const { filterJobs, applicationPayload } = await import('../public/app.js');
  const jobs = [{ country: 'A', area: 'X' }, { country: 'A', area: 'Y' }, { country: 'B', area: 'X' }];
  assert.deepEqual(filterJobs(jobs, 'A', 'X'), [jobs[0]]);
  assert.deepEqual(filterJobs(jobs, '', 'X'), [jobs[0], jobs[2]]);
  const form = new FormData();
  form.set('name', 'Nome');
  form.set('consent', 'on');
  form.set('years_experience', '0');
  const payload = applicationPayload(form, 2, 'token');
  assert.equal(payload.job_id, 2);
  assert.equal(payload.consent, true);
  assert.equal(payload.willing_to_relocate, false);
  assert.equal(payload.turnstile_token, 'token');
  assert.equal(payload.years_experience, '0');
});

test('application payload converts repeatable experience fields into role-specific records', async () => {
  const {applicationPayload} = await import('../public/app.js');
  const form = new FormData();
  form.set('experience_area_0','Desossa');
  form.set('experience_years_0','4');
  form.set('experience_skills_0','Culatra, serra do peito');
  form.set('experience_area_1','Abate');
  form.set('experience_years_1','2');
  form.set('experience_skills_1','Sangria');
  const payload = applicationPayload(form,3,'token');
  assert.deepEqual(payload.experiences,[
    {area:'Desossa',years:'4',skills:'Culatra, serra do peito'},
    {area:'Abate',years:'2',skills:'Sangria'},
  ]);
  assert.equal(payload.experience_area_0,undefined);
  assert.equal(payload.experience_skills_1,undefined);
});

test('editable field outlines meet 3:1 contrast on the white applicant form', async () => {
  const css = await asset('app.css');
  const rule = css.match(/\.field textarea\s*\{([^}]+)\}/u)[1];
  const color = rule.match(/border:\s*1px solid #([\da-f]{6})/iu)[1];
  const linear = color.match(/../gu).map(hex => {
    const value = parseInt(hex, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const lum = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  const contrast = 1.05 / (lum + .05);
  assert.ok(contrast >= 3, 'Control border contrast is ' + contrast.toFixed(2) + ':1');
});

test('announces detail loading and focuses the final heading for success, missing job and fetch failure', async () => {
  const { runInNewContext } = await import('node:vm');
  const code = (await asset('app.js')).replace(/^import .*$/gmu, '').replace(/^export /gmu, '');
  const html = await asset('index.html');
  for (const [response, title] of [
    [Response.json({ job: { id: 1, title: 'Título de teste', country: 'Brasil', area: 'Teste',
      required_skills:['Culatra'],skills:['Serra do peito'] } }), 'Título de teste'],
    [new Response('', { status: 404 }), 'Vaga indisponível'],
    [null, 'Não foi possível carregar a vaga'],
  ]) {
    let focused;
    const elements = new Map();
    class Node {
      constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; }
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      setAttribute(key, value) { this.attributes[key] = String(value); }
      removeAttribute(key) { delete this.attributes[key]; }
      addEventListener() {}
      focus() { focused = this; }
      querySelector(selector) {
        for (const child of this.children) {
          if (selector.split(',').some(s => s.trim() === child.tag)) return child;
          const nested = child.querySelector?.(selector);
          if (nested) return nested;
        }
        return null;
      }
    }
    const document = {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Node('div'));
        return elements.get(id);
      },
      createElement: tag => new Node(tag),
      createElementNS: (_, tag) => new Node(tag),
      createTextNode: text => text,
    };
    const request = Promise.withResolvers();
    runInNewContext(code, { document, loadPartners:()=>{}, location: { hash: '#vaga/1' },
      window: { addEventListener() {}, scrollTo() {} }, fetch: () => request.promise });
    const status = document.getElementById('detail-status');
    assert.equal(status.textContent, 'Carregando vaga…');
    assert.match(html, /id="detail-status"[^>]*role="status"/u);
    if (response) request.resolve(response);
    else request.reject(new Error('offline'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(status.textContent, '');
    assert.equal(focused?.tag, 'h1');
    assert.equal(focused.textContent, title);
    assert.equal(focused.tabIndex, -1);
    assert.equal(document.getElementById('job-detail').attributes['aria-busy'], undefined);
    if (title === 'Título de teste') {
      const visit = node => [node.textContent, ...(node.children || []).flatMap(child =>
        typeof child === 'string' ? [child] : visit(child))];
      const contents = visit(document.getElementById('job-detail'));
      assert.ok(contents.includes('Tarefas obrigatórias'));
      assert.ok(contents.includes('Culatra'));
    }
  }
});
