# Local Development: Scrapers & Queues

## Scraper Workflow

To test scrapers and the full processing pipeline locally:

0.  **(Optional) Sync prod → local**: Pull current shelters + dogs from remote D1, then re-seed local-only shelters.
    ```bash
    nix develop -c bun run cli db pull
    nix develop -c bun run cli scrape seed
    ```

1.  **Seed Shelters**: Ensure your local database has shelters to scrape.
    ```bash
    nix develop -c bun run cli scrape seed
    ```

2.  **Start Local Environment**: Run the full stack including simulated workers and queues.
    ```bash
    nix develop -c bun run dev
    ```
    If you want to run all workers (including embedder + photo generator), use:
    ```bash
    nix develop -c bun run dev:workers:full
    nix develop -c bun run dev:web
    ```

3.  **Trigger a scrape**:
    - Open `/admin` and click **Scrape Now** for a shelter, or
    - Use CLI (optional): `nix develop -c bun run cli scrape process <shelter-id>`

4.  **Scrape all shelters (bulk)**:
    ```bash
    nix develop -c bun run cli scrape enqueue-all
    ```

## Monitoring & Constraints

- **Admin Dashboard**:
  - View enqueued jobs: `/admin/queue`
  - View processed dogs: `/admin/dogs?status=pending`

- **Visibility**:
  - Publicly available dogs are shown at `/dogs` (only `available` status).
  - Newly scraped dogs land in `pending` and won't appear on the public page until they are made `available`.

- **Queue Limitations**:
  - Local queues are simulated via **Miniflare**.
  - There is no UI to list individual queue messages or peek into the queue body.
  - Rely on terminal output in the window where `dev:e2e` is running to monitor processor progress.

- **Local D1 is SQLite**:
  - Print the current local DB path with: `nix develop -c bun run cli db path`

---
*Note: All commands MUST be run inside `nix develop` to ensure native modules like `sharp` work correctly.*
