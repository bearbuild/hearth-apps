import { createRoot } from "https://esm.sh/react-dom@19/client";
import { useEffect, useMemo, useRef, useState, useCallback } from "https://esm.sh/react@19";
import type { Map as MapLibreMap, PointLike } from "https://esm.sh/maplibre-gl@5.1.0";
import {
  CONFIG_PATH,
  DATA_PATH,
  EMPTY_DATA,
  loadData,
  saveData,
  toggleVisit,
  toggleWant,
  getWants,
  colorForPlace,
  getVisitors,
  statsForPerson,
} from "./data";
import type { Person, PlaceInfo, PlaceKind, VisitData } from "./types";
import { addLayers, buildLookup, flyToUS, flyToWorld, initMap, loadGeoData, queryPlaceAt, updateFeatureProperties, updateSources, updateMapTheme } from "./map";

const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.css";
const SELECTED_KEY = "visited-map:selectedPerson";
const MAP_MODE_KEY = "visited-map:mapMode";
const SHOW_VISITED_KEY = "visited-map:showVisited";
const SHOW_WANTS_KEY = "visited-map:showWants";

function useMapLibreCss() {
  useEffect(() => {
    let style: HTMLStyleElement | null = null;
    async function inject() {
      try {
        const res = await fetch(MAPLIBRE_CSS);
        const css = await res.text();
        style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      } catch {
        // If CSS fails, the map still works but controls may look unstyled.
      }
    }
    inject();
    return () => {
      if (style && style.parentNode) style.parentNode.removeChild(style);
    };
  }, []);
}

function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const setStored = useCallback((next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, [key]);
  return [value, setStored];
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      if (document.documentElement.classList.contains("dark") || document.body.classList.contains("dark")) {
        return true;
      }
    }
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new MutationObserver(() => {
      const classDark = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");
      setIsDark(classDark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const mediaListener = (e: MediaQueryListEvent) => {
      const classDark = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");
      setIsDark(document.documentElement.classList.contains("dark") || document.body.classList.contains("dark") ? classDark : e.matches);
    };
    media.addEventListener("change", mediaListener);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", mediaListener);
    };
  }, []);

  return isDark;
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

