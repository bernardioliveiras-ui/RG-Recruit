const jobStates = { draft: 'Rascunho', published: 'Publicada', archived: 'Arquivada' };
const screening = { recebido: 'Recebido', em_analise: 'Em análise', selecionado: 'Selecionado', recusado: 'Recusado' };
const criteria = { area: 'Área', skills: 'Habilidades', experience: 'Experiência', languages: 'Idiomas', location: 'Localização' };
const sections = [
  ['Visão geral', '#admin', 'globe', ['dashboard']],
  ['Vagas', '#admin/vagas', 'case', ['jobs', 'jobForm', 'matches', 'applications']],
  ['Candidatos', '#admin/candidatos', 'profile', ['candidates', 'candidate']],
  ['Equipe', '#admin/equipe', 'message', ['users']],
];

export function adminRoute(hash) {
  const simple = new Map([
    ['#admin', 'dashboard'], ['#admin/instalacao', 'setup'], ['#admin/vagas', 'jobs'],
    ['#admin/vagas/nova', 'jobForm'], ['#admin/candidatos', 'candidates'], ['#admin/equipe', 'users'],
  ]);
  if (simple.has(hash)) return { view: simple.get(hash) };
  if (!hash.startsWith('#admin/')) return null;
  const job = /^#admin\/vagas\/([1-9]\d*)\/(editar|compatibilidade|inscricoes)$/u.exec(hash);
  const profile = /^#admin\/candidatos\/([1-9]\d*)$/u.exec(hash);
  const id = Number((job || profile)?.[1]);
  if (!Number.isSafeInteger(id)) return { view: 'missing' };
  return { view: profile ? 'candidate' : { editar: 'jobForm', compatibilidade: 'matches', inscricoes: 'applications' }[job[2]], id };
}

export async function adminRequest(path, { method = 'GET', data, setupToken } = {}) {
  const headers = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (setupToken !== undefined) headers['X-Admin-Setup-Token'] = setupToken;
  const response = await fetch('/api/admin/' + path, {
    method, headers, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(result.error || 'Não foi possível concluir a solicitação.'), {
      status: response.status, fields: result.errors,
    });
  }
  return result;
}

export const deletionConfirmed = value => value === 'EXCLUIR';
export const whatsappUrl = phone => typeof phone === 'string' && /^\+[1-9]\d{6,14}$/u.test(phone)
  ? 'https://wa.me/' + phone.slice(1) : null;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = String(content);
  return node;
}
function group(className, ...children) {
  const node = el('div', className);
  node.append(...children);
  return node;
}
function link(text, href, style = 'ad-link') {
  const node = el('a', style, text);
  node.href = href;
  return node;
}
function markIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function branded() {
  const node = link('', '#inicio', 'brand');
  const logo = el('img');
  Object.assign(logo, {src: '/assets/rg-mark.png', alt: 'Emblema RG com javali', width: 52, height: 52});
  const name = el('span', '', 'Ramon Gama');
  name.append(el('small', '', 'Recrutamento'));
  node.append(logo, name);
  return node;
}
function notice(message, alert = false) {
  const node = el('p', alert ? 'ad-notice ad-error' : 'ad-notice', message);
  node.setAttribute('role', alert ? 'alert' : 'status');
  return node;
}
function empty(title, message) {
  return group('ad-empty', el('h3', '', title), el('p', '', message));
}
function section(title, ...children) {
  const node = el('section', 'ad-panel');
  node.append(el('h2', '', title), ...children);
  return node;
}
function pill(label, tone = '') {
  return el('span', 'ad-pill ' + tone, label);
}
function personName(person) {
  const name = link(person.name, '#admin/candidatos/' + person.id, 'ad-name');
  const heading = el('h3');
  heading.append(name);
  return heading;
}
function place(record) {
  return [record.city, record.country].filter(Boolean).join(', ');
}
function displayList(items) {
  return items?.length ? items.join(', ') : 'Não informado';
}
function facts(entries) {
  const list = el('dl', 'ad-facts');
  for (const [label, value] of entries) {
    list.append(group('', el('dt', '', label), el('dd', '', value || 'Não informado')));
  }
  return list;
}

