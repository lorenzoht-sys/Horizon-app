# Pack code sécurité — référence (non appliqué)

Fourni par Lorenzo le 2026-08-17, pendant le checkpoint 1 de l'audit sécurité
(`audit-securite-global`). **Rien de ce fichier n'a été appliqué au code ou
à une base de données.** C'est du code de référence à adapter, pas à coller
aveuglément (voir avertissement d'origine ci-dessous).

Ordre d'application décidé (voir tableau "Ordre d'exécution recommandé" en
fin de fichier) : diff de schéma + harnais RLS AVANT toute correction, puis
lots 3 à 8 un par un, jamais lots 3 (`guard.ts`) et 8 (migrations RLS) dans
le même déploiement.

Findings fermés par chaque bloc, pour retrouver rapidement quoi appliquer
quand on y arrivera :

| Bloc | Fichier(s) cible | Ferme |
|---|---|---|
| 1. `guard.ts` | `api/_lib/guard.ts` + réécriture des 12 routes | Auth non vérifiée, IDOR, `service_role` non scopé, méthodes HTTP non filtrées, erreurs bavardes — Phase 2 |
| 2. Rate limiting | `supabase/migrations/*_rate_limit.sql`, `api/_lib/rateLimit.ts` | Brute force code d'accès, abus de coût `/api/claude` — Phase 3.1 |
| 3. Session patient | `api/_lib/session.ts`, `src/lib/purgeSession.ts` | Token en `localStorage`, bug session PWA partagée — Phase 3.2 |
| 4. `vercel.json` | racine | En-têtes sécurité, CSP Report-Only d'abord — Phase 6 |
| 5. Sentry | `src/lib/sentry.ts` | Fuite PII/donnée de santé vers Sentry — Phase 5 |
| 6. `rls.spec.ts` (référence) | `tests/security/rls.spec.ts` | Base pour le harnais — adapté séparément avec les tests spécifiques F-01/F-05 à F-11 |
| 7. `.github/workflows/security.yml` | `.github/workflows/` | CI : gitleaks, npm audit, secrets dans le bundle, tests sécurité — Phase 7 |
| 8. `audit_logs` trigger | migration dédiée | Verrouillage append-only y compris contre `service_role` — ferme F-06 |

---

## 1. `api/_lib/guard.ts` — Le cœur du correctif

