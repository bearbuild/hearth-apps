---
name: google-workspace
description: Configure which Google Calendar, Gmail, and Google Drive tools the agent can use.
capabilities:
  integrations: ["google"]
---

# Google Workspace App

Connects Google accounts and exposes Calendar, Gmail, and Google Drive tools to the agent. Each connected account's capabilities are determined by the scopes granted during the OAuth connect flow — the app passes only the selected scopes to `capabilities.integrations.connect("google", { scopes })`, so Google's consent screen asks for exactly what the user chose.

## Setup

1. Open the app's page.
2. Click **Connect a Google account** (or **Add another Google account** if one is already linked).
3. Check the capabilities you want the agent to use for this account:
   - **Read calendar events** — `calendar.readonly` *(on by default)*
   - **Create calendar events** — `calendar.events` *(on by default)*
   - **Read emails** — `gmail.readonly` *(**off by default** — see security note below)*
   - **Compose email drafts** — `gmail.compose` *(on by default)*
   - **Read Google Drive files** — `drive.readonly` *(on by default)*
4. Click **Connect**. The app calls `capabilities.integrations.connect("google", { scopes })` with only the selected scopes, opening Google's OAuth consent popup. The app stays open; when the popup resolves, the new account appears in the connected-accounts list with its granted capabilities shown as badges.

To change an existing account's capabilities, disconnect it from Google and reconnect with the desired scopes — the checkboxes only appear during the connect flow, not for already-linked accounts.

> Note: Gmail's `compose` scope is required to create drafts, and it also technically allows sending messages. This app only creates drafts via `compose_draft`; it does not send email.

### Why email reading is off by default

The "Read emails" capability is unchecked by default, and the connect form shows a security info tooltip (ⓘ) explaining the risk. Email content comes from untrusted senders, so granting the agent inbox read access introduces two attack vectors:

1. **Prompt injection** — A crafted email can contain hidden instructions that attempt to make the agent follow attacker commands instead of (or in addition to) the member's real requests.
2. **Credential / sensitive-data leakage** — Inbox messages routinely contain password resets, verification codes, and other secrets. An agent with read access may surface or act on these in unintended ways.

Members who need email reading should opt in explicitly by checking the box during the connect flow, after reviewing the tooltip. The capability can always be removed by disconnecting and reconnecting without it.

## Per-member permissions

This app uses `account: "per-member"` for the Google integration, which means:

- **Each member connects their own Google account.** One member's connection is not used for another member's data — the server never silently substitutes a housemate's account.
- **Agent tool calls resolve to the current member's account automatically.** When you're chatting with the agent, the Google tools use your own calendar, inbox, and Drive.
- **The app page shows which Google accounts are connected** and their granted capabilities, so you can see who's set up.
- **Background / scheduled runs** (no current member) must pass a specific `connection` ID. Never rely on automatic selection in an email, scheduled, or other headless run.

### Account-selection procedure for agents

1. **Identify the execution context.** For an interactive chat, omit `connection` unless the user explicitly identifies a different connected account; per-member routing then selects the current member's account.
2. **For an email, scheduled, or background turn, select explicitly.** Use `capabilities.integrations.list("google")` to enumerate connected accounts and their granted `scopes`. Choose a connection whose `scopes` include the scope required by the requested tool:
   - `calendar.readonly` → `list_calendars`, `list_calendar_events`, `get_calendar_event`
   - `calendar.events` → `create_calendar_event`
   - `gmail.readonly` → `list_emails`, `get_email`
   - `gmail.compose` → `compose_draft`
   - `drive.readonly` → `list_drive_files`, `stat_drive_file`, `read_drive_file`
3. **Pass the selected ID as the tool's `connection` argument.** For example: `list_calendar_events({ connection: "conn_…", ... })`. This is the app-tool equivalent of passing `init.connection` to the integration request.
4. **If there is more than one eligible account, do not guess.** Use the account label/owner from the connected-account list when available, or ask the user which account to use. If no eligible account exists, explain that the corresponding scope must be granted by reconnecting the account via the Google Workspace app; do not silently broaden permissions.
5. **Respect granted scopes.** A tool may only be used when its matching scope has been granted for the chosen connection. Adding a scope is a user-facing action (reconnecting via the app page), not an agent-side default.

## Tools

All tools are always declared in the manifest, but each one only works against accounts that have the corresponding scope granted:

- `list_calendars` — list all calendars available to a connected account, including each calendar’s ID, display name, access role, and primary status. Use this to discover shared-calendar IDs such as `Family`.
- `list_calendar_events` — list upcoming events from a calendar (defaults to `primary`, max 10).
- `get_calendar_event` — get a single event by calendar ID and event ID.
- `create_calendar_event` — create an event. Requires `summary`, `start`, and `end`.
- `list_emails` — list Gmail messages, with optional search query and labels.
- `get_email` — retrieve the full content of a message by ID.
- `compose_draft` — compose a Gmail draft without sending it.

### Google Drive

- `list_drive_files` — list or search files in Google Drive. Use the `q` parameter with Drive query syntax (e.g. `"name contains 'budget'"`, `"mimeType='application/vnd.google-apps.document' and trashed=false"`). Supports pagination via `pageToken`.
- `stat_drive_file` — get metadata for a single file by ID (name, mimeType, size, modifiedTime, webViewLink, etc.).
- `read_drive_file` — read a file's content. Images and PDFs are returned as native model content parts (image-data / file-data) so vision and PDF-capable models can view them directly. Google Docs export to markdown, Sheets to CSV, Slides to plain text, and Drawings to PNG — unless `mimeType` overrides the export format. Text files are returned as text. Files over 15 MB are refused with a text message.

## Notes

- Gmail search queries use the same syntax as the Gmail search bar (e.g. `from:alice@example.com subject:invoice newer_than:2d`).
- Calendar datetimes should be ISO 8601. `start`/`end` can use `dateTime` + `timeZone` or `date` for all-day events.
- Google Drive query syntax uses the `q` parameter (e.g. `"name contains 'budget' and trashed=false"`). See [Google Drive query strings](https://developers.google.com/drive/api/guides/search-files) for full syntax.
- `read_drive_file` returns content in the model's native format: images as `image-data`, PDFs as `file-data`, text as `text`. The host decides whether the current model can view media — the tool just emits the correct part with the correct `mediaType`. Use `stat_drive_file` to inspect metadata (size, `webViewLink`) without downloading content.
- All tools run as worker tools, so they work in background and email turns with no browser open.
