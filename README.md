# Hearth Apps

A collection of open-source demo apps for [Hearth](https://ourhearth.ai) — the private family workspace platform.

Each app is a subdirectory containing a complete Hearth app (`playground.json`, source files, `SKILL.md`). Install them via the `demo-apps` skill in your Hearth workspace, or fork them as starting points for your own apps.

## Installing

In your Hearth workspace, ask the agent: "Install the Google Workspace demo app." The `demo-apps` skill fetches the files from this repo and writes them into your `Apps/` directory.

## Apps

### Google Workspace

Connect Google accounts and expose Calendar, Gmail, and Google Drive tools to the agent. Each connected account's capabilities are determined by the scopes granted during OAuth — users pick what to request when connecting an account.

**Capabilities:** Calendar (read + write), Gmail (read + compose drafts), Google Drive (read)

**Tools:** `list_calendar_events`, `get_calendar_event`, `create_calendar_event`, `list_emails`, `get_email`, `compose_draft`, `list_drive_files`, `stat_drive_file`, `read_drive_file`

### Presentations

Create and present Markdown slide decks with reveal.js. Supports frontmatter, horizontal and vertical slides, Mermaid diagrams, syntax-highlighted code, speaker notes, live updates, and a warm light/dark theme. The app includes a neutral sample deck that is copied into the workspace's `Presentations` folder on first launch.

**Capabilities:** Read/write access to `Presentations`; network access to `esm.sh`; presentation display support

### Travel Map

A shared, demo-ready world map for tracking which countries and US states each configured household member has visited or wants to visit. Travel data and optional email mappings stay in the installing workspace's private app-data directory; the published app contains only generic code and sample setup instructions.

**Capabilities:** Public map and atlas data via CDN; optional Google identity lookup to default to a configured member's view

**Tools:** `tag_visit` — mark or clear a configured member's visited or wants-to-visit status for a country or US state

### Home Assistant Media Control

Control media players connected to a Home Assistant instance from a Hearth page or through agent tools. The app discovers `media_player.*` entities at runtime, displays current playback and volume state, and supports playback, power, mute, volume, and source-selection commands.

The app is portable and contains no instance-specific URL, entity IDs, device names, or access tokens. Each Hearth workspace stores its non-secret Home Assistant base URL in its private per-app data file at `.playground/local/home-assistant/config.json`. Home Assistant credentials stay in a Hearth HTTP proxy named `home-assistant`.

**Capabilities:** Home Assistant HTTP proxy integration

**Tools:** `get_media_states`, `control_media`, `fetch_ha_endpoint`

**Setup:** Add an HTTPS HTTP proxy named `home-assistant`, store a Home Assistant Bearer token in that proxy, then tell the Hearth agent the non-secret base URL so it can write the workspace-local config file. See [`home-assistant/SETUP.md`](home-assistant/SETUP.md).

## License

MIT — see [LICENSE](LICENSE). Fork freely.