export function matchCard(match) {
  const { candidate, applied, score, reasons, breakdown } = match;
  const card = el('article', 'ad-card ad-match');
  const nonApplicant = score > 0 ? pill('Compatível sem inscrição', 'ad-amber') : pill('Não inscrito');
  const meta = group('ad-meta', applied ? pill('Inscrito', 'ad-green') : nonApplicant);
  const band = match.band || (score >= 80 ? 'high' : score >= 55 ? 'review' : 'other');
  meta.append(pill({high:'Prioridade alta',review:'Revisão humana',other:'Outros perfis'}[band],
    band === 'high' ? 'ad-green' : band === 'review' ? 'ad-amber' : ''));
  if (match.missing_information) meta.append(pill('Dados a confirmar', 'ad-amber'));
  if (applied) meta.append(el('span', '', screening[match.status]));
  const details = el('details', 'ad-explanation');
  const points = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const rows = Object.entries(breakdown).map(([key, item]) => [
    criteria[key] || key, points.format(item.earned) + ' / ' + points.format(item.weight),
  ]);
  const reasonList = el('ul');
  for (const reason of reasons) reasonList.append(el('li', '', reason));
  for (const flag of match.review_flags || []) reasonList.append(el('li', 'ad-flag', flag));
  details.append(el('summary', '', 'Composição da pontuação'), facts(rows), reasonList);
  card.append(group('ad-card-head', group('', personName(candidate), el('p', 'ad-muted', place(candidate))),
    group('ad-score', el('strong', '', score + '%'), el('small', '', 'Compatibilidade'))), meta, details);
  if (match.review_flags?.length) card.append(notice('Requisitos obrigatórios pendentes de confirmação — não é uma recusa automática.'));
  return card;
}

let controlId = 0;
function field(name, label, options = {}) {
  const { type = 'text', value = '', choices, hint, full, ...props } = options;
  const id = 'ad-field-' + ++controlId;
  const wrapper = el('div', 'field' + (full ? ' full' : ''));
  const caption = el('label', '', label + (props.required ? ' *' : ''));
  caption.htmlFor = id;
  const node = el(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  if (node.tagName === 'INPUT') node.type = type;
  if (choices) {
    for (const [key, text] of Object.entries(choices)) {
      const option = el('option', '', text);
      option.value = key;
      node.append(option);
    }
  }
  Object.assign(node, props, { id, name, value });
  wrapper.append(caption, node);
  const error = el('span', 'field-error');
  error.id = id + '-error';
  const described = [error.id];
  if (hint) {
    const help = el('small', '', hint);
    help.id = id + '-hint';
    wrapper.append(help);
    described.push(help.id);
  }
  node.setAttribute('aria-describedby', described.join(' '));
  wrapper.append(error);
  return wrapper;
}

function showErrors(form, problem) {
  let first;
  for (const [name, message] of Object.entries(problem.fields || {})) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    document.getElementById(input.id + '-error').textContent = message;
    first ??= input;
  }
  return first;
}

