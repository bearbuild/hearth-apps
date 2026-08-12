type PlaceKind = "country" | "state";

type Person = {
  id: string;
  name: string;
  color: string;
  short: string;
  emoji: string;
  email?: string;
};

type VisitData = {
  version: number;
  people: Person[];
  visits: { countries: Record<string, string[]>; states: Record<string, string[]> };
  wants: { countries: Record<string, string[]>; states: Record<string, string[]> };
  lookup: { countries: Record<string, string>; states: Record<string, string> };
};

const APP_DATA_DIR = ".playground/local/visited-map";
const CONFIG_PATH = `${APP_DATA_DIR}/config.json`;
const DATA_PATH = `${APP_DATA_DIR}/data.json`;
const LEGACY_DATA_PATH = "Apps/visited-map/data.json";

type TagVisitInput = {
  place: string;
  personId: string;
  visited?: boolean;
  want?: boolean;
};

function normalizePeople(value: unknown): Person[] {
  const rawPeople = value && typeof value === "object" && Array.isArray((value as any).people)
    ? (value as any).people
    : [];
  const people: Person[] = [];
  const ids = new Set<string>();
  for (const raw of rawPeople) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!id || !name || ids.has(id)) continue;
    ids.add(id);
    people.push({
      id,
      name,
      color: typeof raw.color === "string" && raw.color.trim() ? raw.color : "#64748b",
      short: typeof raw.short === "string" && raw.short.trim() ? raw.short.trim().slice(0, 3) : name.slice(0, 1).toUpperCase(),
      emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji : "👤",
      ...(typeof raw.email === "string" && raw.email.trim() ? { email: raw.email.trim().toLowerCase() } : {}),
    });
  }
  return people;
}

function normalizeBucket(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  for (const [placeId, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    const unique = [...new Set(ids.filter((id): id is string => typeof id === "string"))];
    if (unique.length) result[placeId] = unique;
  }
  return result;
}

function normalizeData(value: unknown, people: Person[]): VisitData {
  const raw = value && typeof value === "object" ? value as any : {};
  return {
    version: 1,
    people,
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

function lookupPlaceId(data: VisitData, name: string, kind: PlaceKind): string | undefined {
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

const US_STATES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
  "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
  "puerto rico", "guam", "american samoa", "united states virgin islands",
  "commonwealth of the northern mariana islands",
]);

function guessKind(place: string): PlaceKind {
  const lower = place.trim().toLowerCase();
  if (lower === "georgia") return "country";
  return US_STATES.has(lower) ? "state" : "country";
}

function toggle(data: VisitData, placeId: string, kind: PlaceKind, personId: string, status: "visited" | "want", forced?: boolean): VisitData {
  const next = { ...data, visits: { ...data.visits }, wants: { ...data.wants } };
  const visitBucketName = kind === "country" ? "countries" : "states";
  const visitBucket = { ...next.visits[visitBucketName] };
  const wantBucket = { ...next.wants[visitBucketName] };
  next.visits = { ...next.visits, [visitBucketName]: visitBucket };
  next.wants = { ...next.wants, [visitBucketName]: wantBucket };

  const activeBucket = status === "visited" ? visitBucket : wantBucket;
  const otherBucket = status === "visited" ? wantBucket : visitBucket;
  const current = new Set(activeBucket[placeId] ?? []);
  const nextValue = forced === undefined ? !current.has(personId) : forced;
  if (nextValue) {
    current.add(personId);
    const other = new Set(otherBucket[placeId] ?? []);
    other.delete(personId);
    if (other.size) otherBucket[placeId] = [...other];
    else delete otherBucket[placeId];
  } else {
    current.delete(personId);
  }
  if (current.size) activeBucket[placeId] = [...current];
  else delete activeBucket[placeId];
  return next;
}

export async function tag_visit(input: TagVisitInput, ctx) {
  async function readJson(path: string): Promise<any | undefined> {
    try {
      const file = await ctx.playground.open(path);
      return JSON.parse(await file.read());
    } catch {
      return undefined;
    }
  }

  async function writeJson(path: string, value: unknown): Promise<void> {
    try {
      const file = await ctx.playground.open(path);
      await file.write(JSON.stringify(value, null, 2));
      return;
    } catch (firstError) {
      if (!ctx.playground.createFile) throw firstError;
      await ctx.playground.createFile(path);
      const file = await ctx.playground.open(path);
      await file.write(JSON.stringify(value, null, 2));
    }
  }

  async function loadData(): Promise<VisitData> {
    const [configured, stored, legacy] = await Promise.all([
      readJson(CONFIG_PATH),
      readJson(DATA_PATH),
      readJson(LEGACY_DATA_PATH),
    ]);
    const people = normalizePeople(configured ?? { people: legacy?.people ?? [] });
    if (configured === undefined && people.length) await writeJson(CONFIG_PATH, { version: 1, people });
    return normalizeData(stored ?? legacy ?? {}, people);
  }

  async function saveData(data: VisitData): Promise<void> {
    const { people: _people, ...travelData } = data;
    await writeJson(DATA_PATH, travelData);
  }


  if (input.visited === true && input.want === true) {
    throw new Error("'visited' and 'want' are mutually exclusive. Choose only one.");
  }

  const data = await loadData();
  if (!data.people.length) {
    throw new Error(`Travel Map is not configured. Add family members to ${CONFIG_PATH} first.`);
  }

  const placeName = input.place.trim();
  const personId = input.personId.trim().toLowerCase();
  if (!placeName) throw new Error("'place' must not be empty.");

  const person = data.people.find((p) => p.id === personId);
  if (!person) {
    throw new Error(`Unknown person "${input.personId}". Choose one of: ${data.people.map((p) => p.id).join(", ")}.`);
  }

  let kind: PlaceKind = "country";
  let placeId = lookupPlaceId(data, placeName, "country");
  if (!placeId) {
    placeId = lookupPlaceId(data, placeName, "state");
    if (placeId) kind = "state";
  }
  if (!placeId) {
    kind = guessKind(placeName);
    placeId = kind === "state" ? `US-${placeName}` : placeName;
  }

  const status = input.want !== undefined ? "want" : "visited";
  const forced = input.want !== undefined ? input.want : input.visited;
  const next = toggle(data, placeId, kind, personId, status, forced);
  await saveData(next);

  const visits = next.visits[kind === "country" ? "countries" : "states"][placeId] ?? [];
  const wants = next.wants[kind === "country" ? "countries" : "states"][placeId] ?? [];
  return { place: placeName, personId, visited: visits.includes(personId), want: wants.includes(personId) };
}
