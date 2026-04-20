# Pandaroo

A local spool tracker for Bambu Lab printers. Uses the RFID chip on
each spool to identify what's loaded in your AMS.

> ⚠️ **Preview.** Under active development, no stable release yet.
> Expect breaking changes and bugs. Use at your own risk.

Pandaroo connects to each printer over MQTT and reads the AMS state
as it changes. Every Bambu spool is identified by the variant id
stamped on its RFID tag, so the same roll is recognized whether you
move it between slots or printers.

## Features

* Live dashboard of every AMS slot: color, material, remaining
  weight, match status.
* Inventory of every spool the app has seen, with first-seen and
  last-used timestamps.
* Timeline of each spool's loads, unloads, AMS updates, scans, and
  manual adjustments.
* Manual remaining-weight adjustment when the AMS isn't reporting one.
* English and French.

## Why RFID

Most Bambu trackers compare material names and hex colors to guess
which filament is loaded. That's fine until Bambu renames a product
or ships a slightly different shade, and then you get a wrong match.
Pandaroo reads the RFID variant id printed on every genuine Bambu
spool and looks it up in a community-maintained catalog
([`piitaya/bambu-spoolman-db`](https://github.com/piitaya/bambu-spoolman-db)).
If the variant is in the catalog, the match is exact. If it isn't,
the app tells you.

## Slot statuses

| Badge        | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| Known        | Recognized Bambu spool from the community catalog       |
| Unknown      | Looks like a Bambu spool, not yet in the catalog        |
| Third party  | Non-Bambu spool, or a spool without an RFID tag         |
| Unidentified | Spool detected but the printer has no info about it yet |
| Empty        | Slot has no filament loaded                             |

## Getting started

### Docker

```bash
docker run -d --name pandaroo \
  -p 4000:4000 \
  -v $(pwd)/data:/data \
  ghcr.io/piitaya/pandaroo:beta
```

Then open [http://localhost:4000](http://localhost:4000).

Docker Compose (save as `docker-compose.yml`, then
`docker compose up -d`):

```yaml
services:
  pandaroo:
    image: ghcr.io/piitaya/pandaroo:beta
    container_name: pandaroo
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/data
```

#### Image tags

| Tag            | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| `latest`       | Most recent stable release (nothing yet, still in preview)   |
| `beta`         | Most recent beta release (recommended for now)               |
| `edge`         | Latest commit on `main`, unstable                            |
| `0.1.0-beta.2` | Pin to an exact version                                      |

### From source

Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```

For production: `npm run build && npm start`.

## First-time setup

1. Go to **Settings → Printers** and add your printer: name, IP,
   serial, access code. The serial and access code are on the
   printer's touchscreen, under *Settings → Device* and
   *Settings → Network → LAN-only mode*.
2. Load a spool in the AMS. Pandaroo picks up the RFID reading and
   starts tracking it.

## Privacy and security

* Outbound connections: your printers on the LAN, and GitHub (once
  a day) to refresh the filament catalog. Nothing else.
* No accounts, no analytics, no telemetry.
* Printer access codes are stored in `config.json` inside `DATA_DIR`.
* There's no authentication and no rate limiting. Run Pandaroo on
  your LAN. For remote access, put it behind an authenticated
  reverse proxy.

## Under the hood

* **Backend**: Fastify + TypeScript. One MQTT client per printer
  (port 8883, TLS, LAN-only mode), streaming AMS state as it changes.
  SQLite via Drizzle and better-sqlite3.
* **Matching**: the RFID variant id is looked up in the cached
  [`bambu-spoolman-db`](https://github.com/piitaya/bambu-spoolman-db)
  catalog. No fuzzy name matching, no hex comparisons.
* **Storage**: a `spools` table (one row per RFID tag), plus
  `spool_history`, an append-only event log with types `ams_load`,
  `ams_unload`, `ams_update`, `scan`, and `adjust`. Migrations live
  in `backend/drizzle/`.
* **Real-time**: the backend publishes Server-Sent Events on
  `/api/events`. The frontend subscribes on mount and invalidates
  the matching TanStack Query caches.
* **Frontend**: React 19 + Vite + [Mantine](https://mantine.dev) 7,
  TanStack Query for server state, react-i18next for translations.
* **API docs**: Swagger UI at `/docs`. Includes
  `POST /api/spools/scan` if you want to register spools from an
  external NFC reader.

### Environment variables

| Var          | Default   | Purpose                                                       |
| ------------ | --------- | ------------------------------------------------------------- |
| `PORT`       | `4000`    | HTTP port                                                     |
| `HOST`       | `0.0.0.0` | Bind address                                                  |
| `DATA_DIR`   | `./data`  | Where the SQLite DB, `config.json`, and `filaments.json` live |
| `LOG_LEVEL`  | `info`    | `fatal`, `error`, `warn`, `info`, or `debug`                  |
| `LOG_FORMAT` | `pretty`  | Set to `json` for machine-readable output                     |

### Logging

Logs go to stdout. The default `info` level covers printer
connections, new spool detections, errors, and config changes.
`LOG_LEVEL=debug` adds AMS heartbeats and connection diagnostics.

```yaml
services:
  pandaroo:
    environment:
      - LOG_LEVEL=debug
      - LOG_FORMAT=json
```

Common failures:

* `errorCode="unauthorized"`: wrong access code.
* `Printer not responding`: wrong IP, printer off, or port 8883
  blocked by a firewall.

## License

MIT, see [LICENSE](LICENSE).
