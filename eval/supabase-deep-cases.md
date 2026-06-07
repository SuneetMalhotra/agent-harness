# Deep test-case catalog — Supabase Studio (Phase 2 web evaluation)

**Target:** Supabase Studio (local). Start: `cd ~/agents/vyra/infra/supabase && supabase start` → http://localhost:54323.
**Why this target:** complex modern React frontend — dashboards, deeply nested components, dynamic state, async DB round-trips, modals, grids, toasts. Exercises the difficulty TodoMVC cannot.
**Contamination note:** Studio's UI is partly public, so pair these with the lower-contamination `suneetmalhotra.com` set and/or a DOM-obfuscated build; report the gap. Pin the Studio version used.
**Format:** each case maps to the repo `TestCase` shape (id, tier tag, steps, assertion). "Deep" = multi-step + stateful + a downstream effect to verify. "Healing challenge" = why locator resolution is hard here (the part the chaos benchmark perturbs).

> Convention: `@tier1` local browser, `@tier2` cloud farm, `@tier3` virtual back-end. Most Studio cases are `@tier1`. Run each twice: clean, and with `chaos/generate-perturbations.mjs` mutations applied to the action targets.

---

## Table Editor
**TC-SB-01 `@tier1` — Create typed table.** Open Table Editor → New table `widgets` → add columns `name text`, `qty int8`, `created_at timestamptz default now()` → set `id` PK → Save. **Assert:** `widgets` appears in the sidebar with 4 columns; success toast shown. **Healing challenge:** the "New table" CTA and the per-column "Add column" rows are dynamically rendered React with generated class names.

**TC-SB-02 `@tier1` — Insert + edit + persist.** In `widgets` → Insert row (name="alpha", qty=5) → save → edit the qty cell inline to 7 → reload page → reopen `widgets`. **Assert:** row shows qty=7 after reload (state persisted to DB). **Healing challenge:** editable data-grid cells have no stable ids; targeting requires row/column context.

**TC-SB-03 `@tier1` — Foreign key column.** Add column `owner_id` to `widgets` → set type to a FK referencing `auth.users(id)` → Save. **Assert:** column shows the FK relation indicator; constraint exists. **Healing challenge:** FK config is a nested modal with async-loaded table/column dropdowns.

**TC-SB-04 `@tier1` — Delete column + grid re-render.** Delete `qty` from `widgets` → confirm in modal. **Assert:** column removed; grid re-renders without it; no stale header. **Healing challenge:** confirm-modal button text is generic ("Delete"); multiple "Delete" controls on screen (false-heal trap).

## SQL Editor
**TC-SB-05 `@tier1` — Run, save, reopen snippet.** SQL Editor → run `select * from widgets;` → Save snippet as "list-widgets" → navigate away → reopen the snippet from the sidebar → run again. **Assert:** result grid renders rows; snippet name persisted. **Healing challenge:** Monaco editor + virtualized snippet list.

**TC-SB-06 `@tier1` — Multi-statement DDL.** Run `create table notes(id bigserial primary key, body text); insert into notes(body) values ('hi');` **Assert:** success state; `notes` now visible in Table Editor sidebar. **Healing challenge:** cross-view state propagation (SQL → Table Editor sidebar).

**TC-SB-07 `@tier1` — Syntax error surfaces.** Run `selct 1;` (typo). **Assert:** an error panel renders with a Postgres error message; no result grid. **Healing challenge:** error panel is conditionally mounted; intentionally tests that the visual-assertion judge distinguishes "error state" from "empty result."

## RLS / Auth (the strongest deep flows — cross-feature state)
**TC-SB-08 `@tier1` — Enable RLS + add policy.** Database → Policies (or Table Editor → RLS) → enable RLS on `widgets` → New policy → SELECT, `using (true)` → Save. **Assert:** RLS badge on `widgets`; policy listed by name. **Healing challenge:** policy editor is a multi-step wizard with template pickers.

**TC-SB-09 `@tier1` — Create then delete auth user.** Authentication → Users → Add user (email + password) → **Assert** user appears in list → delete the user → **Assert** removed. **Healing challenge:** user table rows keyed by UUID; the add-user flow is a modal with validation states.

**TC-SB-10 `@tier1` — RLS actually blocks anon read.** Add RLS SELECT policy `using (auth.uid() = owner_id)` on `widgets` → open API Docs (or SQL with `set role anon`) → attempt an anonymous select. **Assert:** anon read returns 0 rows / permission denied, proving the policy is enforced (not just saved). **Healing challenge:** cross-surface verification (Policies → API/SQL); the real In-Practice signal.

**TC-SB-11 `@tier1` — Toggle auth setting persists.** Authentication → Providers/Settings → toggle "Confirm email" off → Save → reload. **Assert:** setting still off after reload. **Healing challenge:** toggle switches with no text label (aria-only); pure vision/role target.

## Storage
**TC-SB-12 `@tier1` — Public bucket + upload + URL.** Storage → New bucket `assets` (public) → upload a small file → **Assert** file lists; copy public URL and confirm it resolves (200). **Healing challenge:** drag/drop or file-picker upload; async upload progress UI.

**TC-SB-13 `@tier1` — Private bucket policy gate.** New bucket `private-x` (private) → attempt anonymous download → **Assert** denied → add a storage policy permitting it → **Assert** now allowed. **Healing challenge:** storage-policy editor + state change verification.

**TC-SB-14 `@tier1` — Delete file re-renders listing.** In `assets` → delete the uploaded file → confirm. **Assert:** file removed from listing; empty-state renders. **Healing challenge:** row action menu (kebab) → conditional menu items.

## Database internals
**TC-SB-15 `@tier1` — Create function.** SQL: `create function add(a int, b int) returns int language sql as $$ select a+b $$;` → Database → Functions. **Assert:** `add` listed under Functions. **Healing challenge:** SQL → Functions-list propagation; long virtualized list.

**TC-SB-16 `@tier1` — Trigger fires.** Create a trigger on `notes` insert that writes to an audit table → insert a row → **Assert** audit row exists. **Healing challenge:** pure data-effect verification (no direct UI element for the effect).

**TC-SB-17 `@tier1` — Enable extension.** Database → Extensions → enable `uuid-ossp` (or pg_stat_statements) → **Assert** toggled to enabled; reload persists. **Healing challenge:** searchable extensions grid; toggle within a card.

## Cross-feature / navigation
**TC-SB-18 `@tier1` — API docs match schema.** API Docs → select `widgets` → **Assert** the generated columns match TC-SB-01's schema (name, created_at, owner_id; qty absent after TC-SB-04). **Healing challenge:** auto-generated docs reflect prior mutations; verifies end-to-end state consistency across the whole session.

---

## Running notes
- Each case yields pipeline events (PM→QA→AutoEng→PR Reviewer) + execution events (healing, visual assertion, tier routing) onto the §2 substrate, exactly as §6.1.
- Run the action targets through `chaos/generate-perturbations.mjs` + `chaos/score-healing.mjs` to get the graded healing benchmark on a *real* app (vs TodoMVC calibration).
- Capture: pipeline disposition, healing accuracy-by-band + MTTH + false-heal, visual-assertion verdicts, and (Phase 3) the 5 hardest failures for the human debugging A/B.
- For contamination control, also run TC-SB-01..04 against a DOM-obfuscated Studio build (randomized class names) and report the accuracy delta.