```ts
// api/_lib/guard.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import type { ZodSchema } from 'zod';

export const admin = (): SupabaseClient =>
  createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type Identite =
  | { type: 'praticien'; praticienId: string }
  | { type: 'patient'; patientId: string; praticienId: string }
  | { type: 'structure'; structureId: string }
  | { type: 'cron' };

export class HttpError extends Error {
  constructor(public status: number, public code: string, public logDetail?: string) {
    super(code);
  }
}

async function identifierPraticien(req: VercelRequest): Promise<Identite> {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'non_authentifie');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'session_invalide');
  return { type: 'praticien', praticienId: data.user.id };
}

async function identifierPatient(req: VercelRequest): Promise<Identite> {
  const token = lireCookie(req, 'horizon_patient') ??
                (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'non_authentifie');
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.PATIENT_SESSION_SECRET!),
      { algorithms: ['HS256'], issuer: 'horizon', audience: 'patient' },
    );
    return {
      type: 'patient',
      patientId: String(payload.sub),
      praticienId: String(payload.prat),
    };
  } catch (e) {
    throw new HttpError(401, 'session_invalide', String(e));
  }
}

function identifierCron(req: VercelRequest): Identite {
  const recu = Buffer.from(String(req.headers['x-cron-secret'] ?? ''));
  const attendu = Buffer.from(process.env.CRON_SECRET ?? '');
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
    throw new HttpError(401, 'non_authentifie');
  }
  return { type: 'cron' };
}

type Options<B> = {
  methodes: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>;
  acteurs: Array<Identite['type']>;
  schema?: ZodSchema<B>;
};

export function guard<B = unknown>(
  opts: Options<B>,
  handler: (ctx: {
    req: VercelRequest; res: VercelResponse; identite: Identite; body: B; db: SupabaseClient;
  }) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      if (!opts.methodes.includes(req.method as any)) {
        res.setHeader('Allow', opts.methodes.join(', '));
        throw new HttpError(405, 'methode_non_autorisee');
      }

      let identite: Identite | null = null;
      let derniereErreur: unknown = null;
      for (const acteur of opts.acteurs) {
        try {
          if (acteur === 'praticien') identite = await identifierPraticien(req);
          else if (acteur === 'patient') identite = await identifierPatient(req);
          else if (acteur === 'cron') identite = identifierCron(req);
          else if (acteur === 'structure') identite = await identifierStructure(req); // à implémenter
          if (identite) break;
        } catch (e) { derniereErreur = e; }
      }
      if (!identite) throw (derniereErreur ?? new HttpError(401, 'non_authentifie'));

      let body = {} as B;
      if (opts.schema) {
        const source = req.method === 'GET' ? req.query : req.body;
        const parsed = opts.schema.safeParse(source);
        if (!parsed.success) throw new HttpError(400, 'entree_invalide', parsed.error.message);
        body = parsed.data;
      }

      await handler({ req, res, identite, body, db: admin() });
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, 'erreur_interne', String(e));
      if (err.status >= 500) console.error('[api]', req.url, err.code, err.logDetail);
      res.status(err.status).json({ error: err.code });
    }
  };
}

export async function assertPatientAutorise(
  db: SupabaseClient, identite: Identite, patientId: string,
): Promise<void> {
  if (identite.type === 'patient') {
    if (identite.patientId !== patientId) throw new HttpError(404, 'introuvable');
    return;
  }
  if (identite.type === 'praticien') {
    const { data, error } = await db
      .from('participants').select('id')
      .eq('id', patientId).eq('praticien_id', identite.praticienId).maybeSingle();
    if (error || !data) throw new HttpError(404, 'introuvable');
    return;
  }
  if (identite.type === 'structure') {
    const { data } = await db
      .from('participants').select('id')
      .eq('id', patientId).eq('structure_id', identite.structureId).maybeSingle();
    if (!data) throw new HttpError(404, 'introuvable');
    return;
  }
  throw new HttpError(403, 'interdit');
}

function lireCookie(req: VercelRequest, nom: string): string | undefined {
  return (req.headers.cookie ?? '')
    .split(';').map(c => c.trim().split('='))
    .find(([k]) => k === nom)?.[1];
}
```

### Usage type (route existante réécrite)

```ts
// api/patient/me.ts
import { z } from 'zod';
import { guard, assertPatientAutorise } from '../_lib/guard';

export default guard(
  { methodes: ['GET'], acteurs: ['patient'], schema: z.object({}).strict() },
  async ({ res, identite, db }) => {
    await assertPatientAutorise(db, identite, (identite as any).patientId);
    const { data } = await db
      .from('participants')
      .select('id, prenom, nom, programme_actuel') // JAMAIS select('*')
      .eq('id', (identite as any).patientId)
      .single();
    res.status(200).json(data);
  },
);
```

---

## 2. Rate limiting persistant (table Postgres)

```sql
-- supabase/migrations/<date>_securite_rate_limit.sql
create table if not exists public.rate_limit (
  cle          text        not null,
  fenetre      timestamptz not null,
  compteur     int         not null default 0,
  primary key (cle, fenetre)
);
alter table public.rate_limit enable row level security;
alter table public.rate_limit force row level security;
revoke all on public.rate_limit from anon, authenticated;

create or replace function public.consommer_quota(
  p_cle text, p_max int, p_fenetre_sec int default 60
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_fenetre timestamptz; v_n int;
begin
  v_fenetre := to_timestamp(floor(extract(epoch from now()) / p_fenetre_sec) * p_fenetre_sec);
  insert into public.rate_limit(cle, fenetre, compteur) values (p_cle, v_fenetre, 1)
  on conflict (cle, fenetre) do update set compteur = public.rate_limit.compteur + 1
  returning compteur into v_n;
  delete from public.rate_limit where fenetre < now() - interval '1 day';
  return v_n <= p_max;
end $$;
revoke execute on function public.consommer_quota(text,int,int) from anon, authenticated;
```

