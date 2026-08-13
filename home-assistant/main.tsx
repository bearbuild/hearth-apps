import { createRoot } from "https://esm.sh/react-dom@19/client";
import { useEffect, useState } from "https://esm.sh/react@19";

interface MediaPlayer {
  entity_id: string;
  state: string;
  name: string;
  volume: number | null;
  is_muted: boolean;
  current_media: {
    title: string;
    artist: string | null;
    album: string | null;
    app: string | null;
  } | null;
  active_source: string | null;
  available_sources: string[];
}

function SmartHomeApp() {
  const [config, setConfig] = useState<{ baseUrl: string } | null>(null);
  const [players, setPlayers] = useState<MediaPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [platformReady, setPlatformReady] = useState(false);

  // Safely open file using window.playground
  const loadConfig = async () => {
    try {
      const pg = (window as any).playground;
      if (!pg) {
        throw new Error("Hearth platform is not initialized yet.");
      }
      const file = await pg.open(".playground/local/home-assistant/config.json");
      const content = await file.read();
      const parsed = JSON.parse(content);
      if (typeof parsed.baseUrl === "string" && /^https:\/\//i.test(parsed.baseUrl.trim())) {
        setConfig(parsed);
        setError(null);
        return parsed;
      } else {
        setConfig(null);
        setError("Configuration required");
        setLoading(false);
        return null;
      }
    } catch (err: any) {
      setConfig(null);
      setError(`Configuration error: ${err.message}`);
      setLoading(false);
      return null;
    }
  };

  // Fetch states from Home Assistant API
  const fetchStates = async (currentConfig = config) => {
    if (!currentConfig) return;
    setLoading(true);
    try {
      const caps = (window as any).capabilities;
      if (!caps || !caps.integrations) {
        throw new Error("Hearth integrations capability is not ready.");
      }

      const url = `${currentConfig.baseUrl.replace(/\/$/, "")}/api/states`;
      const res = await caps.integrations.fetch("home-assistant", url);
      
      if (!res.ok) {
        throw new Error(`Home Assistant API returned status ${res.status}`);
      }

      const states = await res.json();
      if (!Array.isArray(states)) {
        throw new Error("Unexpected states response structure");
      }

      const mediaPlayers = states
        .filter((entity: any) => entity.entity_id.startsWith("media_player."))
        .map((entity: any) => ({
          entity_id: entity.entity_id,
          state: entity.state,
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
        }));

      setPlayers(mediaPlayers);
      setError(null);
    } catch (err: any) {
      setError(`Failed to fetch states: ${err.message}. Please verify your Home Assistant URL and Token.`);
    } finally {
      setLoading(false);
    }
  };

  // Call Home Assistant service
  const callService = async (entityId: string, service: string, payload: any = {}) => {
    if (!config) return;
    setStatusMessage(`Sending ${service}...`);
    try {
      const caps = (window as any).capabilities;
      if (!caps || !caps.integrations) {
        throw new Error("Hearth integrations are not ready.");
      }

      const url = `${config.baseUrl.replace(/\/$/, "")}/api/services/media_player/${service}`;
      const res = await caps.integrations.fetch("home-assistant", url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: entityId, ...payload })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      setStatusMessage(`Command sent successfully!`);
      setTimeout(() => setStatusMessage(null), 3000);
      
      // Refresh states
      await fetchStates();
    } catch (err: any) {
      alert(`Service Call Failed: ${err.message}`);
      setStatusMessage(null);
    }
  };

  // Initialize and handle platform loading race-conditions on mobile
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let isActive = true;

    const initPlatform = async () => {
      // 1. Wait for hearthReady if it exists
      if ((window as any).hearthReady) {
        try {
          await (window as any).hearthReady;
        } catch (e) {
          console.error("Hearth ready error:", e);
        }
      }

      // 2. Poll briefly for playground and capabilities globals
      let attempts = 0;
      while (isActive && (!(window as any).playground || !(window as any).capabilities) && attempts < 100) {
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }

      if (!isActive) return;

      const pg = (window as any).playground;
      if (pg) {
        setPlatformReady(true);
        const cfg = await loadConfig();
        if (cfg) fetchStates(cfg);

        // 3. Watch for config edits
        try {
          unsub = pg.watch(".playground/local/home-assistant/config.json", async () => {
            if (!isActive) return;
            const latestCfg = await loadConfig();
            if (latestCfg) fetchStates(latestCfg);
          });
        } catch (e) {
          console.error("Failed to set up config watcher:", e);
        }
      } else {
        setError("Hearth platform services failed to load. Please reload the page.");
        setLoading(false);
      }
    };

    initPlatform();

    return () => {
      isActive = false;
      if (unsub) {
        try {
          unsub();
        } catch (e) {}
      }
    };
  }, []);

  // Show a clean loading state instead of crashing while platform is loading
  if (!platformReady && !error) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center" style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", justifyContent: "center", minHeight: "150px" }}>
        <span className="text-2xl animate-spin">🔄</span>
        <p className="text-sm text-muted-foreground">Initializing Smart Home Connection...</p>
      </div>
    );
  }

  if (error === "Configuration required" || !config) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3 border-b pb-4 border-border">
          <span className="text-3xl">🏠</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Home Assistant Media Controller</h1>
            <p className="text-sm text-muted-foreground">Control media players connected to Home Assistant from Hearth</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">🛠️ Configuration Steps</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configure a secure Home Assistant endpoint and a Hearth HTTP proxy to enable media control.
          </p>

          <ol className="list-decimal list-inside space-y-3 text-sm text-foreground">
            <li>
              <strong>Expose your Home Assistant securely</strong> to the internet (e.g., using 
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono mx-1">Nabu Casa / Home Assistant Cloud</span> or a 
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono mx-1">Cloudflare Tunnel</span>).
            </li>
            <li>
              <strong>Generate a Long-Lived Access Token</strong> in your Home Assistant profile page.
            </li>
            <li>
              <strong>Add the HTTP Proxy in Hearth</strong>:
              <ul className="list-disc list-inside ml-6 mt-1.5 text-muted-foreground space-y-1">
                <li>Go to <a href="/settings/integrations" className="text-primary hover:underline font-medium">Settings → Integrations</a>.</li>
                <li>Add an <strong>HTTP Proxy</strong>.</li>
                <li>Name: <code className="bg-muted px-1 rounded text-xs text-foreground font-mono">home-assistant</code></li>
                <li>Base URL: your secure Home Assistant URL</li>
                <li>Store the Home Assistant Bearer token in the proxy configuration only; do not put it in this app's files.</li>
              </ul>
            </li>
            <li>
              <strong>Tell the agent your Home Assistant URL</strong>:
              <p className="mt-1 text-muted-foreground">
                Tell Hearth the same secure HTTPS URL used by the proxy, and the agent will configure <code className="bg-muted px-1 rounded text-xs text-foreground font-mono">.playground/local/home-assistant/config.json</code> for you. Never share your access token in chat.
              </p>
            </li>
          </ol>

          <div className="pt-4 flex gap-3">
            <button
              onClick={async () => {
                const cfg = await loadConfig();
                if (cfg) fetchStates(cfg);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 text-sm transition-colors"
            >
              🔄 Refresh / Check Configuration
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activePlayers = players.filter(p => p.state !== "off" && p.state !== "unavailable");
  const inactivePlayers = players.filter(p => p.state === "off" || p.state === "unavailable");

  return (
    <div className="p-6 max-w-4xl mx-auto" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Container */}
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          <span className="text-3xl" style={{ marginRight: "20px", flexShrink: 0 }}>🏠</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ margin: 0, padding: 0, lineHeight: 1 }}>Smart Home Media</h1>
            <p className="text-sm text-muted-foreground" style={{ margin: 0, padding: 0, lineHeight: 1 }}>Connected to Home Assistant</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {statusMessage && (
            <span className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded animate-pulse">
              {statusMessage}
            </span>
          )}
          <button
            onClick={() => fetchStates()}
            disabled={loading}
            className="p-2 border border-border hover:bg-muted rounded-md transition-colors text-foreground text-sm"
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Explicitly Spaced Header Divider */}
      <hr className="border-t border-border/80" style={{ margin: 0, padding: 0 }} />

      {/* Main Content Area */}
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {error && (
          <div className="bg-destructive/15 border border-destructive/30 text-destructive rounded-lg p-4 text-sm">
            ⚠️ {error}
          </div>
        )}

        {players.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 border border-border border-dashed rounded-lg">
            No media-player entities were discovered in Home Assistant. Verify the desired devices are configured in HA.
          </div>
        )}

        {/* Active Section */}
        {players.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ margin: 0 }}>Active Devices</h2>
            {activePlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic bg-muted/5 border border-border border-dashed p-6 rounded-xl text-center">
                No active playback or powered-on devices.
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
                {activePlayers.map((player) => {
                  const isSpeaker = player.entity_id.includes("speaker") || player.entity_id.includes("audio") || player.name.toLowerCase().includes("speaker") || player.name.toLowerCase().includes("audio");
                  const isDisplay = player.entity_id.includes("tv") || player.entity_id.includes("display") || player.name.toLowerCase().includes("tv") || player.name.toLowerCase().includes("display");
                  const isPlaying = player.state === "playing";
                  const isOn = player.state !== "off" && player.state !== "unavailable";

                  return (
                    <div key={player.entity_id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col justify-between" title={player.entity_id}>
                      {/* Card Header with standard non-fractional padding */}
                      <div className="border-b border-border bg-muted/25" style={{ padding: "16px 20px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                          <span className="text-base" style={{ marginRight: "20px", flexShrink: 0 }}>{isDisplay ? "📺" : isSpeaker ? "🔊" : "🎵"}</span>
                          <h3 className="font-bold text-sm tracking-tight text-foreground" style={{ margin: 0 }}>{player.name}</h3>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          player.state === "playing" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {player.state.toUpperCase()}
                        </span>
                      </div>

                      {/* Card Body with standard spacing to prevent compression */}
                      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* Current Media Info & Inline Play/Pause Button */}
                        {player.current_media ? (
                          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground" style={{ margin: 0 }}>Now Playing</p>
                              <p className="font-medium text-foreground text-sm line-clamp-1 leading-snug" style={{ margin: 0 }}>{player.current_media.title}</p>
                              {player.current_media.artist && (
                                <p className="text-xs text-muted-foreground line-clamp-1" style={{ margin: 0 }}>{player.current_media.artist}</p>
                              )}
                              {player.current_media.app && (
                                <p className="text-[10px] text-primary font-medium" style={{ margin: 0 }}>App: {player.current_media.app}</p>
                              )}
                            </div>
                            
                            {/* Labeled Play/Pause Button using explicit HA services */}
                            <button
                              onClick={() => callService(player.entity_id, isPlaying ? "media_pause" : "media_play")}
                              className="px-3.5 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors flex-shrink-0 shadow-sm text-xs"
                              style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "6px" }}
                            >
                              <span>{isPlaying ? "⏸️" : "▶️"}</span>
                              <span>{isPlaying ? "Pause" : "Play"}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="bg-muted/10 border border-dashed border-border/60 rounded-lg" style={{ padding: "16px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                            <span className="text-xs text-muted-foreground italic">No active media playback</span>
                            
                            {/* Fallback Labeled Play Button */}
                            <button
                              onClick={() => callService(player.entity_id, "media_play")}
                              className="px-3 py-1.5 text-xs font-semibold border border-border hover:bg-muted rounded-md transition-colors"
                              style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "6px" }}
                            >
                              <span>▶️</span>
                              <span>Play</span>
                            </button>
                          </div>
                        )}

                        {/* Volume & Mute in single clean row with standard integers */}
                        {isOn && player.volume !== null && (
                          <div className="bg-muted/20 rounded-lg border border-border/40" style={{ padding: "8px 16px", display: "flex", flexDirection: "row", alignItems: "center", gap: "12px" }}>
                            <button
                              onClick={() => callService(player.entity_id, "volume_mute", { is_volume_muted: !player.is_muted })}
                              className="text-sm p-1 hover:bg-muted rounded text-foreground transition-colors"
                              title={player.is_muted ? "Unmute" : "Mute"}
                            >
                              {player.is_muted ? "🔇" : "🔊"}
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={player.volume}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) / 100;
                                callService(player.entity_id, "volume_set", { volume_level: val });
                              }}
                              className="flex-1 accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{player.volume}%</span>
                          </div>
                        )}

                        {/* Sources */}
                        {isOn && player.available_sources.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider" style={{ margin: 0 }}>Sources</p>
                            <div className="flex flex-wrap" style={{ gap: "4px" }}>
                              {player.available_sources.map((src) => {
                                const isActive = player.active_source === src;
                                return (
                                  <button
                                    key={src}
                                    onClick={() => callService(player.entity_id, "select_source", { source: src })}
                                    className={`text-[10px] px-2.5 py-1 rounded transition-all border ${
                                      isActive
                                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                                        : "bg-muted text-muted-foreground border-border hover:bg-muted"
                                    }`}
                                  >
                                    {src}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Optional power control for display-like media players */}
                        {isDisplay && isOn && (
                          <div className="border-t border-border/60" style={{ paddingTop: "14px", marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => callService(player.entity_id, "turn_off")}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold flex items-center gap-1 transition-colors"
                            >
                              🔌 Turn Off Display
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Explicit Divider with zero-collapsing padding block */}
        {activePlayers.length > 0 && inactivePlayers.length > 0 && (
          <div style={{ padding: "16px 0" }}>
            <hr className="border-t border-border/70" style={{ margin: 0, padding: 0 }} />
          </div>
        )}

        {/* Standby / Offline Section */}
        {inactivePlayers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground" style={{ margin: 0 }}>Standby & Offline</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
              {inactivePlayers.map((player) => {
                const isSpeaker = player.entity_id.includes("speaker") || player.entity_id.includes("audio") || player.name.toLowerCase().includes("speaker") || player.name.toLowerCase().includes("audio");
                const isDisplay = player.entity_id.includes("tv") || player.entity_id.includes("display") || player.name.toLowerCase().includes("tv") || player.name.toLowerCase().includes("display");
                return (
                  <div key={player.entity_id} className="border border-border rounded-xl bg-muted/10 hover:bg-muted/20 transition-all" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }} title={player.entity_id}>
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                      <span className="text-base" style={{ marginRight: "16px", flexShrink: 0 }}>{isDisplay ? "📺" : isSpeaker ? "🔊" : "🎵"}</span>
                      <h4 className="font-semibold text-xs text-foreground" style={{ margin: 0 }}>
                        {player.name}
                        <span className="text-[10px] text-muted-foreground font-normal lowercase" style={{ marginLeft: "8px" }}>
                          ({player.state})
                        </span>
                      </h4>
                    </div>
                    
                    {isDisplay && (
                      <button
                        onClick={() => callService(player.entity_id, "turn_on")}
                        className="px-2.5 py-1 text-[10px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-all flex-shrink-0 shadow-sm"
                      >
                        Power On
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default (root: HTMLElement) => {
  const r = createRoot(root);
  r.render(<SmartHomeApp />);
  return () => r.unmount();
};