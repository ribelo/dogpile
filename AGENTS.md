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