```ts
// api/_lib/rateLimit.ts
import { admin, HttpError } from './guard';
export async function limiter(cle: string, max: number, fenetreSec = 60) {
  const { data, error } = await admin().rpc('consommer_quota', {
    p_cle: cle, p_max: max, p_fenetre_sec: fenetreSec,
  });
  if (error) throw new HttpError(503, 'indisponible');
  if (data === false) throw new HttpError(429, 'trop_de_tentatives');
}
```

Application sur le login patient (deux clés) :

```ts
const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
await limiter(`patient_login_ip:${ip}`, 5, 300);
await limiter('patient_login_global', 60, 300);
```

Le plafond global protège contre l'énumération distribuée (le code d'accès
est un espace de noms unique), mais crée un risque de déni de service pour
les patients légitimes — fixer assez haut, journaliser le déclenchement.

---

## 3. Session patient : cookie HttpOnly + purge PWA

```ts
// api/_lib/session.ts
import { SignJWT } from 'jose';
import type { VercelResponse } from '@vercel/node';

export async function ouvrirSessionPatient(
  res: VercelResponse, patientId: string, praticienId: string,
) {
  const token = await new SignJWT({ prat: praticienId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(patientId)
    .setIssuer('horizon').setAudience('patient')
    .setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(process.env.PATIENT_SESSION_SECRET!));

  res.setHeader('Set-Cookie',
    `horizon_patient=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`);
}

export function fermerSessionPatient(res: VercelResponse) {
  res.setHeader('Set-Cookie', 'horizon_patient=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}
```

```ts
// src/lib/purgeSession.ts — À APPELER AU LOGOUT *ET* À CHAQUE LOGIN PATIENT
export async function purgerToutesLesDonneesLocales() {
  localStorage.clear();
  sessionStorage.clear();
  if ('caches' in window) {
    for (const c of await caches.keys()) await caches.delete(c);
  }
  if (indexedDB?.databases) {
    for (const db of await indexedDB.databases()) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  }
  const reg = await navigator.serviceWorker?.getRegistration();
  await reg?.update();
}
```

Service worker : `/api/**` doit être en `NetworkOnly`.

---

## 4. `vercel.json` — en-têtes de sécurité

CSP en `Content-Security-Policy-Report-Only` d'abord, observer une semaine,
puis basculer.

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(self), geolocation=(self), interest-cohort=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, private" },
        { "key": "X-Robots-Tag", "value": "noindex" }
      ]
    }
  ]
}
```

`microphone=(self)` conservé pour les dictées vocales — à retirer si la
fonctionnalité a disparu (à vérifier en Phase 5).

---

## 5. Sentry — anti-fuite de données de santé

```ts
// src/lib/sentry.ts
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD,
  sendDefaultPii: false,
  beforeBreadcrumb(b) {
    if (b.category === 'console') return null;
    if (b.category?.startsWith('ui.')) return null;
    if (b.category === 'fetch' || b.category === 'xhr') { delete (b as any).data?.body; }
    return b;
  },
  beforeSend(event) {
    delete event.request?.data;
    delete event.request?.cookies;
    delete event.user;
    if (event.request?.url) {
      event.request.url = event.request.url
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
        .replace(/([?&])(code|token|acces)=[^&]*/gi, '$1$2=<masqué>');
    }
    return event;
  },
});
```

Vérifier aussi la région du projet Sentry (US vs EU — Phase 5/9).

---

## 6. Harnais de test de cloisonnement — squelette de référence

```ts
// tests/security/rls.spec.ts — contre STAGING uniquement (squelette de départ,
// remplacé par une version avec assertions spécifiques par finding)
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.STAGING_SUPABASE_URL!;
const ANON = process.env.STAGING_SUPABASE_ANON_KEY!;
const SERVICE = process.env.STAGING_SERVICE_ROLE_KEY!;

const TABLES = [ // à générer depuis pg_tables, pas à maintenir à la main
  'participants','bilans','programmes','seances','seances_patient',
  'exercices_realises','programme_seances','programme_planning',
  'programme_exercices','contrats','documents','audit_logs',
];

