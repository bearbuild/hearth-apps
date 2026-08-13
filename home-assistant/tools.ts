// Tools for the Hearth Home Assistant integration
// These tools run in a sandboxed worker isolate (no DOM, no npm imports).

interface Config {
  baseUrl: string;
}

// Helper to load the Home Assistant configuration (base URL)
async function getBaseUrl(): Promise<string> {
  try {
    const file = await playground.open(".playground/local/home-assistant/config.json");
    const content = await file.read();
    const config: Config = JSON.parse(content);
    if (typeof config.baseUrl !== "string" || !/^https:\/\//i.test(config.baseUrl.trim())) {
      throw new Error("Set an HTTPS Home Assistant base URL in .playground/local/home-assistant/config.json before using the app.");
    }
    // Remove trailing slash if present
    return config.baseUrl.replace(/\/$/, "");
  } catch (err: any) {
    throw new Error(`Failed to load Home Assistant configuration: ${err.message}. Check .playground/local/home-assistant/config.json.`);
  }
}

// Tool 1: Get the current states of all media players
export async function get_media_states() {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/states`;

  const res = await capabilities.integrations.fetch("home-assistant", url);
  if (!res.ok) {
    throw new Error(`Home Assistant API returned status ${res.status}: ${await res.text()}`);
  }

  const states = await res.json();
  if (!Array.isArray(states)) {
    throw new Error("Unexpected response structure from Home Assistant states API.");
  }

  // Filter for media-player entities
  const mediaPlayers = states.filter((entity: any) => entity.entity_id.startsWith("media_player."));

  return {
    media_players: mediaPlayers.map((entity: any) => ({
      entity_id: entity.entity_id,
      state: entity.state, // 'on', 'off', 'playing', 'paused', 'idle', or 'unavailable'
      name: entity.attributes.friendly_name || entity.entity_id,
      volume: entity.attributes.volume_level != null ? Math.round(entity.attributes.volume_level * 100) : null,
      is_muted: entity.attributes.is_volume_muted || false,
      current_media: entity.attributes.media_title ? {
        title: entity.attributes.media_title,
        artist: entity.attributes.media_artist || null,
        album: entity.attributes.media_album_name || null,
        app: entity.attributes.app_name || null
      } : null,
      active_source: entity.attributes.source || null,
      available_sources: entity.attributes.source_list || []
    }))
  };
}

// Tool 2: Send control commands to media players
interface ControlInput {
  entity_id: string;
  command: "play" | "pause" | "play_pause" | "turn_on" | "turn_off" | "volume_up" | "volume_down" | "set_volume" | "mute" | "unmute" | "select_source";
  volume_level?: number;
  source?: string;
}

export async function control_media(input: ControlInput) {
  const { entity_id, command, volume_level, source } = input;
  const baseUrl = await getBaseUrl();

  // Map user commands to Home Assistant service endpoints and payloads
  let domain = "media_player";
  let service = "";
  let payload: any = { entity_id };

  switch (command) {
    case "play":
      service = "media_play";
      break;
    case "pause":
      service = "media_pause";
      break;
    case "play_pause":
      service = "media_play_pause";
      break;
    case "turn_on":
      service = "turn_on";
      break;
    case "turn_off":
      service = "turn_off";
      break;
    case "volume_up":
      service = "volume_up";
      break;
    case "volume_down":
      service = "volume_down";
      break;
    case "set_volume":
      if (volume_level == null || volume_level < 0 || volume_level > 1) {
        throw new Error("Setting volume requires a 'volume_level' between 0.0 and 1.0.");
      }
      service = "volume_set";
      payload.volume_level = volume_level;
      break;
    case "mute":
      service = "volume_mute";
      payload.is_volume_muted = true;
      break;
    case "unmute":
      service = "volume_mute";
      payload.is_volume_muted = false;
      break;
    case "select_source":
      if (!source) {
        throw new Error("Selecting a source requires a 'source' parameter (e.g. 'Spotify', 'YouTube').");
      }
      service = "select_source";
      payload.source = source;
      break;
    default:
      throw new Error(`Unsupported command: ${command}`);
  }

  const url = `${baseUrl}/api/services/${domain}/${service}`;

  const res = await capabilities.integrations.fetch("home-assistant", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Failed to call service ${domain}/${service}: ${await res.text()}`);
  }

  return {
    success: true,
    message: `Successfully executed '${command}' on ${entity_id}`
  };
}

// Tool 3: Fetch a raw endpoint from Home Assistant API
interface FetchInput {
  endpoint: string;
  method?: "GET" | "POST";
  body?: any;
}

export async function fetch_ha_endpoint(input: FetchInput) {
  const { endpoint, method = "GET", body } = input;
  const baseUrl = await getBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const fetchInit: any = {
    method,
    headers: {}
  };

  if (method === "POST" && body) {
    fetchInit.headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(body);
  }

  const res = await capabilities.integrations.fetch("home-assistant", url, fetchInit);
  
  // If it's a JSON response, parse it. Otherwise return raw text.
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    return { status: res.status, data };
  } else {
    const text = await res.text();
    return { status: res.status, text };
  }
}

