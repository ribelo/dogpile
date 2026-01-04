# Repository Guidelines

## Project Structure

## CRITICAL: Cloudflare Remote Bindings are BROKEN

**NEVER use these - they fail silently on NixOS:**
- `--remote` flag with wrangler commands
- `remote = true` in wrangler.toml bindings

Instead, use **local D1/R2 with sync commands**:

| Command | Description |
|---------|-------------|
| `bun run cli db pull` | Remote D1 → Local SQLite |
| `bun run cli db push` | Local SQLite → Remote D1 |
| `bun run cli r2 pull` | Remote R2 → Local R2 |
| `bun run cli r2 push` | Local R2 → Remote R2 |

## Unified CLI

All project commands are available through a unified CLI:

```bash
bun run cli --help
```

### Database Commands

Local development uses **local SQLite** for D1. Sync with production:

| Command | Description |
|---------|-------------|
| `bun run cli db pull` | Download all data from remote D1 → local SQLite |
| `bun run cli db push` | Upload local data → remote D1 (upsert by fingerprint) |

### Scraper Commands

| Command | Description |
|---------|-------------|
| `bun run cli scrape list` | List all available scrapers |
| `bun run cli scrape run <id>` | Fetch and display dogs (no AI, no save) |
| `bun run cli scrape process <id>` | Full pipeline: scrape → AI → save to local D1 |

Options for `scrape process`:
- `--limit N` - Process only first N dogs
- `--concurrency N` - Parallel AI requests (default: 10)

**Workflow:**
1. `bun run cli db pull` - Get latest production data
2. `bun run dev` - Develop locally with local D1
3. `bun run cli scrape process <shelter-id>` - Scrape and process dogs
4. `bun run cli db push` - Push new dogs to production

**Note:** `db:push` uses `ON CONFLICT(fingerprint)` upsert - it will update existing dogs and insert new ones. It does NOT delete dogs that aren't in local.

```
dogpile/
├── apps/
│   ├── api/                 # Effect-based API worker
│   ├── embedder/            # OpenRouter → Vectorize worker
│   ├── scraper-processor/   # Queue consumer with adapters
│   ├── scraper-scheduler/   # Cron → enqueue shelters
│   └── web/                 # Astro + SolidJS + Tailwind
├── packages/
│   ├── core/                # Domain types, Effect services, schemas
│   ├── db/                  # Drizzle schema for D1
│   └── scrapers/            # Shelter adapter interface + registry
```

## Build, Test & Development

