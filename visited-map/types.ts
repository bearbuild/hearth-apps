export type Person = {
  id: string;
  name: string;
  color: string;
  short: string;
  emoji: string;
  /** Optional Google account email used to select this person's view by default. */
  email?: string;
};

export type FamilyConfig = {
  version: number;
  people: Person[];
};

export type VisitData = {
  version: number;
  /** Loaded from FamilyConfig; not persisted in the travel data file. */
  people: Person[];
  visits: {
    countries: Record<string, string[]>;
    states: Record<string, string[]>;
  };
  wants: {
    countries: Record<string, string[]>;
    states: Record<string, string[]>;
  };
  lookup: {
    countries: Record<string, string>;
    states: Record<string, string>;
  };
};

export type PlaceKind = "country" | "state";

export type PlaceInfo = {
  id: string;
  kind: PlaceKind;
  name: string;
  visitors: string[];
  wanters?: string[];
};
