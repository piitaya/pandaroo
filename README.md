# Bambu Spoolman Sync

Track the spools loaded in your Bambu Lab AMS, and optionally sync
them to [Spoolman](https://github.com/Donkie/Spoolman). Uses the RFID
chip on each spool, so matches are exact.

> ⚠️ **Preview.** Under active development, no stable release yet.
> Expect breaking changes and bugs. Use at your own risk.

## What it does

* Shows every AMS slot in a simple dashboard: color, material,
  remaining weight, and which of your spools is loaded.
* Recognizes spools by their RFID chip, so the same roll is always
  identified even if you move it between printers or slots.
* Keeps a history of every spool it has seen, so you always know
  what's in your drawer. Click a spool to tweak its remaining weight
  or remove it.
* Optionally syncs everything to Spoolman, either on demand or
  automatically whenever the AMS changes. Spoolman is nice to have,
  not required.

## Why it's different

Most Bambu→Spoolman tools guess matches by transforming material names
and comparing hex colors. That breaks when Bambu renames a product or
ships a slightly different color.

This app uses the **RFID variant id** stamped on every genuine Bambu
spool, looked up in a community list at
[`piitaya/bambu-spoolman-db`](https://github.com/piitaya/bambu-spoolman-db).
A spool either has an exact match (sync it) or it doesn't (the app
tells you why).

## Slot status at a glance

The dashboard shows what the printer is reporting right now
alongside what you already know about that spool.

| Badge        | Meaning                                                     |
| ------------ | ----------------------------------------------------------- |
| Mapped       | Recognized Bambu spool, ready to sync with Spoolman         |
| Unmapped     | Recognized Bambu spool but no Spoolman match yet            |
| Unknown      | Looks like a Bambu spool we've never seen                   |
| Third party  | Non-Bambu spool, or a spool without an RFID tag             |
| Unidentified | Spool detected but the printer has no info about it yet     |
| Empty        | Slot has no filament loaded                                 |

Only **Mapped** slots sync today. Everything else is shown with an
explanation so you know what's blocking.

## Getting started

### With Docker (easiest)

```bash
docker run -d --name bambu-spoolman-sync \
  -p 4000:4000 \
  -v $(pwd)/data:/data \
  ghcr.io/piitaya/bambu-spoolman-sync:beta
```

Open [http://localhost:4000](http://localhost:4000) and follow the UI.

Or with Docker Compose — save as `docker-compose.yml` and run
`docker compose up -d`:

```yaml
services:
  bambu-spoolman-sync:
    image: ghcr.io/piitaya/bambu-spoolman-sync:beta
    container_name: bambu-spoolman-sync
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/data
```

#### Image tags

| Tag            | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| `latest`       | Most recent stable release (nothing here yet, preview)   |
| `beta`         | Most recent beta release                                 |
| `edge`         | Latest commit on `main`, unstable                        |
| `0.1.0-beta.2` | Pin to an exact version                                  |

While the project is in preview, the recommended tag is **`beta`**
(or pin to an exact version). `latest` will only start moving once
there's a stable release.

### From source

Requires Node.js 20+.

```bash
npm install
npm run dev       # dev mode with hot reload
```

For production: `npm run build && npm start`.

## First-time setup

1. Add your printer on the Printers page. You'll need its name, IP
   address, serial number, and access code. The serial and access code
   are on the printer's touchscreen under *Settings → Device* and
   *Settings → Network → LAN-only mode*.
2. On the Sync page, enter your Spoolman URL (e.g.
   `http://spoolman.local:7912`) and save. A green indicator confirms
   the connection.
3. Optionally turn on auto-sync so the app pushes changes as soon as
   the AMS reports them. Otherwise use the *Sync all* button.
4. Optionally turn on "archive on empty" to have Spoolman archive a
   spool when it hits 0%.

## Privacy

* Outbound connections: your printers (local network), your Spoolman
  instance, and GitHub (to refresh the spool list). Nothing else
  phones home.
* No analytics, no telemetry, no accounts.
* Access codes stay in `config.json` on your machine.

## Roadmap

* Improve onboarding (guided first-run, clearer error messages,
  better defaults).
* Sync unrecognized spools too, by creating a Spoolman filament from
  the AMS info as a fallback.
* Opt-in reporting of unrecognized spools back to `bambu-spoolman-db`.

## Under the hood

For the curious:

* **Backend**: Fastify + TypeScript. It connects to each printer over
  MQTT on the local network and reads the AMS slot state as it
  changes.
* **Matching** is deterministic: the RFID variant id on each spool is
  looked up in the cached
  [`bambu-spoolman-db`](https://github.com/piitaya/bambu-spoolman-db)
  catalog, which knows the matching Spoolman filament. No fuzzy name
  matching, no hex comparisons.
* **Storage**: a local SQLite database holds your spool history and
  the Spoolman sync status, so everything survives restarts. Config
  and the cached catalog live next to it in `DATA_DIR`.
* **Syncing**: the app talks to Spoolman over its REST API. When a
  spool is new to Spoolman, the filament (and its vendor) is created
  on the fly. Existing spools are matched by a `tag` extra field set
  to the RFID UID, so the same roll is updated instead of duplicated.
* **Frontend**: React + Vite + [Mantine](https://mantine.dev),
  TanStack Query for server state, react-i18next for translations
  (English and French).

### Environment variables

| Var          | Default   | Purpose                                                    |
| ------------ | --------- | ---------------------------------------------------------- |
| `PORT`       | `4000`    | HTTP port                                                  |
| `HOST`       | `0.0.0.0` | Bind address                                               |
| `DATA_DIR`   | `./data`  | Where the SQLite DB, `config.json`, and `filaments.json` live |
| `LOG_LEVEL`  | `info`    | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`  |
| `LOG_FORMAT` | `pretty`  | Set to `json` for machine-readable JSON output             |

### Logging

Logs are written to stdout in human-readable format by default. At `info` level (the default) you see printer connections, new spools, errors, and config changes. Set `LOG_LEVEL=debug` for detailed diagnostics (AMS heartbeats, Spoolman HTTP calls, sync details).

```yaml
# docker-compose.yml
services:
  bambu-spoolman-sync:
    environment:
      - LOG_LEVEL=debug        # verbose output for troubleshooting
      - LOG_FORMAT=json         # machine-readable (for log aggregation)
```

Common messages to look for when troubleshooting:

* **`Printer connection error` with `errorCode="unauthorized"`** — wrong access code
* **`Printer not responding`** — wrong IP, printer off, or firewall blocking port 8883
* **`Spoolman request failed`** — Spoolman URL is wrong or Spoolman is down
* **`Spool skipped` with `reason="not_matched"`** — spool variant not in the community filament catalog

## License

MIT, see [LICENSE](LICENSE).
