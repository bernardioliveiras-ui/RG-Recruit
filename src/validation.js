const jobStatuses = new Set(['draft', 'published', 'archived']);

export function normalizePhone(value) {
  if (typeof value !== 'string' || !/^\+[\d\s().-]+$/u.test(value.trim())) return '';
  const phone = value.trim().replace(/[\s().-]/gu, '');
  return /^\+[1-9]\d{6,14}$/u.test(phone) ? phone : '';
}

function readText(input, errors, field, limit, required = false) {
  const raw = input[field];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if ((raw != null && typeof raw !== 'string') || (required && !value)) {
    errors[field] = required ? 'Preencha este campo.' : 'Informe um texto válido.';
  } else if (value.length > limit) {
    errors[field] = `Use até ${limit} caracteres.`;
  }
  return value;
}

function readList(input, errors, field) {
  const raw = input[field];
  if (raw == null) return [];
  const items = typeof raw === 'string' ? raw.split(/[,\n]/u) : raw;
  if (!Array.isArray(items) || items.length > 50 || items.some(item =>
    typeof item !== 'string' || item.trim().length > 100)) {
    errors[field] = 'Informe até 50 itens com até 100 caracteres cada.';
    return [];
  }
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}

function readYears(input, errors, field, required = false) {
  const raw = input[field];
  if (!required && (raw == null || (typeof raw === 'string' && !raw.trim()))) return 0;
  const years = typeof raw === 'string' && /^\d+(?:[.,]\d+)?$/u.test(raw.trim())
    ? Number(raw.trim().replace(',', '.')) : raw;
  if (!Number.isFinite(years) || years < 0 || years > 100) {
    errors[field] = 'Informe um número de anos entre 0 e 100.';
  }
  return years;
}

function isRecord(input) {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function result(value, errors) {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

function readExperiences(input, errors) {
  const raw = input.experiences;
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 8) {
    errors.experiences = 'Informe no máximo 8 experiências profissionais.';
    return [];
  }
  const experiences = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      errors.experiences = 'Cada experiência deve informar função, anos e tarefas.';
      return [];
    }
    const nestedErrors = {};
    const area = readText(item, nestedErrors, 'area', 100, true);
    const years = readYears(item, nestedErrors, 'years', true);
    const skills = readList(item, nestedErrors, 'skills');
    if (Object.keys(nestedErrors).length) {
      errors.experiences = 'Revise a função, os anos e as tarefas de cada experiência.';
      return [];
    }
    experiences.push({ area, years, skills });
  }
  return experiences;
}

export function validateApplicant(input) {
  if (!isRecord(input)) return { ok: false, errors: { form: 'Informe os dados da candidatura.' } };

  const errors = {};
  const jobId = typeof input.job_id === 'string' && /^\d+$/u.test(input.job_id.trim())
    ? Number(input.job_id.trim()) : input.job_id;
  if (!Number.isSafeInteger(jobId) || jobId < 1) errors.job_id = 'Selecione uma vaga válida.';

  const phone = normalizePhone(input.phone);
  if (!phone) errors.phone = 'Informe um WhatsApp com DDI, começando com +.';

  const email = readText(input, errors, 'email', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) errors.email = 'Informe um e-mail válido.';

  if (input.consent !== true) errors.consent = 'Confirme o consentimento para continuar.';
  if (input.willing_to_relocate != null && typeof input.willing_to_relocate !== 'boolean') {
    errors.willing_to_relocate = 'Informe se tem disponibilidade para mudança.';
  }

  return result({
    job_id: jobId,
    name: readText(input, errors, 'name', 160, true),
    phone,
    email,
    country: readText(input, errors, 'country', 100, true),
    city: readText(input, errors, 'city', 100),
    areas: readList(input, errors, 'areas'),
    years_experience: readYears(input, errors, 'years_experience', true),
    experiences: readExperiences(input, errors),
    skills: readList(input, errors, 'skills'),
    languages: readList(input, errors, 'languages'),
    qualifications: readList(input, errors, 'qualifications'),
    willing_to_relocate: input.willing_to_relocate === true,
    notes: readText(input, errors, 'notes', 2000),
    consent: input.consent === true,
  }, errors);
}

export function validateJob(input) {
  if (!isRecord(input)) return { ok: false, errors: { form: 'Informe os dados da vaga.' } };

  const errors = {};
  const status = input.status ?? 'draft';
  if (!jobStatuses.has(status)) errors.status = 'Selecione um estado válido para a vaga.';

  return result({
    title: readText(input, errors, 'title', 160, true),
    area: readText(input, errors, 'area', 100, true),
    country: readText(input, errors, 'country', 100, true),
    city: readText(input, errors, 'city', 100),
    description: readText(input, errors, 'description', 6000, true),
    requirements: readText(input, errors, 'requirements', 6000),
    skills: readList(input, errors, 'skills'),
    required_skills: readList(input, errors, 'required_skills'),
    languages: readList(input, errors, 'languages'),
    qualifications: readList(input, errors, 'qualifications'),
    min_years_experience: readYears(input, errors, 'min_years_experience'),
    status,
  }, errors);
}
