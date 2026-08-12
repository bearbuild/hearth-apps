import type { FamilyConfig, Person, PlaceKind, VisitData } from "./types";

/**
 * App-owned mutable state lives outside the install directory so the app can be
 * published, upgraded, or replaced without bundling a household's data.
 * `@local/visited-map` maps to `.playground/local/visited-map/`.
 */
export const APP_DATA_DIR = ".playground/local/visited-map";
export const CONFIG_PATH = `${APP_DATA_DIR}/config.json`;
export const DATA_PATH = `${APP_DATA_DIR}/data.json`;

/** Used only to migrate workspaces created by older versions of Travel Map. */
const LEGACY_DATA_PATH = "Apps/visited-map/data.json";

export const EMPTY_CONFIG: FamilyConfig = { version: 1, people: [] };
export const EMPTY_DATA: VisitData = {
  version: 1,
  people: [],
  visits: { countries: {}, states: {} },
  wants: { countries: {}, states: {} },
  lookup: { countries: {}, states: {} },
};

declare const playground: {
  open: (path: string, options?: { create?: boolean }) => Promise<{
    kind?: string;
    read: () => Promise<string>;
    write: (content: string) => Promise<void>;
  }>;
};

function personFromUnknown(value: unknown): Person | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Person>;
  const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;
  const short = typeof raw.short === "string" && raw.short.trim()
    ? raw.short.trim().slice(0, 3)
    : name.slice(0, 1).toUpperCase();
  const email = typeof raw.email === "string" && raw.email.trim()
    ? raw.email.trim().toLowerCase()
    : undefined;
  return {
    id,
    name,
    color: typeof raw.color === "string" && raw.color.trim() ? raw.color : "#64748b",
    short,
    emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji : "👤",
    ...(email ? { email } : {}),
  };
}

export function normalizeConfig(value: unknown): FamilyConfig {
  const rawPeople = value && typeof value === "object" && Array.isArray((value as any).people)
    ? (value as any).people
    : [];
  const people: Person[] = [];
  const ids = new Set<string>();
  for (const raw of rawPeople) {
    const person = personFromUnknown(raw);
    if (!person || ids.has(person.id)) continue;
    ids.add(person.id);
    people.push(person);
  }
  return { version: 1, people };
}

function normalizeBucket(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  for (const [placeId, personIds] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(personIds)) continue;
    const ids = [...new Set(personIds.filter((id): id is string => typeof id === "string"))];
    if (ids.length) result[placeId] = ids;
  }
  return result;
}

function normalizeStoredData(value: unknown): Omit<VisitData, "people"> {
  const raw = value && typeof value === "object" ? value as any : {};
  return {
    version: 1,
    visits: {
      countries: normalizeBucket(raw.visits?.countries),
      states: normalizeBucket(raw.visits?.states),
    },
    wants: {
      countries: normalizeBucket(raw.wants?.countries),
      states: normalizeBucket(raw.wants?.states),
    },
    lookup: {
      countries: raw.lookup?.countries && typeof raw.lookup.countries === "object" ? raw.lookup.countries : {},
      states: raw.lookup?.states && typeof raw.lookup.states === "object" ? raw.lookup.states : {},
    },
  };
}

