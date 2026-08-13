# Setup for Hearth

This app is designed to use a Hearth HTTP proxy so Home Assistant credentials
stay outside the app directory. Configure it once per Hearth workspace.

## 1. Prepare Home Assistant

1. Make Home Assistant reachable from Hearth over HTTPS. Use a secure external
   endpoint or an HTTPS reverse proxy; do not expose an unencrypted HTTP
   endpoint.
2. Create a dedicated long-lived access token in Home Assistant.
3. Give the token only the access needed to read media-player state and call
   media-player services.

## 2. Add the Hearth HTTP proxy

In Hearth, open `/settings/integrations` and add an HTTP proxy with:

- **Name:** `home-assistant`
- **Base URL:** the HTTPS base URL for the Home Assistant instance
- **Authentication:** a Bearer token using the Home Assistant access token

The proxy name must match the integration ID in `playground.json`. The token is
stored by Hearth and must not be copied into this app's files.

## 3. Tell the agent the app URL

Tell the Hearth agent the same HTTPS Home Assistant base URL used by the proxy.
The agent can update [[.playground/local/home-assistant/config.json]] for you:

```json
{
  "baseUrl": "https://your-home-assistant-host/"
}
```

Keep the trailing slash optional. Do not share or add an `Authorization`
header, token, username, password, household name, hostname belonging to a
private network, or any other secret or identifying information to this file.
The agent should only receive the non-secret HTTPS base URL.

## 4. Verify the installation

1. Open the Home Assistant app in Hearth.
2. Use **Refresh** to load media-player entities.
3. If the app is being driven by the agent, call `get_media_states` first.
4. Test a harmless operation such as reading state or adjusting volume by a
   small amount before using power or source-selection commands.

The app discovers entities dynamically from `/api/states`; no room names,
brands, or entity IDs need to be added to the app directory.

## Troubleshooting

- **Configuration required:** tell the agent the non-secret HTTPS base URL so it
  can set `baseUrl` in [[.playground/local/home-assistant/config.json]].
- **401 or 403:** recreate or replace the Home Assistant token in the Hearth
  proxy; do not put it in the app file.
- **404 or connection failure:** verify that the proxy base URL and
  [[.playground/local/home-assistant/config.json]] use the same reachable Home
  Assistant URL.
- **No media players:** confirm that the desired devices are available as
  `media_player.*` entities in Home Assistant.
- **Permission prompt:** approve the app's `home-assistant` integration
  capability in Hearth, then retry the request.