| Command | Description |
|---------|-------------|
| `bun install` | Install all workspace dependencies |
| `bun run dev` | Run all apps in dev mode |
| `bun run build` | Build all apps |
| `bun run typecheck` | TypeScript check all packages |
| `bun test` | Run tests |
| `bun run db:generate` | Generate D1 migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run cli db pull` | Sync remote D1 → local SQLite |
| `bun run cli db push` | Sync local SQLite → remote D1 |
| `bun run cli scrape list` | List scrapers |
| `bun run cli scrape process <id>` | Scrape shelter |

## Coding Style

- **Runtime**: Bun for build, test, package management
- **Backend**: Effect-TS for all async operations
- **Backend**: Effect-TS for all async operations
- **CLI**: Use `@effect/cli` for all command-line interfaces
- **ORM**: Drizzle for D1 schema
- **Frontend**: Astro + SolidJS + Tailwind
- **Formatting**: 2-space indent, no semicolons (follow existing code)
- **Naming**: camelCase for variables/functions, PascalCase for types/components

<!-- effect-solutions:start -->
## Effect Best Practices

**Before implementing Effect features**, run `effect-solutions list` and read the relevant guide.

Topics include: services and layers, data modeling, error handling, configuration, testing, HTTP clients, CLIs, observability, and project structure.

**Effect Source Reference:** `third-party/effect`
Search here for real implementations when docs aren't enough.
<!-- effect-solutions:end -->

## Testing

- Framework: Bun test runner
- Run: `bun test` or `bun test <file>`
- Test files: `*.test.ts` alongside source

## Commit Guidelines

- Use imperative mood: "Add feature" not "Added feature"
- Keep subject under 50 chars, body under 72
- Reference issues when applicable

## Issue Tracking

This project uses **bd (beads)** for issue tracking.

| Command | Description |
|---------|-------------|
| `bd ready` | Find unblocked work |
| `bd create "Title" --type task` | Create issue |
| `bd show <id>` | View issue details |
| `bd close <id>` | Complete work |
| `bd sync` | Sync with git |

## Key Concepts

- **Fingerprint**: Scraper-provided unique hash for deduplication (not AI-derived)
- **Adapters**: Each shelter has a code adapter in `packages/scrapers/src/adapters/`
- **Two-pass AI**: Text extraction → Photo extraction, results merged
- **R2 Buckets**: `dogpile-photos-original` (scraped), `dogpile-photos-generated` (AI)

## Session Completion

Before ending work:
1. Run `bun run typecheck`
2. Update/close issues with `bd close <id>`
3. Commit and push: `git push`
4. Sync beads: `bd sync`

## Testing Guidelines

- Tests live in `tests/` directory at package/app root
- Name test files `*.test.ts` matching source structure
- Add regression tests for scrapers, schema changes, and AI extraction logic
- Use fixtures for snapshot testing shelter HTML parsing
- Test adapter edge cases: missing fields, malformed HTML, encoding issues

## Quality & Design Tenets

- Ship the simplest design that satisfies requirements; delete stale code
- Keep logic where the work happens with literal names proven by tests
- Make ownership and data flow explicit in types; favor pure functions
- Effect-TS for composition over runtime lookups or implicit state

## Functional & Complexity Discipline

- Keep functions referentially transparent; surface state via explicit parameters
- Compose behavior through Effect services and layers, not hidden dependencies
- Cut scope before adding knobs—stop and fix anything that feels confusing

## Commit & Pull Request Guidelines

- Conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:`
- Keep commits single-purpose
- PRs must link bd issues, list validation commands
- Log follow-ups as bd issues, not comments
- Optimize for maintainability over backward compatibility

## Engineering Workflow & Safety

- Work as: Reason → Decision → Plan → Code
- Start tasks with a conceptual checklist, enumerate constraints/unknowns
- Compare minimal designs, document failure modes before coding
- Record assumptions and stick to the plan; revise explicitly if inputs change

## Mandatory Safety Rules

- Keep control flow acyclic: no recursion or unbounded loops
- Bound every loop and justify limits; add guards for uncertain iterations
- Functions stay under ~60-70 logical lines; refactor when larger
- Never ignore return values; surface explicit error handling with Effect
- Declare variables in narrowest scope; avoid reuse for different purposes
- Eliminate TypeScript errors; fix code rather than suppress with `as any`

## Discipline & Pragmatism

- Safety outranks performance, performance outranks developer convenience
- Default to explicit types; avoid `any` and excessive type inference
- Keep Effect services pure where practical; centralize state in layers
- Estimate resource budgets (API calls, DB queries) up front
- Avoid unnecessary abstraction—ship the boring solution first
- Invest in actionable logging and structured error messages

## TypeScript & Effect Conventions

- Use Effect for all async operations; avoid raw Promises in core logic
- Prefer `Schema` for validation over runtime checks
- Pre-define error types with `Data.TaggedError`
- Keep Effect pipelines readable; extract complex logic to named functions
- Test positive and negative paths equally; add regression tests before fixes

## Communication & Collaboration

- Ask clarifying questions when requirements are ambiguous
- Recommend simpler designs when an approach feels over-engineered
- Capture decisions in repo artifacts (AGENTS.md, bd issues), not chat
- Surface open questions quickly via bd issues

## Pre-Merge Checklist

Before merging, verify:
- All packages typecheck
- Bounded loops with explicit limits
- Functions under 60-70 lines
- Zero TypeScript errors
- Negative test cases present
- bd issues updated
- All review findings fixed (P1-P99)

```bash
bun run typecheck
bun test
bd sync
```
