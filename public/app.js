export function publicRoute(hash) {
  if (/^#admin(?:\/|$)/u.test(hash)) return { view: 'admin' };
  const match = /^#vaga\/([1-9]\d*)(\/candidatura)?$/u.exec(hash);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return { view: 'home' };
  return { view: match[2] ? 'apply' : 'detail', id: Number(match[1]) };
}

export function filterJobs(jobs, country, area) {
  return jobs.filter(job => (!country || job.country === country) && (!area || job.area === area));
}

export function applicationPayload(data, jobId, token) {
  const payload = Object.fromEntries(data);
  delete payload['cf-turnstile-response'];
  const history = new Map();
  for (const [name, value] of data) {
    const match = /^experience_(area|years|skills)_([0-7])$/u.exec(name);
    if (!match) continue;
    if (!history.has(match[2])) history.set(match[2], {});
    history.get(match[2])[match[1]] = value.trim();
    delete payload[name];
  }
  const experiences = [...history].sort(([a], [b]) => Number(a) - Number(b))
    .map(([, entry]) => ({ area: entry.area || '', years: entry.years || '', skills: entry.skills || '' }))
    .filter(entry => entry.area || entry.years || entry.skills);
  return {
    ...payload, experiences, job_id: jobId, consent: data.has('consent'),
    willing_to_relocate: data.has('willing_to_relocate'), turnstile_token: token,
  };
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function link(label, href, className) {
  const a = el('a', className, label);
  a.href = href;
  a.append(icon('arrow'));
  return a;
}

function metadata(job) {
  const group = el('div', 'job-meta');
  const years = Number(job.min_years_experience) || 0;
  const experience = years > 0 ? 'Experiência mínima: ' + years.toLocaleString('pt-BR') + (years === 1 ? ' ano' : ' anos') : 'Sem experiência mínima';
  for (const [name, value] of [['pin', [job.city, job.country].filter(Boolean).join(', ')], ['case', experience]]) {
    const item = el('span');
    item.append(icon(name), document.createTextNode(value));
    group.append(item);
  }
  return group;
}

function jobCard(job) {
  const article = el('article', 'job-card');
  const body = el('div');
  body.append(el('span', 'job-area', job.area), el('h3', '', job.title), metadata(job));
  const open = link('Ver vaga', '#vaga/' + job.id, 'button card-link');
  open.setAttribute('aria-label', 'Ver vaga: ' + job.title);
  article.append(body, open);
  return article;
}

function stateBox(title, description, retry, heading = 'h3') {
  const box = el('div', 'list-state');
  const glyph = el('span', 'step-icon');
  glyph.append(icon('case'));
  const body = el('div');
  body.append(el(heading, '', title), el('p', '', description));
  if (retry) {
    const btn = el('button', 'text-btn', 'Tentar novamente');
    btn.type = 'button';
    btn.addEventListener('click', retry);
    body.append(btn);
  }
  box.append(glyph, body);
  return box;
}

let turnstileScript;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => {
        if (window.turnstile) resolve(window.turnstile);
        else fail();
      };
      function fail() {
        script.remove();
        turnstileScript = undefined;
        reject(new Error('verification unavailable'));
      }
      script.onerror = fail;
      document.head.append(script);
    });
  }
  return turnstileScript;
}

