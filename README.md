# Hearth Apps

A collection of open-source demo apps for [Hearth](https://ourhearth.ai) — the private family workspace platform.

Each app is a subdirectory containing a complete Hearth app (`playground.json`, source files, `SKILL.md`). Install them via the `demo-apps` skill in your Hearth workspace, or fork them as starting points for your own apps.

## Apps

### Google Workspace

Connect Google accounts and expose Calendar, Gmail, and Google Drive tools to the agent. Each connected account's capabilities are determined by the scopes granted during OAuth — users pick what to request when connecting an account.

**Capabilities:** Calendar (read + write), Gmail (read + compose drafts), Google Drive (read)

**Tools:** `list_calendar_events`, `get_calendar_event`, `create_calendar_event`, `list_emails`, `get_email`, `compose_draft`, `list_drive_files`, `stat_drive_file`, `read_drive_file`

## Installing

In your Hearth workspace, ask the agent: "Install the Google Workspace demo app." The `demo-apps` skill fetches the files from this repo and writes them into your `Apps/` directory.

## License

MIT — see [LICENSE](LICENSE). Fork freely.
