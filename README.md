# Dogpile 🐕

Dog adoption aggregator that scrapes Polish shelters, enriches data with AI, and presents dogs in a searchable interface.

## What It Does

1. **Scrapes shelter websites** - Adapters extract dog listings from 25+ Polish shelters
2. **AI enrichment** - OpenRouter models analyze photos and descriptions to extract structured data (breed estimates, personality tags, physical traits)
3. **Photo generation** - Creates professional portraits and artistic variations
4. **Vector search** - Embeddings enable semantic dog matching
5. **Web interface** - Astro + SolidJS frontend with admin panel

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  scraper-       │     │  scraper-       │     │  photo-         │
│  scheduler      │────▶│  processor      │────▶│  generator      │
│  (cron)         │     │  (queue)        │     │  (queue)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │      D1         │     │      R2         │
                        │   (SQLite)      │     │   (Photos)      │
                        └─────────────────┘     └─────────────────┘
                               │
                               ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     web         │◀────│      api        │────▶│    embedder     │
│  (Astro+Solid)  │     │   (Effect-TS)   │     │  (Vectorize)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Apps

| App | Description |
|-----|-------------|
| `apps/api` | Effect-TS API worker - REST endpoints, queue producers |
| `apps/web` | Astro + SolidJS + Tailwind frontend with admin panel |
| `apps/scraper-processor` | Queue consumer - runs scrapers, AI extraction |
| `apps/scraper-scheduler` | Cron trigger - enqueues shelters for scraping |
| `apps/photo-generator` | Queue consumer - AI photo generation |
| `apps/embedder` | Queue consumer - generates embeddings for Vectorize |

### Packages

| Package | Description |
|---------|-------------|
| `packages/core` | Domain types, Effect services, schemas, AI clients |
| `packages/db` | Drizzle schema for D1, migrations |
| `packages/scrapers` | Shelter adapter interface + registry |
| `packages/cli` | Unified CLI for local development |

## Tech Stack

- **Runtime**: Bun
- **Backend**: Cloudflare Workers, Effect-TS
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (photos)
- **Queues**: Cloudflare Queues (job processing)
- **Search**: Cloudflare Vectorize (embeddings)
- **Frontend**: Astro, SolidJS, Tailwind CSS
- **AI**: OpenRouter (text extraction, photo analysis, image generation, embeddings)

## Prerequisites

- [Bun](https://bun.sh/) (runtime, package manager, test runner)
- [Node.js](https://nodejs.org/) 22+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (Cloudflare CLI)
- Cloudflare account with Workers, D1, R2, Queues, Vectorize
- OpenRouter API key

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Copy the example and fill in your keys:

```bash
cp .env.example apps/api/.dev.vars
cp .env.example apps/scraper-processor/.dev.vars
cp .env.example apps/embedder/.dev.vars
```

**Required:**

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `ADMIN_KEY` | Secret key for admin endpoints |

**Model configuration (optional, has defaults):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `MODEL_TEXT_EXTRACTION` | `x-ai/grok-4.1-fast` | Extract structured data from descriptions |
| `MODEL_PHOTO_ANALYSIS` | `google/gemini-3-flash-preview` | Analyze dog photos |
| `MODEL_DESCRIPTION_GEN` | `google/gemini-3-flash-preview` | Generate dog bios |
| `MODEL_EMBEDDING` | `google/gemini-embedding-001` | Vector embeddings |
| `MODEL_IMAGE_GEN` | `bytedance-seed/seedream-4.5` | Generate professional portraits |

For the web app, create `apps/web/.dev.vars`:

```
ADMIN_KEY=dev-admin-key-123
PUBLIC_API_URL=http://localhost:8787
PUBLIC_ADMIN_KEY=dev-admin-key-123
```

### 3. Cloudflare Resources

Create these resources in your Cloudflare dashboard:

- **D1 Database**: `dogpile-db`
- **R2 Buckets**: `dogpile` (originals), `dogpile-generated` (AI photos)
- **KV Namespace**: for sessions
- **Queues**: `dogpile-scrape-jobs`, `dogpile-image-jobs`, `dogpile-reindex-jobs`, `dogpile-photo-gen-jobs`
- **Vectorize Index**: `dogpile-dogs`

Update the IDs in `apps/*/wrangler.toml` files.

### 4. Run Migrations

```bash
bun run db:migrate
```

### 5. Seed Shelters

```bash
bun run cli scrape seed
```

## Development

### Start Dev Server

```bash
bun run dev
```

This runs:
- API worker on `http://localhost:8787`
- Web frontend on `http://localhost:4321`

### Full Dev (with all workers)

```bash
bun run dev:workers:full
```

Includes embedder and photo-generator workers for complete pipeline testing.

## CLI Commands

All commands via `bun run cli`:

### Database Sync

```bash
bun run cli db pull    # Download remote D1 → local SQLite
bun run cli db push    # Upload local → remote D1 (upsert by fingerprint)
bun run cli db validate # Check data integrity
```

### R2 Sync

```bash
bun run cli r2 pull    # Download remote R2 → local
bun run cli r2 push    # Upload local → remote R2
```

### Scraping

```bash
bun run cli scrape list                    # List all scrapers
bun run cli scrape run <shelter-id>        # Dry run (no AI, no save)
bun run cli scrape process <shelter-id>    # Full pipeline: scrape → AI → save

# Options
--limit N           # Process only first N dogs
--concurrency N     # Parallel AI requests (default: 10)
--generate-photos   # Also generate AI photos
```

### Photo Generation

```bash
bun run cli photos status     # Show dogs needing photos
bun run cli photos generate   # Generate missing photos
bun run cli photos clear      # Clear generated photos
```

## Local Development Workflow

**Important**: Remote Cloudflare bindings (`--remote` flag) are broken on NixOS. Use local mode with sync:

```bash
# 1. Pull latest production data
bun run cli db pull

# 2. Start dev server (uses local D1/R2)
bun run dev

# 3. Scrape a shelter locally
bun run cli scrape process schronisko-poznan --limit 5

# 4. Push new dogs to production
bun run cli db push
```

## Adding a New Scraper

1. Create adapter in `packages/scrapers/src/adapters/<shelter-id>.ts`
2. Register in `packages/scrapers/src/adapters/index.ts`
3. Add shelter to database via admin panel or migration
4. Test: `bun run cli scrape run <shelter-id>`

Scraper requirements:
- Use `linkedom` for HTML parsing (never regex)
- Each dog must have `sourceUrl` pointing to its detail page
- Extract from detail pages, not listing previews

## Key Concepts

- **Fingerprint**: Scraper-generated unique hash for deduplication
- **Two-pass AI**: Text extraction → Photo analysis, results merged
- **Queue envelope**: All async jobs use shared `JobEnvelope<T,P>` pattern
- **Effect services**: All async operations use Effect-TS for composition

## Testing

```bash
bun test                 # All tests
bun test <file>          # Single file
bun run typecheck        # TypeScript check
```

## Deployment

Each app deploys independently to Cloudflare:

```bash
cd apps/api && wrangler deploy
cd apps/web && bun run build && wrangler pages deploy dist
```

## Production URLs

- **API**: `https://dogpile-api.extropy.club`
- **Web**: `https://dogpile.extropy.club` (when configured)

## Issue Tracking

Uses [beads (bd)](https://github.com/ribelo/beads) for git-backed issue tracking:

```bash
bd ready              # Find unblocked work
bd create "Title"     # Create issue
bd show <id>          # View details
bd close <id>         # Complete work
bd sync               # Sync with git
```

## License

MIT