function startPortal() {
  const $ = id => document.getElementById(id);
  const form = $('application-form');
  const country = $('filter-country');
  const area = $('filter-area');
  const list = $('jobs-list');
  const status = $('jobs-status');
  const detail = $('job-detail');
  const detailStatus = $('detail-status');
  const submit = $('submit-application');
  const experienceList = $('experience-entries');
  const addExperience = $('add-experience');
  let jobs = [];
  let listVersion = 0;
  let routeVersion = 0;
  let checkVersion = 0;
  let lastView;
  let activeJob;
  let verification = 'loading';
  let widgetId;
  let sitekey = '';
  let token = '';
  let sending = false;

  addExperience.addEventListener('click', () => {
    const indexes = new Set([...experienceList.querySelectorAll('[data-experience-index]')]
      .map(node => Number(node.dataset.experienceIndex)));
    const index = Array.from({ length: 8 }, (_, i) => i).find(i => !indexes.has(i));
    if (index == null) return;
    const entry = el('div', 'experience-entry');
    entry.dataset.experienceIndex = String(index);
    for (const [key, title, type, placeholder, max] of [
      ['area', 'Função ou área', 'text', 'Ex.: Abate', 100],
      ['years', 'Anos nesta função', 'number', 'Ex.: 3', 0],
      ['skills', 'Tarefas feitas na prática', 'text', 'Ex.: sangria, corte da cabeça', 5098],
    ]) {
      const wrap = el('div', key === 'skills' ? 'field full' : 'field');
      const label = el('label', '', title);
      const input = el('input');
      input.id = 'experience-' + key + '-' + index;
      input.name = 'experience_' + key + '_' + index;
      input.type = type;
      input.setAttribute('aria-describedby', 'error-experiences');
      input.placeholder = placeholder;
      if (max) input.maxLength = max;
      if (type === 'number') {
        input.min = '0'; input.max = '100'; input.step = 'any'; input.inputMode = 'decimal';
      }
      label.htmlFor = input.id;
      wrap.append(label, input);
      entry.append(wrap);
    }
    const remove = el('button', 'text-btn remove-experience', 'Remover função');
    remove.type = 'button';
    remove.addEventListener('click', () => { entry.remove(); addExperience.disabled = false; });
    entry.append(remove);
    experienceList.append(entry);
    addExperience.disabled = indexes.size + 1 >= 8;
    entry.querySelector('input').focus();
  });

  function showJobs() {
    const result = filterJobs(jobs, country.value, area.value);
    $('reset-filters').hidden = !country.value && !area.value;
    status.textContent = result.length === 1 ? '1 vaga encontrada' : result.length + ' vagas encontradas';
    if (result.length) list.replaceChildren(...result.map(jobCard));
    else if (jobs.length) list.replaceChildren(stateBox('Nenhuma vaga com esses filtros', 'Limpe os filtros para ver todas as oportunidades disponíveis.'));
    else list.replaceChildren(stateBox('Nenhuma vaga aberta no momento', 'Volte a esta página para consultar as próximas oportunidades.'));
  }

  async function loadJobs() {
    const version = ++listVersion;
    status.textContent = 'Carregando vagas…';
    list.replaceChildren();
    country.disabled = area.disabled = true;
    $('reset-filters').hidden = true;
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (version !== listVersion) return;
      if (!Array.isArray(data.jobs)) throw new Error();
      jobs = data.jobs;
      for (const [field, select, label] of [['country', country, 'Todos os países'], ['area', area, 'Todas as áreas']]) {
        const previous = select.value;
        const values = [...new Set(jobs.map(job => job[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        select.replaceChildren(new Option(label, ''), ...values.map(v => new Option(v, v)));
        if (values.includes(previous)) select.value = previous;
        select.disabled = false;
      }
      showJobs();
    } catch {
      if (version !== listVersion) return;
      status.textContent = 'Não foi possível carregar as vagas.';
      list.replaceChildren(stateBox('Tente consultar novamente', 'Verifique sua conexão e atualize a lista.', loadJobs));
    }
  }

  country.addEventListener('change', showJobs);
  area.addEventListener('change', showJobs);
  $('reset-filters').addEventListener('click', () => {
    country.value = area.value = '';
    showJobs();
    country.focus();
  });

  function removeVerification() {
    ++checkVersion;
    if (widgetId != null) window.turnstile?.remove(widgetId);
    widgetId = undefined;
    token = '';
    verification = 'loading';
    $('verification').replaceChildren();
    $('retry-verification').hidden = true;
  }

  async function setupVerification() {
    removeVerification();
    const version = checkVersion;
    const message = $('verification-status');
    message.textContent = 'Preparando a verificação de segurança…';
    function failed() {
      if (version !== checkVersion) return;
      token = '';
      verification = 'error';
      message.textContent = 'A verificação de segurança está indisponível.';
      $('retry-verification').hidden = false;
    }
    try {
      if (!sitekey) {
        verification = 'ready';
        message.textContent = '';
        return;
      }
      const widget = await loadTurnstile();
      if (version !== checkVersion) return;
      message.textContent = 'Conclua a verificação de segurança.';
      verification = 'required';
      widgetId = widget.render($('verification'), {
        sitekey, action: 'application', language: 'pt-br',
        size: window.matchMedia('(max-width: 390px)').matches ? 'compact' : 'flexible',
        callback: value => {
          if (version !== checkVersion) return;
          token = value;
          verification = 'ready';
          message.textContent = '';
          $('retry-verification').hidden = true;
        },
        'expired-callback': () => {
          if (version !== checkVersion) return;
          token = '';
          verification = 'required';
          message.textContent = 'A verificação expirou. Conclua a verificação novamente.';
          $('retry-verification').hidden = false;
        },
        'error-callback': failed,
      });
    } catch { failed(); }
  }
  $('retry-verification').addEventListener('click', setupVerification);

  function clearErrors() {
    for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
    for (const target of form.querySelectorAll('.field-error')) target.textContent = '';
    $('form-error').textContent = '';
    $('error-experiences').textContent = '';
  }

  function showErrors(errors) {
    let first;
    for (const field of form.elements) {
      if (!field.name || !Object.hasOwn(errors, field.name)) continue;
      const target = $('error-' + field.name);
      if (!target) continue;
      target.textContent = errors[field.name];
      field.setAttribute('aria-invalid', 'true');
      first ??= field;
    }
    if (errors.experiences) {
      $('error-experiences').textContent = errors.experiences;
      first ??= experienceList.querySelector('input');
    }
    $('form-error').textContent = 'Revise os campos indicados antes de enviar.';
    (first || $('form-error')).focus();
  }

  function localErrors() {
    const errors = {};
    for (const field of form.querySelectorAll('input,textarea')) {
      if (field.validity.valueMissing || (field.required && field.type !== 'checkbox' && !field.value.trim())) {
        errors[field.name] = field.name === 'consent' ? 'Confirme o consentimento para continuar.' : 'Preencha este campo.';
      } else if (!field.validity.valid) {
        if (/^experience_(?:area|years|skills)_[0-7]$/u.test(field.name)) {
          errors.experiences = 'Confira os anos de experiência em cada função (entre 0 e 100).';
        } else {
          errors[field.name] = field.type === 'email' ? 'Informe um e-mail válido.' : 'Informe um valor entre 0 e 100.';
        }
      }
    }
    if (!/^\+[1-9]\d{6,14}$/u.test(form.elements.phone.value.trim().replace(/[\s().-]/gu, ''))) {
      errors.phone = 'Informe um WhatsApp com DDI, começando com +.';
    }
    const roles = applicationPayload(new FormData(form), activeJob.id, '').experiences;
    if (roles.some(role => !role.area || role.years === '')) {
      errors.experiences = 'Informe a função e os anos em cada experiência adicionada.';
    }
    return errors;
  }

  form.addEventListener('input', event => {
    const field = event.target;
    if (field.getAttribute('aria-invalid') === 'true') {
      field.removeAttribute('aria-invalid');
      $('error-' + field.name).textContent = '';
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !activeJob) return;
    clearErrors();
    const errors = localErrors();
    if (Object.keys(errors).length) return showErrors(errors);
    const general = $('form-error');
    if (verification !== 'ready') {
      general.textContent = verification === 'loading' ? 'Aguarde a preparação da verificação de segurança.' : 'Conclua a verificação de segurança antes de enviar.';
      general.focus();
      return;
    }
    const version = routeVersion;
    const payload = applicationPayload(new FormData(form), activeJob.id, token);
    sending = submit.disabled = true;
    submit.textContent = 'Enviando candidatura…';
    try {
      const response = await fetch('/api/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (version !== routeVersion) return;
      if (response.status === 201) {
        form.reset();
        for (const extra of [...experienceList.querySelectorAll('[data-experience-index]')]) {
          if (extra.dataset.experienceIndex !== '0') extra.remove();
        }
        addExperience.disabled = false;
        removeVerification();
        $('apply-view').hidden = true;
        $('receipt').hidden = false;
        $('receipt-title').focus();
        document.title = 'Candidatura recebida — Ramon Gama';
        return;
      }
      if (response.status === 400) {
        const body = await response.json();
        if (version !== routeVersion) return;
        if (body.errors && typeof body.errors === 'object') {
          showErrors(body.errors);
          return;
        }
      }
      general.textContent = ({
        400: 'Conclua a verificação de segurança e envie novamente.',
        404: 'Esta vaga já não está disponível. Volte à lista para consultar outras oportunidades.',
        429: 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
        503: 'As candidaturas estão indisponíveis no momento. Tente novamente mais tarde.',
      })[response.status] || 'Não foi possível enviar a candidatura. Tente novamente.';
      general.focus();
    } catch {
      if (version !== routeVersion) return;
      general.textContent = 'Não foi possível confirmar o envio. Verifique a conexão e tente novamente.';
      general.focus();
    } finally {
      if (version === routeVersion) {
        sending = submit.disabled = false;
        submit.replaceChildren('Enviar candidatura ', icon('arrow'));
        if (widgetId != null && !$('apply-view').hidden) setupVerification();
      }
    }
  });

  function renderDetail(job) {
    const summary = el('div', 'job-summary');
    summary.append(el('span', 'job-area', job.area), el('h1', '', job.title), metadata(job),
      link('Quero me candidatar', '#vaga/' + job.id + '/candidatura', 'button gold'));
    const body = el('div', 'job-body');
    for (const [heading, content] of [
      ['Sobre a vaga', job.description], ['Requisitos', job.requirements],
      ['Tarefas obrigatórias', job.required_skills], ['Tarefas desejáveis', job.skills],
      ['Idiomas', job.languages], ['Qualificações', job.qualifications],
    ]) {
      if (!content?.length) continue;
      const section = el('section');
      section.append(el('h2', '', heading));
      if (Array.isArray(content)) {
        const ul = el('ul');
        ul.append(...content.map(item => el('li', '', item)));
        section.append(ul);
      } else section.append(el('p', '', content));
      body.append(section);
    }
    detail.replaceChildren(summary, body);
  }

  async function route() {
    const hash = location.hash;
    const target = publicRoute(hash);
    const previous = lastView;
    lastView = target.view;
    const version = ++routeVersion;
    const home = target.view === 'home';
    const admin = target.view === 'admin';
    $('admin-root').hidden = !admin;
    $('skip-link').href = admin ? '#admin-root' : '#candidate-root';
    for (const id of ['candidate-root', 'public-header', 'public-footer']) $(id).hidden = admin;
    $('home-view').hidden = !home;
    $('job-view').hidden = home || admin;
    detail.hidden = false;
    form.hidden = true;
    $('apply-view').hidden = $('receipt').hidden = true;
    activeJob = null;
    if (previous === 'apply') {
      removeVerification();
      form.reset();
      clearErrors();
      sending = submit.disabled = false;
      submit.replaceChildren('Enviar candidatura ', icon('arrow'));
    }
    if (admin) return;
    document.title = 'Ramon Gama — Recrutamento';
    if (home) {
      if (previous !== 'home') loadJobs();
      const anchor = ['#inicio', '#vagas', '#como-funciona', '#candidate-root'].includes(hash) && $(hash.slice(1));
      if (anchor) {
        anchor.scrollIntoView();
        if (previous && hash !== '#inicio') anchor.focus({ preventScroll: true });
      }
      return;
    }
    detail.replaceChildren();
    detailStatus.textContent = 'Carregando vaga…';
    detail.setAttribute('aria-busy', 'true');
    window.scrollTo(0, 0);
    try {
      const response = await fetch('/api/jobs/' + target.id);
      if (version !== routeVersion) return;
      if (response.status === 404) {
        detail.replaceChildren(stateBox('Vaga indisponível', 'Volte à lista para consultar as vagas abertas.', null, 'h1'));
        return;
      }
      if (!response.ok) throw new Error();
      const { job } = await response.json();
      if (version !== routeVersion) return;
      if (!job || job.id !== target.id) throw new Error();
      activeJob = job;
      if (target.view === 'detail') {
        document.title = job.title + ' — Ramon Gama';
        renderDetail(job);
      } else {
        const settings = await fetch('/api/config');
        if (!settings.ok) throw new Error();
        const config = await settings.json();
        if (version !== routeVersion) return;
        if (config.applications_open !== true || typeof config.turnstile_site_key !== 'string') {
          detail.replaceChildren(stateBox('Candidaturas indisponíveis', 'Consulte esta vaga novamente mais tarde.', null, 'h1'));
          return;
        }
        sitekey = config.turnstile_site_key;
        form.hidden = false;
        document.title = 'Candidatura · ' + job.title + ' — Ramon Gama';
        detail.hidden = true;
        $('back-detail').href = '#vaga/' + job.id;
        $('apply-job').textContent = [job.title, job.city, job.country].filter(Boolean).join(' · ');
        $('apply-view').hidden = false;
        $('apply-title').focus({ preventScroll: true });
        setupVerification();
      }
    } catch {
      if (version === routeVersion) detail.replaceChildren(stateBox('Não foi possível carregar a vaga', 'Verifique sua conexão e tente novamente.', route, 'h1'));
    } finally {
      if (version === routeVersion) {
        detailStatus.textContent = '';
        detail.removeAttribute('aria-busy');
        if (!detail.hidden) {
          const heading = detail.querySelector('h1');
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
    }
  }
  $('skip-link').addEventListener('click', event => {
    event.preventDefault();
    const target = $(lastView === 'admin' ? 'admin-root' : 'candidate-root');
    target.setAttribute('tabindex', '-1');
    target.focus();
  });
  window.addEventListener('hashchange', route);
  route();
}

if (typeof document !== 'undefined') startPortal();