function PersonChip({
  person,
  selected,
  onClick,
  count,
  isMobile,
}: {
  person?: Person;
  selected?: boolean;
  onClick?: () => void;
  count?: { visited: number; wanted: number };
  isMobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center rounded-full border transition
        ${isMobile
          ? "gap-1.5 px-3 py-1.5 text-sm font-semibold"
          : "gap-1 px-2 py-0.5 text-xs font-semibold"
        }
        ${selected ? "ring-1 ring-offset-1 ring-offset-background" : "hover:bg-muted/50"}
      `}
      style={
        {
          borderColor: person ? person.color : "hsl(var(--border))",
          backgroundColor: selected ? (person ? `${person.color}15` : "hsl(var(--muted))") : undefined,
          ringColor: person ? person.color : "hsl(var(--foreground))",
        } as any
      }
    >
      <span className={isMobile ? "text-base" : "text-xs"}>{person ? person.emoji : "👨‍👩‍👧‍👦"}</span>
      <span>{person ? person.name : "All"}</span>
      {count !== undefined ? (
        <span className={`font-normal opacity-80 flex items-center border-l border-muted-foreground/30 ${isMobile ? "text-[11px] gap-0.5 ml-1.5 pl-1.5" : "text-[10px] gap-0.5 ml-1 pl-1"}`}>
          <span className="font-bold text-foreground">{count.visited}</span>
          <span className={`opacity-50 ${isMobile ? "text-[9px]" : "text-[8px]"}`}>b</span>
          {count.wanted > 0 ? (
            <>
              <span className="opacity-30">/</span>
              <span className="font-bold text-sky-600 dark:text-sky-400">{count.wanted}</span>
              <span className={`opacity-50 ${isMobile ? "text-[9px]" : "text-[8px]"}`}>w</span>
            </>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function Legend({ people }: { people: Person[] }) {
  return (
    <div className="absolute top-4 right-4 rounded-lg border bg-card/90 p-2 shadow backdrop-blur">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Family</div>
      <div className="flex flex-col gap-1">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonStatusRow({
  person,
  visited,
  wanted,
  onStatusChange,
}: {
  person: Person;
  visited: boolean;
  wanted: boolean;
  onStatusChange: (status: "none" | "wanted" | "visited") => void;
}) {
  const currentStatus = visited ? "visited" : wanted ? "wanted" : "none";

  return (
    <div className="flex items-center justify-between rounded-lg border p-2.5 sm:p-2 text-sm bg-muted/10 hover:bg-muted/30 transition-colors">
      <span className="flex items-center gap-2">
        <span className="text-lg sm:text-base">{person.emoji}</span>
        <span className="font-semibold text-foreground/90">{person.name}</span>
      </span>

      <div className="inline-flex rounded-lg sm:rounded-md border bg-muted p-1 sm:p-0.5 text-sm sm:text-xs">
        <button
          onClick={() => onStatusChange("none")}
          className={`px-3 py-1.5 sm:px-2 sm:py-1 rounded transition-all ${currentStatus === "none" ? "bg-background font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          title="Clear status"
        >
          ✕
        </button>
        <button
          onClick={() => onStatusChange("wanted")}
          className={`px-3 py-1.5 sm:px-2 sm:py-1 rounded transition-all ${currentStatus === "wanted" ? "bg-background font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          style={{
            color: currentStatus === "wanted" ? person.color : undefined,
          }}
          title="Want to visit"
        >
          🗺️ Want
        </button>
        <button
          onClick={() => onStatusChange("visited")}
          className={`px-3 py-1.5 sm:px-2 sm:py-1 rounded transition-all ${currentStatus === "visited" ? "bg-background font-bold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          style={{
            color: currentStatus === "visited" ? person.color : undefined,
          }}
          title="Visited"
        >
          ✅ Been
        </button>
      </div>
    </div>
  );
}

function App() {
  useMapLibreCss();
  const isDark = useDarkMode();
  const width = useWindowWidth();
  const isMobile = width < 640;

  const [data, setData] = useState<VisitData | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useLocalStorage<string | null>(SELECTED_KEY, null);
  const [mapMode, setMapMode] = useLocalStorage<"world" | "us-states">(MAP_MODE_KEY, "world");
  const [showVisited, setShowVisited] = useLocalStorage<boolean>(SHOW_VISITED_KEY, true);
  const [showWants, setShowWants] = useLocalStorage<boolean>(SHOW_WANTS_KEY, true);
  const [selectedPlace, setSelectedPlace] = useState<PlaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<'idle' | 'checking' | 'done'>('idle');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geoRef = useRef<Awaited<ReturnType<typeof loadGeoData>> | null>(null);
  const dataRef = useRef(data);
  const selectedPersonIdRef = useRef(selectedPersonId);
  const mapModeRef = useRef(mapMode);
  const showVisitedRef = useRef(showVisited);
  const showWantsRef = useRef(showWants);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { selectedPersonIdRef.current = selectedPersonId; }, [selectedPersonId]);
  useEffect(() => { mapModeRef.current = mapMode; }, [mapMode]);
  useEffect(() => { showVisitedRef.current = showVisited; }, [showVisited]);
  useEffect(() => { showWantsRef.current = showWants; }, [showWants]);

  // Handle live theme changes on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateMapTheme(map, isDark);
    } else {
      map.once("styledata", () => {
        updateMapTheme(map, isDark);
      });
    }
  }, [isDark]);

  // Load data and keep it in sync with the workspace.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const d = await loadData();
        if (!alive) return;
        setData(d);
        setLoading(false);
        // Generate the country/state lookup table on first load if it's missing or stale.
        try {
          const geo = await loadGeoData();
          const lookup = buildLookup(geo);
          const countriesCount = Object.keys(lookup.countries).length;
          const statesCount = Object.keys(lookup.states).length;
          if (
            countriesCount !== Object.keys(d.lookup.countries).length ||
            statesCount !== Object.keys(d.lookup.states).length
          ) {
            const next = { ...d, lookup };
            await saveData(next);
            if (alive) setData(next);
          }
        } catch {
          // lookup is optional; don't block the app if atlas data fails
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
    load();
    const unsubData = playground.watch(DATA_PATH, load);
    const unsubConfig = playground.watch(CONFIG_PATH, load);
    return () => {
      alive = false;
      unsubData();
      unsubConfig();
    };
  }, []);

  // Identity detection state machine. Email-to-person mapping comes from the
  // external family config, so the published app has no household-specific IDs.
  useEffect(() => {
    if (identityStatus !== 'idle' || !data) return;

    const savedSelection = (() => {
      try {
        const raw = localStorage.getItem(SELECTED_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return typeof parsed === "string" && data.people.some((p) => p.id === parsed) ? parsed : null;
      } catch {
        return null;
      }
    })();
    if (savedSelection) {
      setIdentityStatus('done');
      return;
    }
    if (!data.people.length) {
      setIdentityStatus('done');
      return;
    }

    setIdentityStatus('checking');
    async function detect() {
      try {
        const res = await capabilities.integrations.fetch("google", "https://www.googleapis.com/oauth2/v2/userinfo");
        const { email } = (await res.json()) as { email?: string };
        const normalizedEmail = email?.trim().toLowerCase();
        const person = normalizedEmail ? data.people.find((p) => p.email?.toLowerCase() === normalizedEmail) : undefined;
        if (person) setSelectedPersonId(person.id);
      } catch {
        // Fall back to the family view if Google identity is unavailable.
      } finally {
        setIdentityStatus('done');
      }
    }
    detect();
  }, [identityStatus, data, setSelectedPersonId]);

  // Initialize map once.
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const map = initMap(mapContainerRef.current, isDark);
    mapRef.current = map;

    map.on("style.load", async () => {
      try {
        const geo = await loadGeoData();
        geoRef.current = geo;
        const d = dataRef.current ?? EMPTY_DATA;
        const { world, usStates } = updateFeatureProperties(
          geo, 
          d, 
          selectedPersonIdRef.current,
          showVisitedRef.current,
          showWantsRef.current
        );
        addLayers(map, world, usStates, d.people);
        setError(null);
        setMapReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    map.on("error", (e) => {
      setError(`Map error: ${e.error?.message ?? String(e.error ?? "unknown")}`);
    });

    map.on("click", (e) => {
      console.log("[click] zoom:", map.getZoom(), "styleLoaded:", map.isStyleLoaded());
      if (!map.isStyleLoaded()) return;
      const place = queryPlaceAt(map, e.point as PointLike, mapModeRef.current);
      console.log("[click] place:", place);
      if (!place) return;
      const currentData = dataRef.current ?? EMPTY_DATA;
      const currentPersonId = selectedPersonIdRef.current;
      const visitors = getVisitors(currentData, place.id, place.kind);
      const wanters = getWants(currentData, place.id, place.kind);
      const currentShowVisited = showVisitedRef.current;
      const currentShowWants = showWantsRef.current;

      if (currentPersonId) {
        const isVisited = visitors.includes(currentPersonId);
        const isWanted = wanters.includes(currentPersonId);

        let next = { ...currentData };
        if (isVisited) {
          next = toggleVisit(next, place.id, place.kind, currentPersonId, false);
        } else if (isWanted) {
          next = toggleWant(next, place.id, place.kind, currentPersonId, false);
        } else {
          // Add depending on what they are viewing
          if (currentShowWants && !currentShowVisited) {
            next = toggleWant(next, place.id, place.kind, currentPersonId, true);
          } else {
            next = toggleVisit(next, place.id, place.kind, currentPersonId, true);
          }
        }

        saveData(next);
        setData(next);
        setSelectedPlace({
          ...place,
          visitors: getVisitors(next, place.id, place.kind),
          wanters: getWants(next, place.id, place.kind),
        });
      } else {
        setSelectedPlace({ ...place, visitors, wanters });
      }
    });

    map.on("mousemove", (e) => {
      if (!map.isStyleLoaded()) return;
      const place = queryPlaceAt(map, e.point as PointLike, mapModeRef.current);
      map.getCanvas().style.cursor = place ? "pointer" : "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fly to the right view when the map is ready or the user switches modes.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (mapMode === "us-states") {
      flyToUS(map);
    } else {
      flyToWorld(map);
    }
    setSelectedPlace(null);
  }, [mapReady, mapMode]);

  // Update map colors when data, selected person, or filter settings change.
  useEffect(() => {
    const map = mapRef.current;
    const geo = geoRef.current;
    if (!map || !geo || !data) return;
    const { world, usStates } = updateFeatureProperties(geo, data, selectedPersonId, showVisited, showWants);
    updateSources(map, world, usStates);
  }, [data, selectedPersonId, showVisited, showWants]);

  const allStats = useMemo(() => {
    if (!data) return { countries: 0, states: 0, wantCountries: 0, wantStates: 0 };
    return statsForPerson(data, selectedPersonId);
  }, [data, selectedPersonId]);

  const familyStats = useMemo(() => {
    if (!data) return { countries: 0, states: 0, wantCountries: 0, wantStates: 0 };
    return statsForPerson(data, null);
  }, [data]);

  const handleStatusChange = (
    placeId: string,
    kind: PlaceKind,
    personId: string,
    status: "none" | "wanted" | "visited"
  ) => {
    if (!data) return;
    let next = { ...data };
    if (status === "none") {
      next = toggleVisit(next, placeId, kind, personId, false);
      next = toggleWant(next, placeId, kind, personId, false);
    } else if (status === "wanted") {
      next = toggleWant(next, placeId, kind, personId, true);
    } else if (status === "visited") {
      next = toggleVisit(next, placeId, kind, personId, true);
    }
    saveData(next);
    setData(next);
    setSelectedPlace((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        visitors: getVisitors(next, placeId, kind),
        wanters: getWants(next, placeId, kind),
      };
    });
  };

  const selectedColor = useMemo(() => {
    if (!selectedPlace || !data) return undefined;
    const { color } = colorForPlace(data, selectedPlace.id, selectedPlace.kind, selectedPersonId, showVisited, showWants);
    return color;
  }, [selectedPlace, data, selectedPersonId, showVisited, showWants]);

  return (
    <main className="flex h-full w-full flex-col bg-background text-foreground animate-none">
      {/* 
        Information Theory of Layout for Travel Map:
        
        To modulate Travel Map data across multiple parameters without cognitive overload, 
        we structure controls across three dimensions of intent, aligned with their physical baselines:
        
        1. THE SUBJECT (Who): Perspective pivot. Placed in the center of the horizon.
        2. THE GEOGRAPHY (Where): Map administrative división (World vs. US States).
        3. THE INTENTION (What): Temporal status filtering (Been vs. Want to visit).
        
        By merging (2) and (3) into a single unified "Map Configuration Console" on the right side
        separated by a micro-divider, we reduce horizontal footprint, eliminate twin border wrappers,
        and establish a clear cognitive division: "Identity on the left/center, Lens & Status on the right."
      */}
      <header className={`
        flex border-b bg-background/95 backdrop-blur min-h-11 flex-shrink-0 select-none
        ${isMobile 
          ? "flex-col gap-3 px-4 py-3" 
          : "flex-row items-center justify-between gap-2.5 px-3 py-2"
        }
      `}>
        {/* Subject Perspective Selector aligned left */}
        {isMobile ? (
          <div className="w-full relative">
            {(() => {
              const selectedPerson = selectedPersonId ? data?.people.find((p) => p.id === selectedPersonId) : null;
              const stats = selectedPerson ? statsForPerson(data, selectedPerson.id) : familyStats;
              const visited = mapMode === "world" ? stats.countries : stats.states;
              const wanted = mapMode === "world" ? stats.wantCountries : stats.wantStates;
              const statsText = `${visited}b` + (wanted > 0 ? ` / ${wanted}w` : "");

              return (
                <div className="relative inline-flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm w-full border-border">
                  <span className="flex items-center gap-2">
                    <span className="text-base">{selectedPerson ? selectedPerson.emoji : "👨‍👩‍👧‍👦"}</span>
                    <span className="text-foreground/95">
                      {selectedPerson ? `${selectedPerson.name}'s Map` : "All Family"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-bold text-foreground">
                      {statsText}
                    </span>
                    <span className="text-[10px] opacity-60">▼</span>
                  </span>
                  <select
                    value={selectedPersonId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPersonId(val === "" ? null : val);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  >
                    <option value="">
                      👨‍👩‍👧‍👦 All Family ({mapMode === "world" ? familyStats.countries : familyStats.states} Been)
                    </option>
                    {data?.people.map((p) => {
                      const pStats = statsForPerson(data, p.id);
                      const pVisited = mapMode === "world" ? pStats.countries : pStats.states;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.emoji} {p.name} ({pVisited} Been)
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="flex flex-row flex-nowrap gap-1.5 flex-grow items-center justify-start">
            <PersonChip
              isMobile={false}
              selected={selectedPersonId === null}
              onClick={() => setSelectedPersonId(null)}
              count={
                mapMode === "world"
                  ? { visited: familyStats.countries, wanted: familyStats.wantCountries }
                  : { visited: familyStats.states, wanted: familyStats.wantStates }
              }
            />
            {data?.people.map((p) => {
              const stats = statsForPerson(data, p.id);
              return (
                <PersonChip
                  key={p.id}
                  person={p}
                  isMobile={false}
                  selected={selectedPersonId === p.id}
                  onClick={() => setSelectedPersonId(selectedPersonId === p.id ? null : p.id)}
                  count={
                    mapMode === "world"
                      ? { visited: stats.countries, wanted: stats.wantCountries }
                      : { visited: stats.states, wanted: stats.wantStates }
                  }
                />
              );
            })}
          </div>
        )}

        {/* Right Console: Twin Engine Filters (Lens & Status) */}
        <div className={`
          flex items-center flex-shrink-0
          ${isMobile ? "w-full gap-2" : "gap-2"}
        `}>
          <div className={`
            inline-flex items-center border bg-muted
            ${isMobile 
              ? "w-full rounded-lg p-1 text-sm" 
              : "rounded-md p-0.5 text-xs"
            }
          `}>
            {/* Geographical scope */}
            <button
              onClick={() => setMapMode("world")}
              className={`
                inline-flex items-center justify-center gap-1 rounded font-semibold transition-all
                ${isMobile 
                  ? "flex-1 py-2 px-3 text-sm" 
                  : "py-0.5 px-2 text-xs"
                }
                ${mapMode === "world" ? "bg-background shadow-sm text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}
              `}
            >
              World
            </button>
            <button
              onClick={() => setMapMode("us-states")}
              className={`
                inline-flex items-center justify-center gap-1 rounded font-semibold transition-all
                ${isMobile 
                  ? "flex-1 py-2 px-3 text-sm" 
                  : "py-0.5 px-2 text-xs"
                }
                ${mapMode === "us-states" ? "bg-background shadow-sm text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}
              `}
            >
              US
            </button>

            {/* Division between Geography and Intention */}
            <span className={`
              border-l border-muted-foreground/20
              ${isMobile ? "mx-2 h-5" : "mx-1 h-3.5"}
            `} />

            {/* Modality filters */}
            <button
              onClick={() => setShowVisited(!showVisited)}
              className={`
                inline-flex items-center justify-center gap-1 rounded font-semibold transition-all
                ${isMobile 
                  ? "flex-1 py-2 px-3 text-sm" 
                  : "py-0.5 px-2 text-xs"
                }
                ${showVisited ? "bg-background shadow-sm text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}
              `}
              title="Toggle Visited places"
            >
              <span>Been</span>
            </button>
            <button
              onClick={() => setShowWants(!showWants)}
              className={`
                inline-flex items-center justify-center gap-1 rounded font-semibold transition-all
                ${isMobile 
                  ? "flex-1 py-2 px-3 text-sm" 
                  : "py-0.5 px-2 text-xs"
                }
                ${showWants ? "bg-background shadow-sm text-foreground font-bold" : "text-muted-foreground hover:text-foreground"}
              `}
              title="Toggle Wishlist / Wants to visit"
            >
              <span>Want</span>
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {data && data.people.length === 0 ? (
        <div className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          <div className="font-semibold">Travel Map setup needed</div>
          <div className="mt-1 text-muted-foreground">
            Add your family membership to <code className="rounded bg-muted px-1">{CONFIG_PATH}</code>. See <code className="rounded bg-muted px-1">Apps/visited-map/SETUP.md</code> for the config format.
          </div>
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="h-full w-full bg-slate-100 dark:bg-slate-900" />

        {loading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50">
            <div className="rounded-lg border bg-card px-4 py-3 shadow">Loading map data…</div>
          </div>
        ) : null}

        {data ? <Legend people={data.people} /> : null}

        <div className={`absolute bottom-4 left-4 rounded-lg border bg-card/90 p-3 shadow-lg backdrop-blur max-w-[calc(100%-2rem)] sm:max-w-xs ${selectedPlace ? "hidden sm:block" : "block"}`}>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {selectedPersonId ? `${data?.people.find((p) => p.id === selectedPersonId)?.name}'s Stats` : "Family View"}
          </div>
          <div className="mt-2 text-xs space-y-1 bg-muted/20 p-2 rounded-md border border-border">
            {showVisited && (
              <div className="flex items-center justify-between gap-4 font-medium text-foreground">
                <span className="flex items-center gap-1">✅ Visited:</span>
                <span className="font-bold">
                  {mapMode === "world" ? `${allStats.countries} countries` : `${allStats.states} states`}
                </span>
              </div>
            )}
            {showWants && (
              <div className="flex items-center justify-between gap-4 font-medium text-foreground">
                <span className="flex items-center gap-1">🗺️ Wants to Go:</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">
                  {mapMode === "world" ? `${allStats.wantCountries} countries` : `${allStats.wantStates} states`}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground leading-normal font-medium">
            {mapMode === "us-states"
              ? `Click a US state to ${selectedPersonId ? "toggle status" : "see detailed family list"}.`
              : `Click a country to ${selectedPersonId ? "toggle status" : "see detailed family list"}.`}
          </div>
        </div>

        {selectedPlace && data ? (
          <div className="absolute bottom-4 right-4 left-4 sm:left-auto sm:w-80 rounded-lg border bg-card p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {selectedPlace.kind === "country" ? "Country" : "US State"}
                </div>
                <h2 className="text-lg font-extrabold leading-tight" style={{ color: selectedColor }}>
                  {selectedPlace.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedPlace(null)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-2.5">
              {data.people.map((p) => (
                <PersonStatusRow
                  key={p.id}
                  person={p}
                  visited={selectedPlace.visitors.includes(p.id)}
                  wanted={(selectedPlace.wanters ?? getWants(data, selectedPlace.id, selectedPlace.kind)).includes(p.id)}
                  onStatusChange={(status) => handleStatusChange(selectedPlace.id, selectedPlace.kind, p.id, status)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default (root: HTMLElement) => {
  root.className = "h-full w-full";
  const r = createRoot(root);
  r.render(<App />);
  return () => r.unmount();
};
