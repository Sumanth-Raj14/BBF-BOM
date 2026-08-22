# Prompt Archaeology — every ask across every session, and what is still missing

Generated 16 August 2026 by parsing every session transcript under
`~/.claude/projects/C--Users-tsuma-Downloads-bom-tool/`. This is the record of what was
*asked for* over the life of the project, checked against what the code actually does today.

## 1. Session inventory

**7 sessions** carried real conversation, spanning **2026-07-11 to 2026-08-22**.

| First activity | Session | Prompts | Transcript |
|---|---|---|---|
| 2026-07-11 | `80d9612d` | 5 | 0.5 MB |
| 2026-07-11 | `d47bc498` | 257 | 29.8 MB |
| 2026-07-18 | `c71bb777` | 5 | 0.4 MB |
| 2026-07-18 | `9aac0900` | 15 | 2.3 MB |
| 2026-08-01 | `056c794b` | 148 | 32.8 MB |
| 2026-08-01 | `df845170` | 11 | 0.3 MB |
| 2026-08-01 | `ab21cd9a` | 1 | 0.1 MB |

**442 user messages total** — 403 substantive asks, 39 acknowledgements
and nudges ("ok", "continue", "use full force", status checks).

Four other project directories exist (`...-bom-tool-v1`, `...-bom-tool/backend`,
`...-bom-tool/frontend`, `...-bom-tool-bom-tool-v1-bom-tool`) but hold **no** session
transcripts — they are config-only. All real work happened in the one directory above.

### Activity by day

| Date | Asks |
|---|---|
| 2026-07-11 |  20 `####################` |
| 2026-07-17 |  50 `########################################` |
| 2026-07-18 | 100 `########################################` |
| 2026-07-19 |  58 `########################################` |
| 2026-07-20 |   3 `###` |
| 2026-07-30 |   7 `#######` |
| 2026-07-31 |   6 `######` |
| 2026-08-01 |  76 `########################################` |
| 2026-08-02 |  34 `##################################` |
| 2026-08-08 |  12 `############` |
| 2026-08-09 |  17 `#################` |
| 2026-08-15 |  16 `################` |
| 2026-08-16 |   3 `###` |
| 2026-08-22 |   1 `#` |

---

## 2. Standing instructions that ran the whole project

Stated once, governed everything after. All are being honoured.

| Instruction | First asked | Status |
|---|---|---|
| Build an OpenBOM competitor — "visibly OpenBOM-like, not only visibility, I need it working" | 11 Jul | Ongoing — see §4 |
| **Local-first**: "cloud connection capability but it should mainly focus on in-house storage and functioning" | 17 Jul | Honoured — core runs fully offline, cloud optional |
| Commit as `Sumanth-Raj-BBF`, strip all Claude co-author trailers | 18 Jul | Honoured — verified across all 46 commits of PR #14 |
| Push to `Sumanth-Raj14/BBF-BOM`, never the `blackbox` remote | 18 Jul | Honoured |
| Never point tests at the live `bom_db` | ongoing | Honoured — throwaway DBs; DDL verified via rolled-back transactions |
| Token-frugal working; survive session limits | 18 Jul | Honoured |
| Ask permission per execution step | ongoing | Honoured |
| UI redesign deferred: "we will sit on the ui later first complete the rest" | 09 Aug | Held — only additive UI since |

---

## 3. Concrete asks that were never closed

### 3.1 Never answered at all

| # | The ask | Date | State |
|---|---|---|---|
| 1 | **"how close is our tool with openboxes.com"** | 19 Jul | **Never answered.** OpenBoxes is inventory/supply-chain for health systems — a different competitor set from OpenBOM. No comparison exists in any doc. |
| 2 | **"and with frappe.io/erpnext"** | 19 Jul | **Never answered.** ERPNext is a full ERP; whether we compete, integrate or ignore was never addressed. |
| 3 | **"is this tool ready to deploy in linux, mac, windows"** | 18 Jul | **Partially.** Docker compose is cross-platform; the desktop installer is Windows-only (`signtool`, Inno Setup). No mac/linux desktop build. |

### 3.2 Asked twice, still open

**"RECOMMENDED_MAJOR_IMPROVEMENTS.md — everything done from this??"** (1 Aug, asked twice).
Answer: **no.** Status of its 9 improvements, verified against code today:

| # | Improvement | Priority | Status |
|---|---|---|---|
| 1 | Wire ~66 MOCK + 31 PARTIAL screens to real APIs | Critical | **Substantially done** — honesty wave + 4 new screens closed most; ~19 stranded backends remain |
| 2 | `window.*` shim → ES module migration | High | **Not finished** — 20 files under `src/root/` still use `window.*` |
| 3 | OpenAPI-typed client / contract-first | High | **Not started** — no generated types directory |
| 4 | State-management consolidation | High | **Not started** |
| 5 | Performance: chunking, re-renders | Medium | **Not started** — no `manualChunks`; build still warns on a 1.7 MB chunk |
| 6 | Postgres index / cascade review | High | **Partly** — FK indexes added, migration 059 landed; no full cascade audit |
| 7 | Real E2E coverage + CI gating | High | **Done** — 54-route sweep, Playwright in CI, both gates required |
| 8 | Code-signing + auto-update hardening | Med–High | **Partly** — `signtool` path exists in `desktop/build.py` gated on `CODE_SIGN_PFX`; unsigned in practice |
| 9 | Genuinely-missing PLM features | High | **Done** — effectivity, multi-UOM, real import, CAD connectors, requirements all shipped |

### 3.2b A requirements spreadsheet was handed over and never fully reconciled

