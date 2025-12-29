# Repository Guidelines

## Project Structure

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

## Coding Style

- **Runtime**: Bun for build, test, package management
- **Backend**: Effect-TS for all async operations
- **Backend**: Effect-TS for all async operations
- **CLI**: Use `@effect/cli` for all command-line interfaces
- **ORM**: Drizzle for D1 schema
- **Frontend**: Astro + SolidJS + Tailwind
- **Formatting**: 2-space indent, no semicolons (follow existing code)
- **Naming**: camelCase for variables/functions, PascalCase for types/components

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

```bash
bun run typecheck
bun test
bd sync
```
