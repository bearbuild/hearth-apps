---
name: home-assistant
description: Teach the agent how to control media players through a Hearth Home Assistant integration.
---

# Home Assistant media control

This app controls media players exposed by Home Assistant. It is intentionally
portable: device names and entity IDs are discovered at runtime rather than
hard-coded in the app.

## Setup

Read [[Apps/home-assistant/SETUP.md]] before using the app in a new Hearth
workspace. The app needs:

- An HTTP proxy integration named `home-assistant`.
- A configured Home Assistant base URL in `.playground/local/home-assistant/config.json`.
- An HTTPS Home Assistant endpoint and a long-lived access token stored only in
  the proxy configuration, never in workspace files.

## Agent workflow

1. Call `get_media_states` first when the target entity is unknown or when the
   current playback state matters.
2. Match the user's request to the returned `entity_id`, `name`, state, and
   available sources. Do not assume a particular room, brand, or device.
3. Use `control_media` for playback, power, volume, mute, and source changes.
4. Use `fetch_ha_endpoint` only for diagnostics or an endpoint the user
   explicitly requests.

## Command guidance

- `play`, `pause`, and `play_pause` control playback.
- `turn_on` and `turn_off` control power where the entity supports it.
- `volume_up` and `volume_down` make small adjustments.
- `set_volume` takes a value from `0.0` to `1.0`.
- `mute` and `unmute` control muting.
- `select_source` requires a source listed by `get_media_states`.

If the Home Assistant call fails, report the returned status or error and ask
the user to verify the proxy, URL, token, and entity availability. Never ask
the user to put an access token in `config.json` or any other app file.
