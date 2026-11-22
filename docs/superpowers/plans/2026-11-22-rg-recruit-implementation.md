# RG Recruit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure, deployable, two-profile international recruitment MVP for Ramon Gama with a reusable candidate database and explainable vacancy matching.

**Architecture:** One Cloudflare Worker handles `/api/*` and serves a framework-free responsive web interface through Static Assets. D1 stores admins, vacancies, candidates and applications. Pure JS functions cover validation and scoring and use Node's built-in test runner.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers, D1 SQLite, WebCrypto, HTML/CSS, `wrangler`, Node.js built-in tests.

**Spec:** `docs/superpowers/specs/2026-11-22-rg-recruit-design.md`

## Global Constraints

- Public interface in Portuguese with brand **Ramon Gama — Recrutamento**, black/gold visual, phone-first and keyboard-accessible.
- Jobs are global; each has a country and optionally city. Do not assume Australia or Spain from logo/phone.
- One candidate per normalized phone, no public candidate authentication or public access to existing profile data in V1.
- Only authorized administrators may see candidate PII or modify jobs and application statuses.
- Score candidates against jobs transparently using professional criteria only; never automatically reject.
- No paid AI, WhatsApp API, payments, outbound email, or document upload.
- Deliver source, SQL migration, configuration example, tests and Cloudflare publication steps; do not deploy to customer's account.

## Review Focus

1. A repeat applicant with the same phone but different punctuation must not generate a second profile (Task 2 test).
2. Unauthenticated users must never read private candidate records or mutate vacancies (Task 3 test).
3. A vacancy with no requirement values must not cause division by zero, NaN or arbitrary 100% match (Task 1 test).
4. Two simultaneous attempts to apply for the same job must not create duplicate applications (Task 2 uniqueness test).
5. International phones, non-ASCII names and country names must be accepted while malformed inputs fail cleanly (Task 1 test).

---

## File Map

| Path | Responsibility |
| --- | --- |
| `package.json`, `wrangler.jsonc` | scripts and Worker/D1/assets bindings |
| `migrations/0001_initial.sql` | jobs, candidates, applications, admins, login throttles |
| `src/index.js` | Worker `fetch` entry and static asset fallback |
| `src/api.js` | public/admin JSON API routing and response format |
| `src/validation.js` | normalized form input and field errors |
| `src/matching.js` | deterministic scoring and explanations |
| `src/auth.js` | password hashing, session cookies and authentication |
| `src/repository.js` | D1 prepared queries and transaction-safe inserts |
| `public/index.html` | semantic public and admin shell |
| `public/app.css` | responsive, branded styling |
| `public/app.js` | candidate screens, form and vacancies |
| `public/admin.js` | admin dashboard and management actions |
| `public/assets/rg-mark.*` | cleaned brand mark based on supplied art |
| `tests/*.test.mjs` | pure and mocked-API regression tests |
| `README.md`, `PRIVACY-NOTICE-TEMPLATE.md` | local/deploy/bootstrap guidance and privacy placeholders |

### Task 1: Data Schema, Validation and Explainable Matching

**Files:** `migrations/0001_initial.sql`, `src/validation.js`, `src/matching.js`, `tests/validation.test.mjs`, `tests/matching.test.mjs`, `package.json`

**Interfaces:**
- Produces `normalizePhone(value: string): string`, `validateApplicant(input: unknown): {ok:boolean, value?:object, errors?:object}`, `validateJob(input:unknown): {ok:boolean,value?:object,errors?:object}`.
- Produces `scoreCandidate(job: object, candidate: object): {score:number, reasons:string[], breakdown:object}` with score 0–100, stable ordering and no sensitive attributes.
- SQL includes `admins`, `jobs`, `candidates`, `applications`, `login_attempts`; unique candidate phone and unique `(candidate_id,job_id)`.

- [ ] **Step 1:** Write failing tests for country-aware nonempty fields, `+61`/`+34`/`+351` phones, non-ASCII applicant names, invalid vacancy ids, vacant criteria and transparent score ordering.
- [ ] **Step 2:** Run `node --test tests/validation.test.mjs tests/matching.test.mjs`; expect import failures.
- [ ] **Step 3:** Implement the three modules/schema, plus test script in package manifest.
- [ ] **Step 4:** Re-run same command; expect all assertions pass, including no NaN for empty requirement sets.
- [ ] **Step 5:** Commit `feat: add recruitment schema and deterministic matching`.

### Task 2: Public Vacancies and Candidate Applications

**Files:** `src/repository.js`, `src/api.js`, `src/index.js`, `wrangler.jsonc`, `tests/public-api.test.mjs`

**Interfaces:**
- Consumes Task 1 validation and schema.
- Produces `handleApi(request: Request, env: Env): Promise<Response>` and `onRequest(request, env)` via Worker export.
- Public endpoints `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/applications`. The POST includes candidate profile and `job_id`, returns generic receipt without existing candidate details.
- Repository methods `listPublishedJobs(db, filters)`, `findPublishedJob(db,id)`, `upsertCandidateAndApply(db,profile,jobId)`, with SQL uniqueness, `ON CONFLICT DO NOTHING` for existing candidate profiles/applications, and D1 batch as needed. Never update profile fields on phone collision.

