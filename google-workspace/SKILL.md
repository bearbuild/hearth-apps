---
name: google-workspace
description: Configure which Google Calendar, Gmail, and Google Drive tools the agent can use.
capabilities:
  integrations: ["google-composio"]
---

# Google Workspace App

Connects Google accounts and exposes Calendar, Gmail, and Google Drive tools to the agent.

## Connections are per service, not per account

This is the single most important fact about this app. Google is reached through the **Google via Composio** provider, where **Calendar, Gmail, and Drive are three separate connections** — even for the same person, even for the same email address. One consent pass links exactly one of them.

Consequences to hold onto:

- `capabilities.integrations.list("google-composio")` returns **one entry per service**, so a single Google account can appear up to three times with the same `label`. Group by `label` before showing accounts to a user.
- Each entry's `scopes` are that service's scopes only. An account connected for Calendar carries no Gmail scopes, and that is normal, not a misconfiguration.
- A user can perfectly well have Calendar connected and Drive not. Partial setup is the expected steady state, not an error.
- **Each service's scope set is fixed** by the workspace operator's Composio auth config. Connecting Gmail grants read *and* draft-compose together; there is no draft-only Gmail connection. Passing fewer `scopes` to `connect()` selects **which service to link next** — it does not narrow what that service grants.

## Setup

1. Open the app's page.
2. Click **Connect a Google account** (or **Connect more services or another account**).
3. Check the services you want the agent to use:
   - **Google Calendar** — read events and create them *(on by default)*
   - **Gmail** — read messages and compose drafts *(**off by default** — see security note below)*
   - **Google Drive** — read-only file access *(on by default)*
4. Click **Connect**. Each checked service opens its **own** Google consent step, one after another; the app drives them in sequence and reports what landed. The app stays open throughout.

To remove a service, disconnect that connection in **Settings → Integrations**.

> Note: Gmail's `compose` scope is required to create drafts and also technically allows sending. This app only creates drafts via `compose_draft`, and the platform refuses Gmail send outright for this provider.

### Why Gmail is off by default

Gmail is unchecked by default, and the connect form shows a security tooltip (ⓘ) explaining why. Email content comes from untrusted senders, so granting the agent inbox read access introduces two attack vectors:

1. **Prompt injection** — A crafted email can contain hidden instructions that attempt to make the agent follow attacker commands instead of (or in addition to) the member's real requests.
2. **Credential / sensitive-data leakage** — Inbox messages routinely contain password resets, verification codes, and other secrets. An agent with read access may surface or act on these in unintended ways.

Because a Gmail connection always carries read access, **the only way to withhold inbox reading is to not connect Gmail at all.** Members who want drafting must accept reading with it. Removing it later means disconnecting the Gmail connection in Settings → Integrations.

## Per-member permissions

This app uses `account: "per-member"` for the Google via Composio integration, which means:

- **Each member connects their own Google account.** One member's connection is not used for another member's data — the server never silently substitutes a housemate's account.
- **Agent tool calls resolve to the current member's account automatically.** When you're chatting with the agent, the Google tools use your own calendar, inbox, and Drive.
- **The app page shows which Google accounts are connected** and which services each one covers.
- **Background / scheduled runs** have no current member, so they may need an explicit `connection`.

### Account-selection procedure for agents

1. **Omit `connection` by default — including in a normal chat turn.** The server resolves two things per call: whose account, and (for this provider) **which service** the target URL addresses. Passing `connection` overrides both. A connection id pinned from a Calendar call will be used verbatim for a Gmail call, which then runs as an account that cannot serve it and fails upstream with an opaque error. Let the server choose.
2. **Do not pre-check scopes before calling a tool.** If no account serves the needed service, the call returns a "not connected" error, and *that call* is what raises the in-app connect prompt for the user. Checking `list()` first and refusing to call is how a missing service stays missing forever. Make the call; report the error you get.
3. **When a service isn't connected, say so plainly and point at the app page.** For example: "Drive isn't connected yet — open the Google Workspace app and connect Google Drive." Do not suggest Settings → Integrations for connecting; that page only reviews and revokes.
4. **Pass `connection` only when you genuinely mean one account**: after a 409 (`{ error, integration, candidates }` — pick from the candidates or ask the user), or in an email/scheduled/background turn where there is no current member. Get the id from `capabilities.integrations.list("google-composio")`, and pick a row whose `scopes` cover the tool you're about to call:
   - `calendar.readonly` / `calendar.events` → `list_calendar_events`, `get_calendar_event`, `create_calendar_event`
   - `gmail.readonly` / `gmail.compose` → `list_emails`, `get_email`, `compose_draft`
   - `drive.readonly` → `list_drive_files`, `stat_drive_file`, `read_drive_file`
5. **If more than one account is eligible, do not guess** — use the label/owner to ask the user which one.
6. **Never try to widen access yourself.** Connecting a service is a user-facing action on the app's page.

## Tools

All tools are always declared in the manifest, but each one only works once its **service** is connected — so Calendar tools can work while Gmail tools report "not connected", and that is the normal partial state, not a failure of the app:

- `list_calendar_events` — list upcoming events from a Google Calendar, defaulting to the primary calendar.
- `get_calendar_event` — get a single Google Calendar event by ID.
- `create_calendar_event` — create an event. Requires summary, start, and end.
- `list_emails` — list Gmail messages, with optional search query and labels.
- `get_email` — retrieve the full content of a Gmail message by ID.
- `compose_draft` — compose a Gmail draft without sending it.

### Google Drive

- `list_drive_files` — list or search files in Google Drive. Use the `q` parameter with Drive query syntax (e.g. `"name contains 'budget'"`, `"mimeType='application/vnd.google-apps.document' and trashed=false"`). Supports pagination via `pageToken`.
- `stat_drive_file` — get metadata for a single Google Drive file by ID.
- `read_drive_file` — read a file's content. Images and PDFs are returned as native model content parts, while Google Docs, Sheets, Slides, and Drawings are exported to text or image formats.

## Notes

- Gmail search queries use the same syntax as the Gmail search bar (e.g. `from:alice@example.com subject:invoice newer_than:2d`).
- Calendar datetimes should be ISO 8601. `start`/`end` can use `dateTime` + `timeZone` or `date` for all-day events.
- Google Drive query syntax uses the `q` parameter (e.g. `"name contains 'budget' and trashed=false"`). See [Google Drive query strings](https://developers.google.com/drive/api/guides/search-files) for full syntax.
- `read_drive_file` returns content in the model's native format: images as `image-data`, PDFs as `file-data`, and text as `text`. The host decides whether the current model can view media — the tool just emits the correct part with the correct mediaType.
- All tools run as worker tools, so they work in background and email turns with no browser open.
- Request bodies go through Composio as JSON only. File **downloads** work (`read_drive_file`); uploads do not, and Gmail send is refused by the platform.
- Every tool takes an optional `connection`. Leave it unset unless step 4 of the selection procedure applies — it disables per-service account resolution.