> *"is it able to scan doc(ocr), will i be able to upload cad files, and is the bom tool
> contains this level of details — if not just answer what all are missing"*
> — with a Google Sheets link (session `d47bc498`; link redacted from the corpus)

**Partly answered.** OCR is real and reachable (`/api/v1/ocr` + `OCRScreen.jsx`); CAD upload is
real and reachable (`/api/v1/cad` + `CadConnectorsScreen.jsx`). But the *spreadsheet itself* — the
user's own list of required detail fields — was never walked row by row against the data model.
That is the single most valuable unreconciled artefact in the project: it is the customer's own
definition of done, and nobody has diffed it against `app/models/`.

**Recommended:** ask for that sheet again and reconcile it field by field. Everything else in this
document is my judgement of what matters; that sheet is *theirs*.

### 3.3 User-reported bugs never confirmed fixed

| # | Report | Date | State |
|---|---|---|---|
| 5 | "when i try to edit components edit page not working" | 19 Jul | Unverified — no test covers the component edit page |
| 6 | "still getting logged out from supplier portal" | 19 Jul | Unverified — supplier-portal session handling never re-tested |
| 7 | `Uncaught ReferenceError: Cannot access 'Oe' before initialization` | 19 Jul | Probably fixed by later build changes; never explicitly confirmed |
| 8 | Desktop installer: "nothing opened except blank terminal" | 19 Jul | Fixed (4 launch bugs, `a8ba8d0`) — Windows only |

### 3.4 Housekeeping asked for, never done

| # | The ask | Date | State |
|---|---|---|---|
| 9 | "you will have all the unwanted files right — shift them into a new folder" | 11 Jul | Partly — old generations archived, but scratch files still accumulate at the repo root |

---

## 4. What is missing right now, independent of who asked

From a 72-capability re-verification against source on 16 Aug (not against documentation).
Counts: **24 solid and reachable · 19 built but unwired · 19 weaker than rivals · 10 absent.**

All ten gaps the 2 Aug analysis called critical are now **closed** — that document, which still
scores the product at "61% vs OpenBOM, 49% reachable", is stale and should not be quoted.

### 4.1 Built and working, with no way to reach it

The dominant theme. Engineering is paid for; the last mile is not built.

| Capability | What the buyer loses | Effort |
|---|---|---|
| **Global full-text search** | The most-used feature in any BOM tool. A 317-line ranked FTS engine spans parts, vendors, BOMs, POs, documents, ECOs, work orders, inventory, NCRs — and ⌘K only filters rows already in the browser. | Low |
| **Generate POs from a BOM** | The highest-value action a BOM tool performs, and exactly what OpenBOM markets. No button exists. | Medium |
| **Formula / calculated attributes** | OpenBOM's headline spreadsheet feature. Evaluator exists; head-to-head we look like flat text fields. | Low |
| **Backup / restore / PITR** | Nine routes over 1,100 lines, invisible. On-prem is the core claim and the DR story cannot be demonstrated. | Medium |
| **Session management** | No admin can see who is logged in or revoke a session. Standard security-review checklist item. | Low |
| **CAD derivatives (STEP/PDF/DWG)** | "Where's the STEP file?" has no answer in the UI. | Low |
| **Country-of-origin history** | Tariff/trade exposure rollup unreachable; entries cannot be added or corrected. | One file |

### 4.2 Correctness bugs a trial would hit

| Bug | Consequence | State |
|---|---|---|
| Client-side cost roll-up ignores the correct server numbers | Per-sub-assembly cost wrong below two levels; won't reconcile with the total above it | Open |
| Revision rollback iterated Column objects | Every part rollback returned 500 | **Fixed 16 Aug** |
| `inventory` / `quality` missing from audit allowlist | Both endpoints 500 **after** persisting — user told it failed when it succeeded | **Fixed 16 Aug** |
| Part file upload drops `partId` | File uploads succeed but never attach to the part | Open |
| Release-snapshot posts the wrong shape | "Release BOM" 422s every time, then toasts "Failed to release BOM" | Open |

### 4.3 Genuine feature gaps versus the field

Need building, not wiring. Ordered by how often they decide a PLM evaluation.

- **Revision / baseline compare** — cannot answer "what changed between Rev B and Rev C of this assembly", the canonical PLM question. Today you can only diff against a different BOM.
- **ECO does not apply its change** — after "implement", parts and BOM lines are untouched. It is a paperwork record, not a change engine.
- **Approved-vendor list** — no way to add a second source or mark a vendor preferred.
- **Multi-currency costing** — vendor prices cannot be held in native currency or rolled up in a reporting currency.
- **Document versioning** — re-uploading a revised drawing yields two rows both claiming version 1.
- **BOM-level permissions** — RBAC is role/resource-type only; no object id ever enters the check, so "who can edit WHICH BOM" cannot be expressed.
- **Public read-only BOM link** for an external supplier — no share table, no route.
- **Multi-level BOM import** — `import_bom()` returns `{"import_status": "not_implemented"}`.

### 4.4 Deployability

- **Zero GitHub Actions secrets and zero environments are configured.** `deploy-staging` and `deploy-production` are deliberately inert; pointing them at `master` would make them fire and fail, painting master red without deploying.
- The deploy script runs `docker compose pull backend`, but `docker-compose.yml` builds from source and never references the GHCR image CI publishes — so even with secrets it would not deploy what CI built.
- Desktop installer is Windows-only.

---

## 5. The one-line answer

The product is **further along than its own documentation says**, and the remaining distance to
OpenBOM is mostly **wiring and honesty, not engineering**. Nineteen finished backends need a UI
path, nine places in the interface need to stop asserting things that are not true, and roughly
eight genuine features need building — of which revision/baseline compare and "ECO actually
applies the change" are the two that most decide a PLM evaluation.