async function readJson(path: string, create = false): Promise<unknown | undefined> {
  try {
    const file = await playground.open(path, { create });
    return JSON.parse(await file.read());
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const file = await playground.open(path, { create: true });
  await file.write(JSON.stringify(value, null, 2));
}

export async function loadConfig(): Promise<FamilyConfig> {
  const configured = await readJson(CONFIG_PATH, true);
  if (configured !== undefined) return normalizeConfig(configured);

  // Upgrade path for the old bundled data.json format. New installs never use
  // this fallback; it exists so existing households keep their membership.
  const legacy = await readJson(LEGACY_DATA_PATH);
  if (legacy && typeof legacy === "object" && Array.isArray((legacy as any).people)) {
    const migrated = normalizeConfig({ people: (legacy as any).people });
    await writeJson(CONFIG_PATH, migrated);
    return migrated;
  }
  return EMPTY_CONFIG;
}

export async function saveConfig(config: FamilyConfig): Promise<void> {
  await writeJson(CONFIG_PATH, normalizeConfig(config));
}

export async function loadData(): Promise<VisitData> {
  const [config, stored, legacy] = await Promise.all([
    loadConfig(),
    readJson(DATA_PATH, true),
    readJson(LEGACY_DATA_PATH),
  ]);

  const source = stored ?? legacy ?? EMPTY_DATA;
  const normalized = normalizeStoredData(source);
  const data: VisitData = { ...normalized, people: config.people };

  // Complete the one-time upgrade after config migration. Membership is removed
  // from the new travel data file and remains solely in config.json.
  if (stored === undefined && legacy !== undefined) {
    await saveData(data);
  }
  return data;
}

export async function saveData(data: VisitData): Promise<void> {
  const { people: _people, ...travelData } = data;
  await writeJson(DATA_PATH, travelData);
}

export function lookupPlaceId(data: VisitData, name: string, kind: PlaceKind): string | undefined {
  const lookup = kind === "country" ? data.lookup.countries : data.lookup.states;
  const normalized = name.trim().toLowerCase();
  for (const [key, id] of Object.entries(lookup)) {
    if (key.toLowerCase() === normalized) return id;
  }
  for (const [key, id] of Object.entries(lookup)) {
    if (key.toLowerCase().includes(normalized)) return id;
  }
  return undefined;
}

export function getVisitors(data: VisitData, placeId: string, kind: PlaceKind): string[] {
  const bucket = kind === "country" ? data.visits.countries : data.visits.states;
  return bucket[placeId] ?? [];
}

export function getWants(data: VisitData, placeId: string, kind: PlaceKind): string[] {
  const bucket = kind === "country" ? data.wants.countries : data.wants.states;
  return bucket[placeId] ?? [];
}

export function toggleVisit(data: VisitData, placeId: string, kind: PlaceKind, personId: string, forced?: boolean): VisitData {
  const next = { ...data, visits: { ...data.visits }, wants: { ...data.wants } };
  if (kind === "country") {
    next.visits.countries = { ...next.visits.countries };
    next.wants.countries = { ...next.wants.countries };
  } else {
    next.visits.states = { ...next.visits.states };
    next.wants.states = { ...next.wants.states };
  }

  const visitBucket = kind === "country" ? next.visits.countries : next.visits.states;
  const wantBucket = kind === "country" ? next.wants.countries : next.wants.states;
  const current = new Set(visitBucket[placeId] ?? []);
  const nextValue = forced === undefined ? !current.has(personId) : forced;

  if (nextValue) {
    current.add(personId);
    const wanters = new Set(wantBucket[placeId] ?? []);
    wanters.delete(personId);
    if (wanters.size) wantBucket[placeId] = [...wanters];
    else delete wantBucket[placeId];
  } else {
    current.delete(personId);
  }

  if (current.size) visitBucket[placeId] = [...current];
  else delete visitBucket[placeId];
  return next;
}

export function toggleWant(data: VisitData, placeId: string, kind: PlaceKind, personId: string, forced?: boolean): VisitData {
  const next = { ...data, visits: { ...data.visits }, wants: { ...data.wants } };
  if (kind === "country") {
    next.visits.countries = { ...next.visits.countries };
    next.wants.countries = { ...next.wants.countries };
  } else {
    next.visits.states = { ...next.visits.states };
    next.wants.states = { ...next.wants.states };
  }

  const wantBucket = kind === "country" ? next.wants.countries : next.wants.states;
  const visitBucket = kind === "country" ? next.visits.countries : next.visits.states;
  const current = new Set(wantBucket[placeId] ?? []);
  const nextValue = forced === undefined ? !current.has(personId) : forced;

  if (nextValue) {
    current.add(personId);
    const visitors = new Set(visitBucket[placeId] ?? []);
    visitors.delete(personId);
    if (visitors.size) visitBucket[placeId] = [...visitors];
    else delete visitBucket[placeId];
  } else {
    current.delete(personId);
  }

  if (current.size) wantBucket[placeId] = [...current];
  else delete wantBucket[placeId];
  return next;
}

export function blendColors(colors: string[]): string {
  if (colors.length === 0) return "#e5e7eb";
  if (colors.length === 1) return colors[0];
  const rgb = colors.map((c) => {
    const hex = c.replace("#", "");
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  });
  const avg = {
    r: Math.round(rgb.reduce((a, b) => a + b.r, 0) / rgb.length),
    g: Math.round(rgb.reduce((a, b) => a + b.g, 0) / rgb.length),
    b: Math.round(rgb.reduce((a, b) => a + b.b, 0) / rgb.length),
  };
  return `#${avg.r.toString(16).padStart(2, "0")}${avg.g.toString(16).padStart(2, "0")}${avg.b.toString(16).padStart(2, "0")}`;
}

export function colorForPlace(
  data: VisitData,
  placeId: string,
  kind: PlaceKind,
  selectedPersonId: string | null,
  showVisited = true,
  showWants = true,
): { color: string; opacity: number; lineColor: string; lineOpacity: number; isDashed: boolean; allView: boolean } {
  const visitors = showVisited ? getVisitors(data, placeId, kind) : [];
  const wanters = showWants ? getWants(data, placeId, kind) : [];
  const neutral = { color: "#e5e7eb", opacity: 0.01, lineColor: "#cbd5e1", lineOpacity: 0.4, isDashed: false, allView: false };

  if (selectedPersonId) {
    const person = data.people.find((p) => p.id === selectedPersonId);
    if (!person) return neutral;
    if (visitors.includes(selectedPersonId)) {
      return { color: person.color, opacity: 0.9, lineColor: "#94a3b8", lineOpacity: 0.5, isDashed: false, allView: false };
    }
    if (wanters.includes(selectedPersonId)) {
      return { color: person.color, opacity: 0.25, lineColor: person.color, lineOpacity: 0.9, isDashed: true, allView: false };
    }
    return neutral;
  }

  const totalInvolvement = [...visitors, ...wanters];
  if (totalInvolvement.length === 0) {
    return { color: "#e5e7eb", opacity: 0.01, lineColor: "#cbd5e1", lineOpacity: 0.3, isDashed: false, allView: true };
  }
  const colors = totalInvolvement.map((id) => data.people.find((p) => p.id === id)?.color).filter(Boolean) as string[];
  return { color: blendColors(colors), opacity: 0.05, lineColor: blendColors(colors), lineOpacity: 0, isDashed: false, allView: true };
}

export function statsForPerson(data: VisitData, personId: string | null) {
  if (personId) {
    return {
      countries: Object.values(data.visits.countries).filter((list) => list.includes(personId)).length,
      states: Object.values(data.visits.states).filter((list) => list.includes(personId)).length,
      wantCountries: Object.values(data.wants.countries).filter((list) => list.includes(personId)).length,
      wantStates: Object.values(data.wants.states).filter((list) => list.includes(personId)).length,
    };
  }
  return {
    countries: Object.keys(data.visits.countries).length,
    states: Object.keys(data.visits.states).length,
    wantCountries: Object.keys(data.wants.countries).length,
    wantStates: Object.keys(data.wants.states).length,
  };
}
