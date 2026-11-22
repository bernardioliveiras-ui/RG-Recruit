function normalize(value) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').trim().toLowerCase()
    : '';
}

function countryIdentifiers() {
  const identifiers = new Map();
  const regionNames = ['pt', 'es', 'en'].map(locale =>
    new Intl.DisplayNames(locale, { type: 'region', fallback: 'none' }));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const first of letters) {
    for (const second of letters) {
      const code = first + second;
      if (code === 'ZZ' || !regionNames[0].of(code)) continue;
      const identifier = new Intl.Locale(`und-${code}`).region;
      identifiers.set(normalize(code), identifier);
      for (const names of regionNames) {
        const name = normalize(names.of(code));
        if (name) identifiers.set(name, identifier);
      }
    }
  }
  return identifiers;
}

const countries = countryIdentifiers();

function countryIdentifier(value) {
  const normalized = normalize(value);
  return countries.get(normalized) ?? normalized;
}

function terms(value) {
  return new Set(Array.isArray(value) ? value.map(normalize).filter(Boolean) : []);
}

export function scoreCandidate(job, candidate) {
  const breakdown = {};
  const reasons = [];
  const review_flags = [];
  let missing_information = false;

  function add(key, weight, fraction, reason) {
    breakdown[key] = { earned: weight * fraction, weight };
    reasons.push(reason);
  }

  const area = normalize(job.area);
  const experiences = Array.isArray(candidate.experiences) ? candidate.experiences : [];
  const relevantExperiences = experiences.filter(entry => entry && normalize(entry.area) === area);
  const applicantAreas = terms(candidate.areas);
  for (const item of experiences) {
    if (item?.area) applicantAreas.add(normalize(item.area));
  }
  if (area) {
    const matched = applicantAreas.has(area);
    add('area', 25, Number(matched), matched ? 'Experiência na área da vaga.' : 'Experiência na área não indicada.');
    if (!applicantAreas.size) missing_information = true;
  }

  const mandatory = terms(job.required_skills);
  const desirable = terms(job.skills);
  const allSkills = new Set([...mandatory, ...desirable]);
  const availableSkills = experiences.length && area
    ? terms(relevantExperiences.flatMap(entry => entry.skills || []))
    : terms(candidate.skills);
  // Requisitos obrigatórios valem duas partes para uma parte desejável.
  const skillWeight = [...allSkills].reduce((sum, skill) => sum + (mandatory.has(skill) ? 2 : 1), 0);
  if (skillWeight) {
    const earnedSkills = [...allSkills].reduce((sum, skill) =>
      sum + (availableSkills.has(skill) ? (mandatory.has(skill) ? 2 : 1) : 0), 0);
    add('skills', 35, earnedSkills / skillWeight,
      `Tarefas práticas comprovadas no cadastro: ${[...allSkills].filter(skill => availableSkills.has(skill)).length} de ${allSkills.size}.`);
    if (!availableSkills.size) missing_information = true;
  }
  for (const skill of Array.isArray(job.required_skills) ? job.required_skills : []) {
    if (!availableSkills.has(normalize(skill))) {
      review_flags.push(`Confirmar tarefa obrigatória: ${skill}.`);
      missing_information = true;
    }
  }

  const minimum = job.min_years_experience;
  if (Number.isFinite(minimum) && minimum > 0) {
    const legacyAreas = [...applicantAreas];
    const legacyRelevant = !experiences.length && (area ? legacyAreas.length === 1 && legacyAreas[0] === area : true);
    const yearsKnown = relevantExperiences.length > 0 || legacyRelevant && Number.isFinite(candidate.years_experience);
    const years = relevantExperiences.length
      ? Math.max(...relevantExperiences.map(entry => Number.isFinite(entry.years) ? entry.years : 0))
      : legacyRelevant && Number.isFinite(candidate.years_experience) ? candidate.years_experience : 0;
    add('experience', 20, Math.min(Math.max(0, years) / minimum, 1),
      yearsKnown ? `Experiência na função: ${years} ano(s), mínimo de ${minimum}.` : `Tempo na função ainda não informado (mínimo desejado: ${minimum}).`);
    if (!yearsKnown) missing_information = true;
  }

  const neededLanguages = terms(job.languages);
  const neededQualifications = terms(job.qualifications);
  const needed = neededLanguages.size + neededQualifications.size;
  if (needed) {
    const knownLanguages = terms(candidate.languages);
    const knownQualifications = terms(candidate.qualifications);
    const matched = [...neededLanguages].filter(item => knownLanguages.has(item)).length +
      [...neededQualifications].filter(item => knownQualifications.has(item)).length;
    add('languages', 10, matched / needed, `Idiomas e qualificações: ${matched} de ${needed}.`);
    if (!knownLanguages.size && neededLanguages.size || !knownQualifications.size && neededQualifications.size) {
      missing_information = true;
    }
  }

  const country = countryIdentifier(job.country);
  if (country) {
    if (country === countryIdentifier(candidate.country)) {
      add('location', 10, 1, 'Reside no país da vaga.');
    } else if (candidate.willing_to_relocate === true) {
      add('location', 10, 1, 'Tem disponibilidade para mudança.');
    } else {
      add('location', 10, 0, 'País da vaga diferente e mudança não indicada.');
    }
  }

  let earned = 0;
  let totalWeight = 0;
  for (const { earned: points, weight } of Object.values(breakdown)) {
    earned += points;
    totalWeight += weight;
  }

  if (!totalWeight) reasons.push('A vaga não tem critérios de compatibilidade definidos.');
  const score = totalWeight ? Math.round(100 * earned / totalWeight) : 0;
  return {
    score, reasons, breakdown, review_flags, missing_information,
    band: score >= 80 ? 'high' : score >= 55 ? 'review' : 'other',
  };
}
