# Local Development: Scrapers & Queues

## Scraper Workflow

To test scrapers and the full processing pipeline locally:

1.  **Seed Shelters**: Ensure your local database has shelters to scrape.
    ```bash
    nix develop -c bun run cli scrape seed
    ```

2.  **Start Local Environment**: Run the full stack including simulated workers and queues.
    ```bash
    nix develop -c bun run dev:e2e
    ```

3.  **Trigger a scrape**:
    - Open `/admin` and click **Scrape Now** for a shelter, or
    - Use CLI (optional): `nix develop -c bun run cli scrape process <shelter-id>`

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

---
*Note: All commands MUST be run inside `nix develop` to ensure native modules like `sharp` work correctly.*
