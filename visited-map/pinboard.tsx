import { createRoot } from "https://esm.sh/react-dom@19/client";
import { useEffect, useState } from "https://esm.sh/react@19";
import { CONFIG_PATH, DATA_PATH, loadData } from "./data";
import type { Person, VisitData } from "./types";

const MAP_MODE_KEY = "visited-map:mapMode";

function Tile() {
  const [data, setData] = useState<VisitData | null>(null);
  const [mapMode, setMapMode] = useState<"world" | "us-states">(() => {
    try {
      const raw = localStorage.getItem(MAP_MODE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed === "world" || parsed === "us-states") return parsed;
      }
    } catch {
      /* ignore */
    }
    return "world";
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      const d = await loadData();
      if (alive) setData(d);
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

  // Sync tab selection with other tabs/windows if they change the setting
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === MAP_MODE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed === "world" || parsed === "us-states") {
            setMapMode(parsed);
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        Loading map…
      </div>
    );
  }

  const totalCountries = Object.keys(data.visits.countries).length;
  const totalStates = Object.keys(data.visits.states).length;

  const handleSetMapMode = (mode: "world" | "us-states") => {
    setMapMode(mode);
    try {
      localStorage.setItem(MAP_MODE_KEY, JSON.stringify(mode));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="text-lg">🌍</span>
        <span>Travel Map</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-sm">
        <button
          onClick={() => handleSetMapMode("world")}
          className={`rounded-md border p-2 text-center transition ${
            mapMode === "world"
              ? "bg-background shadow-sm border-border"
              : "border-transparent bg-muted/50 hover:bg-muted"
          }`}
        >
          <div className="text-xl font-bold">{totalCountries}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Countries</div>
        </button>
        <button
          onClick={() => handleSetMapMode("us-states")}
          className={`rounded-md border p-2 text-center transition ${
            mapMode === "us-states"
              ? "bg-background shadow-sm border-border"
              : "border-transparent bg-muted/50 hover:bg-muted"
          }`}
        >
          <div className="text-xl font-bold">{totalStates}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">US States</div>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {data.people.map((p: Person) => {
          const count = mapMode === "world"
            ? Object.values(data.visits.countries).filter((list) => list.includes(p.id)).length
            : Object.values(data.visits.states).filter((list) => list.includes(p.id)).length;
          return (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${p.color}25`, color: p.color, border: `1px solid ${p.color}40` } as any}
            >
              {p.emoji} {p.short} {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default (root: HTMLElement) => {
  const r = createRoot(root);
  r.render(<Tile />);
  return () => r.unmount();
};