function startAdmin() {
  const root = document.getElementById('admin-root');
  let sequence = 0;
  let nextNotice = '';
  let filters = {};
  let accountId;
  const current = () => adminRoute(location.hash);
  function go(hash, message = '') {
    nextNotice = message;
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function resetSession() {
    filters = {};
    accountId = undefined;
    nextNotice = '';
  }

  function formAction(form, label, action, success, { auth = false, endsSession = false, style = 'button dark' } = {}) {
    let pending = false;
    const submit = el('button', style, label);
    submit.type = 'submit';
    const feedback = notice('');
    form.append(group('ad-form-actions', submit), feedback);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending || submit.disabled) return;
      for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
      for (const target of form.querySelectorAll('.field-error')) target.textContent = '';
      pending = submit.disabled = true;
      feedback.setAttribute('role', 'status');
      feedback.className = 'ad-notice';
      feedback.textContent = 'Enviando…';
      const active = sequence;
      try {
        const result = await action();
        if (!endsSession && (active !== sequence || !form.isConnected)) return;
        feedback.textContent = '';
        success(result, feedback);
      } catch (problem) {
        if (active !== sequence || !form.isConnected) return;
        if (!auth && problem.status === 401) {
          resetSession();
          nextNotice = 'Sua sessão terminou. Entre novamente.';
          render();
          return;
        }
        feedback.setAttribute('role', 'alert');
        feedback.className = 'ad-notice ad-error';
        feedback.textContent = problem.status ? problem.message : 'Não foi possível confirmar a operação. Verifique a conexão e tente novamente.';
        feedback.tabIndex = -1;
        (showErrors(form, problem) || feedback).focus();
      } finally {
        pending = submit.disabled = false;
      }
    });
    return submit;
  }
  function accountFields(newAccount) {
    return [
      field('email', 'E-mail', { type: 'email', required: true, maxLength: 254, autocomplete: 'username' }),
      field('password', 'Senha', { type: 'password', required: true, minLength: newAccount ? 12 : 1, maxLength: 256,
        autocomplete: newAccount ? 'new-password' : 'current-password', hint: newAccount ? 'Use entre 12 e 256 caracteres.' : '' }),
    ];
  }
  function loginScreen(setup) {
    const panel = el('section', 'ad-auth-panel');
    const title = setup ? 'Primeiro acesso' : 'Acesso da equipe';
    const form = el('form', 'ad-form');
    form.append(...accountFields(setup));
    if (setup) form.append(field('setupToken', 'Token de instalação', { type: 'password', required: true, autocomplete: 'off' }));
    formAction(form, setup ? 'Criar primeira conta' : 'Entrar', () => {
      const { email, password, setupToken } = form.elements;
      return adminRequest(setup ? 'bootstrap' : 'login', { method: 'POST',
        data: { email: email.value, password: password.value }, setupToken: setupToken?.value });
    }, () => {
      form.reset();
      if (setup) go('#admin', 'Primeira conta criada. Entre com seu e-mail e senha.');
      else render();
    }, { auth: true });
    panel.append(el('h1', '', title), el('p', 'ad-muted', setup ? 'Use o token de instalação para criar a primeira conta da equipe.' : 'Entre para gerenciar vagas e acompanhar candidaturas.'));
    if (nextNotice) panel.append(notice(nextNotice));
    nextNotice = '';
    panel.append(form, link(setup ? 'Voltar ao login' : 'Configurar primeiro acesso', setup ? '#admin' : '#admin/instalacao'));
    root.replaceChildren(group('ad-auth', group('ad-auth-bar', branded(), link('Voltar ao portal', '#inicio', 'ad-sidebar-link')), panel));
    focusTitle(title);
  }

  function shell(admin, view) {
    const aside = el('aside', 'ad-sidebar');
    const nav = el('nav', 'ad-nav');
    nav.setAttribute('aria-label', 'Painel da equipe');
    for (const [name, hash, icon, views] of sections) {
      const item = link('', hash, 'ad-nav-link');
      item.append(markIcon(icon), el('span', '', name));
      if (views.includes(view)) item.setAttribute('aria-current', 'page');
      nav.append(item);
    }
    const logout = el('form');
    formAction(logout, 'Sair da conta', () => adminRequest('logout', { method: 'POST' }), () => {
      ++sequence;
      resetSession();
      root.replaceChildren();
      root.removeAttribute('aria-busy');
      if (current()) go('#admin', 'Sessão encerrada.');
    }, { endsSession: true, style: 'ad-sidebar-link' });
    aside.append(branded(), nav, group('ad-account', el('span', '', admin.email), logout));
    const work = el('div', 'ad-work');
    root.replaceChildren(group('ad-shell', aside, work));
    return work;
  }
  function focusTitle(title) {
    document.title = title + ' — RG Recruit';
    const heading = root.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }
  function page(title, description, action, ...body) {
    const introduction = group('', el('h1', '', title));
    if (description) introduction.append(el('p', 'ad-muted', description));
    const head = group('ad-head', introduction);
    if (action) head.append(action);
    return group('ad-page', head, ...body);
  }

  function jobCard(job) {
    const base = '#admin/vagas/' + job.id;
    const card = el('article', 'ad-card');
    const labels = group('ad-meta', pill(jobStates[job.status], job.status === 'published' ? 'ad-green' : ''), el('span', '', job.area));
    card.append(labels, el('h3', '', job.title), el('p', 'ad-muted', place(job)),
      group('ad-actions', link('Ver inscritos', base + '/inscricoes'), link('Ver compatibilidade', base + '/compatibilidade'),
        link('Editar vaga', base + '/editar')));
    return card;
  }
  async function dashboard() {
    const { counts, recent_jobs } = await adminRequest('stats');
    const metrics = group('ad-kpis');
    for (const [label, count, icon] of [['Vagas publicadas', counts.published_jobs, 'case'],
      ['Candidatos no banco', counts.candidates, 'profile'], ['Inscrições recebidas', counts.applications, 'message']]) {
      metrics.append(group('ad-kpi', group('ad-kpi-label', markIcon(icon), el('span', '', label)), el('strong', '', count)));
    }
    const recent = group('ad-list');
    if (recent_jobs.length) recent.append(...recent_jobs.map(jobCard), link('Ver todas as vagas', '#admin/vagas'));
    else recent.append(empty('Nenhuma vaga cadastrada', 'Crie a primeira vaga para começar a receber candidaturas.'));
    return page('Visão geral', 'Acompanhe as vagas e o banco de talentos da equipe.', link('Nova vaga', '#admin/vagas/nova', 'button dark'),
      metrics, section('Vagas recentes', recent));
  }
  async function jobsPage() {
    const { jobs } = await adminRequest('jobs');
    return page('Vagas', 'Consulte inscritos e encontre perfis para cada oportunidade.', link('Nova vaga', '#admin/vagas/nova', 'button dark'),
      jobs.length ? group('ad-list', ...jobs.map(jobCard)) : empty('Nenhuma vaga cadastrada', 'Crie uma vaga para divulgar uma oportunidade.'));
  }
  async function jobForm(id) {
    const job = id ? (await adminRequest('jobs')).jobs.find(item => item.id === id) : {};
    if (!job) return missing();
    const form = el('form', 'ad-form ad-panel');
    const detail = { title: ['Título da vaga', 160], area: ['Área de atuação', 100], country: ['País de destino', 100], city: ['Cidade', 100],
      description: ['Descrição', 6000], requirements: ['Requisitos', 6000] };
    const grid = group('form-grid');
    for (const [name, [label, maxLength]] of Object.entries(detail)) {
      const multiline = ['description', 'requirements'].includes(name);
      grid.append(field(name, label, { value: job[name] ?? '', type: multiline ? 'textarea' : 'text', maxLength,
        full: multiline || name === 'title', required: ['title', 'area', 'country', 'description'].includes(name) }));
    }
    for (const [name, label, hint] of [
      ['required_skills', 'Tarefas obrigatórias', 'Tarefas críticas para confirmar antes de entrevistar. Não eliminam automaticamente.'],
      ['skills', 'Tarefas desejáveis', 'Habilidades que valorizam o perfil, mas não são obrigatórias.'],
      ['languages', 'Idiomas', 'Indique os idiomas relevantes para esta função.'],
      ['qualifications', 'Cursos e qualificações', 'Ex.: HACCP, segurança alimentar.'],
    ]) {
      grid.append(field(name, label, { value: job[name]?.join(', ') ?? '', hint: hint + ' Separe com vírgulas.', maxLength: 5098 }));
    }
    grid.append(field('min_years_experience', 'Anos mínimos de experiência', {
      value: job.min_years_experience ?? 0, type: 'number', min: 0, max: 100, step: 'any',
    }), field('status', 'Estado da vaga', { choices: jobStates, value: job.status || 'draft' }));
    form.append(grid);
    const initial = new FormData(form);
    formAction(form, id ? 'Salvar alterações' : 'Criar vaga', () => {
      const values = [...new FormData(form)];
      const changes = id ? values.filter(([key, value]) => initial.get(key) !== value) : values;
      return adminRequest(id ? 'jobs/' + id : 'jobs', { method: id ? 'PATCH' : 'POST', data: Object.fromEntries(changes) });
    }, () => go('#admin/vagas', id ? 'Vaga atualizada.' : 'Vaga criada.'));
    return page(id ? 'Editar vaga' : 'Nova vaga', 'Os campos com * são obrigatórios. Vagas publicadas ficam visíveis no portal.', link('Voltar às vagas', '#admin/vagas'), form);
  }
  function statusForm(app) {
    const form = el('form', 'ad-status-form');
    form.append(field('status', 'Status da inscrição', { choices: screening, value: app.status }));
    formAction(form, 'Salvar status', () => adminRequest('applications/' + app.id, {
      method: 'PATCH', data: { status: form.elements.status.value },
    }), ({ application }, feedback) => {
      form.elements.status.value = application.status;
      feedback.textContent = 'Status salvo: ' + screening[application.status] + '.';
    });
    return form;
  }
  function applicationCard(app, byCandidate) {
    const card = el('article', 'ad-card');
    const heading = el('h3');
    heading.append(byCandidate ? link(app.job_title, '#admin/vagas/' + app.job_id + '/inscricoes', 'ad-name')
      : link(app.candidate_name, '#admin/candidatos/' + app.candidate_id, 'ad-name'));
    card.append(heading, statusForm(app), deletePanel({
      title: 'Retirar inscrição', label: 'Excluir inscrição',
      description: 'Excluir a inscrição de ' + app.candidate_name + ' na vaga ' + app.job_title + '? O perfil e as outras inscrições serão preservados.',
      path: 'applications/' + app.id, success: 'Inscrição excluída.',
    }));
    return card;
  }
  async function jobPeople(id, ranking) {
    let job, content;
    const base = '#admin/vagas/' + id;
    if (ranking) {
      const result = await adminRequest('jobs/' + id + '/matches');
      job = result.job;
      const tiers = [
        ['high', 'Mais compatíveis'], ['review', 'Revisar'], ['other', 'Outros perfis'],
      ];
      content = result.matches.length ? group('ad-ranking', ...tiers.map(([band, title]) => {
        const people = result.matches.filter(m => (m.band || (m.score >= 80 ? 'high' : m.score >= 55 ? 'review' : 'other')) === band);
        return people.length ? group('ad-match-tier', el('h3', 'ad-tier-title', `${title} (${people.length})`),
          group('ad-list', ...people.map(matchCard))) : null;
      }).filter(Boolean)) :
        empty('Banco de talentos vazio', 'Os perfis aparecerão aqui após a primeira candidatura no portal.');
    } else {
      const [{ jobs }, { applications }] = await Promise.all([adminRequest('jobs'), adminRequest('applications?job_id=' + id)]);
      job = jobs.find(item => item.id === id);
      if (!job) return missing();
      content = applications.length ? group('ad-list', ...applications.map(app => applicationCard(app, false))) :
        empty('Nenhuma inscrição nesta vaga', 'Consulte a compatibilidade para conhecer outras pessoas do banco de talentos.');
    }
    const tabs = el('nav', 'ad-tabs');
    tabs.setAttribute('aria-label', 'Candidatos da vaga');
    const subs = link('Inscritos', base + '/inscricoes');
    const matches = link('Compatibilidade', base + '/compatibilidade');
    (ranking ? matches : subs).setAttribute('aria-current', 'page');
    tabs.append(subs, matches);
    return page(job.title, [job.area, place(job)].filter(Boolean).join(' · '), link('Voltar às vagas', '#admin/vagas'),
      tabs, section(ranking ? 'Ranking de compatibilidade' : 'Inscrições na vaga',
        ...(ranking ? [el('p', 'ad-muted', 'O percentual considera os critérios definidos para a vaga. Consulte a composição de cada resultado.')] : []), content));
  }
  async function candidatesPage() {
    const filtered = Object.values(filters).some(Boolean);
    const { candidates } = filtered ? await adminRequest('candidates/search', { method: 'POST', data: filters }) :
      await adminRequest('candidates');
    const form = el('form', 'ad-panel ad-filter');
    form.method = 'post';
    form.append(field('q', 'Nome, e-mail ou telefone', { value: filters.q, maxLength: 160 }),
      field('country', 'País de residência', { value: filters.country, maxLength: 160 }),
      field('area', 'Área de experiência', { value: filters.area, maxLength: 160 }));
    const filter = el('button', 'button dark', 'Filtrar');
    filter.type = 'submit';
    const actions = group('ad-actions', filter);
    if (filtered) {
      const reset = el('button', 'ad-link', 'Limpar filtros');
      reset.type = 'button';
      reset.addEventListener('click', () => { filters = {}; render(); });
      actions.append(reset);
    }
    form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      filters = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
      render();
    });
    const results = group('ad-list');
    for (const candidate of candidates) {
      const card = el('article', 'ad-card');
      card.append(personName(candidate), el('p', 'ad-muted', place(candidate)), el('span', 'ad-skill', displayList(candidate.areas)));
      results.append(card);
    }
    if (!results.childElementCount) results.append(empty(filtered ? 'Nenhum perfil encontrado' : 'Banco de talentos vazio',
      filtered ? 'Altere os filtros para ampliar sua busca.' : 'Os perfis aparecerão aqui após as primeiras candidaturas.'));
    return page('Banco de candidatos', 'Busque por perfil, residência ou área de experiência.', null, form,
      section(candidates.length + (candidates.length === 1 ? ' perfil' : ' perfis'), results));
  }
  function deletePanel({ title, label, description, path, destination, success }) {
    const details = el('details', 'ad-danger');
    details.append(el('summary', '', title));
    const form = el('form', 'ad-form');
    form.append(el('p', '', description),
      field('confirmation', 'Digite EXCLUIR para confirmar', { required: true, autocomplete: 'off' }));
    const submit = formAction(form, label, () => {
      if (!deletionConfirmed(form.elements.confirmation.value)) throw Object.assign(new Error('Digite EXCLUIR para confirmar.'), {status:400});
      return adminRequest(path, { method: 'DELETE' });
    }, () => go(destination || location.hash, success), { style: 'button ad-delete' });
    submit.disabled = true;
    form.elements.confirmation.addEventListener('input', () => { submit.disabled = !deletionConfirmed(form.elements.confirmation.value); });
    details.append(form);
    return details;
  }
  async function candidatePage(id) {
    const { candidate: c, applications } = await adminRequest('candidates/' + id);
    const contact = section('Contato', facts([['WhatsApp', c.phone], ['E-mail', c.email], ['Residência', place(c)]]));
    const phone = whatsappUrl(c.phone);
    if (phone) {
      const whatsapp = link('Conversar no WhatsApp', phone, 'button ad-outline');
      whatsapp.target = '_blank';
      whatsapp.rel = 'noopener noreferrer';
      whatsapp.setAttribute('aria-label', 'Conversar no WhatsApp (abre em nova aba)');
      contact.append(whatsapp);
    }
    const profile = section('Experiência profissional', facts([
      ['Áreas', displayList(c.areas)], ['Experiência', Number(c.years_experience).toLocaleString('pt-BR') + ' ano(s)'],
      ['Habilidades', displayList(c.skills)], ['Idiomas', displayList(c.languages)],
      ['Qualificações', displayList(c.qualifications)],
      ['Disponibilidade para mudança', c.willing_to_relocate ? 'Sim' : 'Não'], ['Observações', c.notes],
    ]));
    const roleHistory = Array.isArray(c.experiences) ? c.experiences : [];
    const experienceByRole = section('Funções detalhadas', roleHistory.length
      ? group('ad-list', ...roleHistory.map(exp => group('ad-card',
        el('h3', '', exp.area), facts([
          ['Anos nesta função', Number(exp.years).toLocaleString('pt-BR') + ' ano(s)'],
          ['Tarefas práticas', displayList(exp.skills)],
        ]))))
      : notice('Cadastro anterior sem detalhamento por função. Confirme as tarefas e os anos durante a entrevista.'));
    const list = applications.length ? group('ad-list', ...applications.map(app => applicationCard(app, true))) :
      empty('Nenhuma inscrição', 'As vagas às quais esta pessoa se candidatar aparecerão aqui.');
    const deletion = deletePanel({ title: 'Excluir cadastro', label: 'Excluir perfil e inscrições',
      description: 'A exclusão remove permanentemente este perfil e todas as suas inscrições.',
      path: 'candidates/' + c.id, destination: '#admin/candidatos', success: 'Perfil e inscrições excluídos.' });
    deletion.className += ' ad-panel';
    return page(c.name, 'Perfil do candidato', link('Voltar ao banco', '#admin/candidatos'), contact, profile,
      experienceByRole, section('Inscrições', list), deletion);
  }
  async function teamPage() {
    const { users } = await adminRequest('users');
    const list = el('ul', 'ad-members');
    for (const user of users) {
      const member = el('li', '', user.email);
      if (user.id !== accountId) {
        member.append(deletePanel({ title: 'Remover acesso da equipe', label: 'Remover acesso',
          description: 'A conta ' + user.email + ' será excluída e suas sessões serão encerradas.',
          path: 'users/' + user.id, success: 'Acesso removido.' }));
      }
      list.append(member);
    }
    const form = el('form', 'ad-form');
    form.append(group('form-grid', ...accountFields(true)));
    formAction(form, 'Criar conta', () => adminRequest('users', {method: 'POST', data: Object.fromEntries(new FormData(form))}),
      () => { form.reset(); go('#admin/equipe', 'Conta administrativa criada.'); });
    return page('Equipe', 'Gerencie as contas com acesso administrativo.', null, section('Administradores', list), section('Adicionar administrador', form));
  }
  function missing() {
    return page('Registro indisponível', 'Confira o endereço ou volte ao painel.', link('Voltar ao painel', '#admin'));
  }
  async function viewFor({ view, id }) {
    switch (view) {
      case 'dashboard': case 'setup': return dashboard();
      case 'jobs': return jobsPage();
      case 'jobForm': return jobForm(id);
      case 'matches': return jobPeople(id, true);
      case 'applications': return jobPeople(id, false);
      case 'candidates': return candidatesPage();
      case 'candidate': return candidatePage(id);
      case 'users': return teamPage();
      default: return missing();
    }
  }
  async function render() {
    const active = ++sequence;
    const route = current();
    root.replaceChildren();
    root.removeAttribute('aria-busy');
    if (!route) { resetSession(); return; }
    root.setAttribute('aria-busy', 'true');
    root.append(notice('Carregando painel…'));
    let work = root;
    try {
      const { admin } = await adminRequest('me');
      if (sequence !== active) return;
      if (accountId !== admin.id) filters = {};
      accountId = admin.id;
      work = shell(admin, route.view === 'setup' ? 'dashboard' : route.view);
      work.append(notice('Carregando conteúdo…'));
      const content = await viewFor(route);
      if (sequence !== active) return;
      work.replaceChildren();
      if (nextNotice) work.append(notice(nextNotice));
      nextNotice = '';
      work.append(content);
      focusTitle(route.view === 'candidate' ? 'Perfil de candidato' : content.querySelector('h1').textContent);
    } catch (err) {
      if (sequence !== active) return;
      if (err.status === 401) {
        filters = {};
        accountId = undefined;
        loginScreen(route.view === 'setup');
      } else if (err.status === 404) {
        work.replaceChildren(missing());
        focusTitle('Registro indisponível');
      } else {
        const retry = el('button', 'button dark', 'Tentar novamente');
        retry.type = 'button';
        retry.addEventListener('click', render);
        work.replaceChildren(page('Painel indisponível', 'Não foi possível carregar os dados. Verifique sua conexão e tente novamente.', retry));
        focusTitle('Painel indisponível');
      }
    } finally {
      if (active === sequence) root.removeAttribute('aria-busy');
    }
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('pageshow', event => { if (event.persisted) render(); });
  render();
}

if (typeof document !== 'undefined') startAdmin();
