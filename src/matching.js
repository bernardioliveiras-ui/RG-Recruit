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

  function add(key, weight, fraction, reason) {
    breakdown[key] = { earned: weight * fraction, weight };
    reasons.push(reason);
  }

  function addOverlap(key, weight, label) {
    const required = terms(job[key]);
    if (required.size === 0) return;

    const available = terms(candidate[key]);
    const matched = [...required].filter(term => available.has(term)).length;
    add(key, weight, matched / required.size, `${label}: ${matched} de ${required.size}.`);
  }

  const area = normalize(job.area);
  if (area) {
    const matched = terms(candidate.areas).has(area);
    add('area', 30, Number(matched), matched ? 'Experiência na área da vaga.' : 'Experiência na área não indicada.');
  }

  addOverlap('skills', 30, 'Habilidades atendidas');

  const minimum = job.min_years_experience;
  if (Number.isFinite(minimum) && minimum > 0) {
    const years = Number.isFinite(candidate.years_experience) ? Math.max(0, candidate.years_experience) : 0;
    add('experience', 20, Math.min(years / minimum, 1), `Experiência: ${years} ano(s), mínimo de ${minimum}.`);
  }

  addOverlap('languages', 10, 'Idiomas atendidos');

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
  return { score: totalWeight ? Math.round(100 * earned / totalWeight) : 0, reasons, breakdown };
}