- [ ] **Step 1:** Write mocked-D1 API tests for published-only listing, invalid request responses, same phone punctuation deduplication, different job enrollment, duplicate application conflict behavior, unchanged candidate data on collision, and no public profile-existence disclosure.
- [ ] **Step 2:** Run `node --test tests/public-api.test.mjs`; expect failure.
- [ ] **Step 3:** Implement parameterized queries and API routes, JSON size bounds, honeypot/rate defenses and server-side verification of Turnstile tokens when production protection is configured; set Worker asset routing.
- [ ] **Step 4:** Re-run public API tests and verify duplicates never expose saved applicant data.
- [ ] **Step 5:** Commit `feat: provide public jobs and reusable candidate registrations`.

### Task 3: Administrative Access and Workflows

**Files:** `src/auth.js`, `src/api.js`, `src/repository.js`, `tests/auth.test.mjs`, `tests/admin-api.test.mjs`

**Interfaces:**
- Consumes Task 2 API router and repository.
- Produces `hashPassword(password,salt?)`, `verifyPassword(password, stored)`, `signSession(adminId,secret,now?)`, `readSession(request,secret,now?)`.
- Admin endpoints: `POST /api/admin/bootstrap` (setup token in a private request header, valid only while zero admins exist), `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`, `GET/POST /api/admin/jobs`, `PATCH /api/admin/jobs/:id`, `GET /api/admin/candidates`, `GET /api/admin/candidates/:id`, `GET /api/admin/jobs/:id/matches`, `GET /api/admin/applications?job_id=...`, `PATCH /api/admin/applications/:id`, `GET/POST /api/admin/users`, `DELETE /api/admin/candidates/:id`.

- [ ] **Step 1:** Write failing tests for password verification, cookie expiry/tampering, bootstrap uniqueness and private header token, unauthorized requests, origin checks, login throttling and filtered candidate matches including non-applicants.
- [ ] **Step 2:** Run `node --test tests/auth.test.mjs tests/admin-api.test.mjs`; expect failure.
- [ ] **Step 3:** Implement WebCrypto password storage, signed HttpOnly/Secure/SameSite cookies, admin-only routes and status transitions.
- [ ] **Step 4:** Re-run auth/admin tests; expect all pass and no admin data reachable unauthenticated.
- [ ] **Step 5:** Commit `feat: secure administrative recruitment workflows`.

### Task 4: Branded Public Candidate UI

**Files:** `public/index.html`, `public/app.css`, `public/app.js`, `public/assets/rg-mark.*`, `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes public endpoints from Task 2.
- Produces public home with vacancy cards, country/category filters, job detail, applicant form, consent checkbox and success/validation/error states. Use only derived logo artwork, not screenshot chrome.

- [ ] **Step 1:** Write DOM/file contract tests for required page elements, form field names, error containers and accessibility labels.
- [ ] **Step 2:** Run `node --test tests/ui-contract.test.mjs`; expect failure.
- [ ] **Step 3:** Implement responsive black/gold interface; make public JS call `GET /api/jobs` and `POST /api/applications` safely, include configurable Turnstile widget support; add clean RG mark.
- [ ] **Step 4:** Re-run UI contract test; inspect mobile (~390px) and desktop (~1440px) layout and keyboard focus.
- [ ] **Step 5:** Commit `feat: deliver branded candidate recruitment portal`.

### Task 5: Admin Dashboard UI

**Files:** `public/admin.js`, `public/index.html`, `public/app.css`, `tests/admin-ui-contract.test.mjs`

**Interfaces:**
- Consumes admin endpoints from Task 3.
- Produces login/setup screen, dashboard counts, vacancy form, candidate list/filter, match list with score breakdown, applications statuses, WhatsApp contact links and admin management.

- [ ] **Step 1:** Write failing contract tests for routes/actions, accessible buttons, escaped user-submitted text and explicit applicant/non-applicant distinctions.
- [ ] **Step 2:** Run `node --test tests/admin-ui-contract.test.mjs`; expect failure.
- [ ] **Step 3:** Implement admin screens and state handling without rendering untrusted text as HTML.
- [ ] **Step 4:** Run tests; manually exercise create vacancy, find matches and update status on both viewport sizes.
- [ ] **Step 5:** Commit `feat: deliver admin dashboard and talent matching views`.

### Task 6: End-to-End Validation and Cloudflare Handoff

**Files:** `README.md`, `PRIVACY-NOTICE-TEMPLATE.md`, `wrangler.jsonc`, `package.json`, `tests/deployment.test.mjs`

**Interfaces:**
- Consumes all previous tasks.
- Produces instructions to create D1, bind in Wrangler, run SQL migrations locally/remotely, configure `SESSION_SECRET` and `ADMIN_SETUP_TOKEN` as encrypted secrets, bootstrap first admin, deploy and validate production.

- [ ] **Step 1:** Write failing configuration/deployment contract test for presence of D1 binding, assets, migration and non-hardcoded secrets.
- [ ] **Step 2:** Run `node --test tests/deployment.test.mjs`; expect failure.
- [ ] **Step 3:** Document Turnstile site/secret configuration and server validation, CSP/security headers, setup and international privacy review; include editable controller identity/contact/retention placeholders, local sample test data, screenshots if useful, and secure troubleshooting. Explicitly prohibit real candidate collection before privacy details and legal review are complete.
- [ ] **Step 4:** Run `npm test`; run Wrangler local smoke if available, check create/list/apply/login/score/update flows and response headers; inspect responsive UI.
- [ ] **Step 5:** Commit `docs: prepare Cloudflare deployment and validate MVP`.

## Plan Self-review

- Candidate and admin flows, data persistence, secure access, matching, layout and deployment each have an owning task.
- Data model and APIs have one schema/name, and tests explicitly pin duplicates, private data access, empty requirements, international values and application uniqueness.
- Runtime dependencies intentionally minimal; Wrangler is needed only for Cloudflare development/deployment.