let clientA: any, clientB: any, lignesDeB: Record<string, string> = {};

beforeAll(async () => {
  clientA = createClient(URL, ANON); clientB = createClient(URL, ANON);
  await clientA.auth.signInWithPassword({ email: 'prat-a@test.local', password: process.env.TEST_PWD_A! });
  await clientB.auth.signInWithPassword({ email: 'prat-b@test.local', password: process.env.TEST_PWD_B! });
  const svc = createClient(URL, SERVICE);
  for (const t of TABLES) {
    const { data } = await svc.from(t).select('id').limit(1);
    if (data?.[0]) lignesDeB[t] = data[0].id;
  }
});

describe.each(TABLES)('cloisonnement inter-praticiens : %s', (table) => {
  it('A ne LIT aucune ligne de B', async () => {
    const { data } = await clientA.from(table).select('id').eq('id', lignesDeB[table] ?? '0');
    expect(data ?? []).toHaveLength(0);
  });

  it('A ne MODIFIE aucune ligne de B', async () => {
    const { data, error } = await clientA.from(table)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', lignesDeB[table] ?? '0').select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('A ne SUPPRIME aucune ligne de B', async () => {
    const { data, error } = await clientA.from(table)
      .delete().eq('id', lignesDeB[table] ?? '0').select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
```

Le test le plus important est le DELETE, presque toujours oublié.

---

## 7. `.github/workflows/security.yml`

```yaml
name: securite
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm audit --audit-level=high --production
      - run: npx tsc --noEmit
      - run: npm run build
      - name: Aucun secret dans le bundle
        run: |
          if grep -rEq "sb_secret|sk-ant-|BEGIN [A-Z ]*PRIVATE KEY|service_role" dist/; then
            echo "::error::Secret détecté dans le bundle client"; exit 1; fi
      - run: npx vitest run tests/security
        env:
          STAGING_SUPABASE_URL: '${{ secrets.STAGING_SUPABASE_URL }}'
          STAGING_SUPABASE_ANON_KEY: '${{ secrets.STAGING_SUPABASE_ANON_KEY }}'
          STAGING_SERVICE_ROLE_KEY: '${{ secrets.STAGING_SERVICE_ROLE_KEY }}'
```

---

## 8. `audit_logs` — append-only vérifié

```sql
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
revoke update, delete, truncate on public.audit_logs from anon, authenticated, public;

drop policy if exists audit_logs_lecture_praticien on public.audit_logs;
create policy audit_logs_lecture_praticien on public.audit_logs
  for select to authenticated
  using (acteur_type = 'praticien' and acteur_id = (select auth.uid()));

create or replace function public.audit_logs_immuable() returns trigger
language plpgsql as $$ begin
  raise exception 'audit_logs est append-only'; end $$;
drop trigger if exists trg_audit_logs_immuable on public.audit_logs;
create trigger trg_audit_logs_immuable
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immuable();
```

Le trigger bloque aussi `service_role`. Une purge de rétention devra
désactiver le trigger explicitement — c'est voulu : la suppression doit
être un acte délibéré et tracé.

---

## Ordre d'exécution recommandé

| # | Lot | Effet | Risque de régression |
|---|-----|-------|----------------------|
| 1 | Script SQL d'audit (lecture seule) | Voir la réalité | Nul |
| 2 | Harnais de tests RLS sur staging | Prouver le cloisonnement | Nul |
| 3 | `guard.ts` + anti-IDOR sur les 12 routes | Ferme le risque n°1 | Moyen — tester chaque route |
| 4 | Rate limiting | Anti brute force / abus de coût | Faible |
| 5 | Cookie HttpOnly + purge PWA | Ferme le bug appareil partagé | Moyen — reconnexion des patients |
| 6 | En-têtes + CSP Report-Only | Durcissement | Faible |
| 7 | Sentry, secrets, CI | Hygiène durable | Nul |
| 8 | Migrations RLS correctives | Selon findings | Élevé — staging obligatoire |

**Ne jamais faire les lots 3 et 8 dans le même déploiement** — pour pouvoir
identifier lequel des deux est en cause si quelque chose casse en
production.
