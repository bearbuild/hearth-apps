import maplibregl from "https://esm.sh/maplibre-gl@5.1.0";
import * as topojson from "https://esm.sh/topojson-client@3.1.0";
import type { Person, VisitData } from "./types";
import { colorForPlace, getVisitors, getWants } from "./data";

export const WORLD_URL = "https://unpkg.com/world-atlas@2.0.2/countries-50m.json";
export const US_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export function getMapStyle(isDark: boolean): string {
  return isDark
    ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
    : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
}

export type GeoData = {
  world: GeoJSON.FeatureCollection;
  usStates: GeoJSON.FeatureCollection;
};

export async function loadGeoData(): Promise<GeoData> {
  const [worldTopo, usTopo] = await Promise.all([
    fetch(WORLD_URL).then((r) => r.json()),
    fetch(US_URL).then((r) => r.json()),
  ]);
  const world = topojson.feature(worldTopo, worldTopo.objects.countries) as GeoJSON.FeatureCollection;
  const usStates = topojson.feature(usTopo, usTopo.objects.states) as GeoJSON.FeatureCollection;

  console.log("[loadGeoData] first 3 world features:", JSON.stringify(world.features.slice(0, 3)));
  console.log("[loadGeoData] first 3 usStates features:", JSON.stringify(usStates.features.slice(0, 3)));

  // Ensure every feature has a usable id and name.
  world.features.forEach((f) => {
    const anyProps = (f.properties ?? {}) as any;
    f.id = String(f.id ?? anyProps.id ?? anyProps.iso_n3 ?? anyProps.NAME ?? anyProps.name);
    anyProps.id = f.id;
    anyProps.name = anyProps.name ?? anyProps.NAME ?? anyProps.ADMIN ?? "";
  });
  usStates.features.forEach((f) => {
    const anyProps = (f.properties ?? {}) as any;
    const name = anyProps.name ?? anyProps.NAME ?? "";
    f.id = `US-${name}`;
    anyProps.id = f.id;
    anyProps.name = name;
  });
  console.log("[loadGeoData] post-process first 3 usStates features:", usStates.features.slice(0, 3));
  return { world, usStates };
}

export function buildLookup(geo: GeoData) {
  return {
    countries: Object.fromEntries(
      geo.world.features.map((f) => [String((f.properties as any).name ?? ""), String(f.id)]),
    ),
    states: Object.fromEntries(
      geo.usStates.features.map((f) => [String((f.properties as any).name ?? "").replace(/^US-/, ""), String(f.id)]),
    ),
  };
}

export function initMap(container: HTMLElement, isDark: boolean = false): maplibregl.Map {
  return new maplibregl.Map({
    container,
    style: getMapStyle(isDark),
    center: [0, 25],
    zoom: 1.4,
    minZoom: 1,
    maxZoom: 10,
    attributionControl: true,
    renderWorldCopies: true,
    preserveDrawingBuffer: true,
    antialias: false,
  });
}

export function updateMapTheme(map: maplibregl.Map, isDark: boolean) {
  if (!map.isStyleLoaded()) return;
  const nextStyle = getMapStyle(isDark);
  map.setStyle(nextStyle);
}

export function updateFeatureProperties(
  geo: GeoData,
  data: VisitData,
  selectedPersonId: string | null,
  showVisited: boolean = true,
  showWants: boolean = true,
): { world: GeoJSON.FeatureCollection; usStates: GeoJSON.FeatureCollection } {
  const nextWorld: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: geo.world.features.map((f) => {
      const id = String(f.id);
      const { color, opacity, lineColor, lineOpacity, isDashed, allView } = colorForPlace(data, id, "country", selectedPersonId, showVisited, showWants);
      const visitors = showVisited ? getVisitors(data, id, "country") : [];
      const wanters = showWants ? getWants(data, id, "country") : [];
      const props: any = { 
        ...(f.properties ?? {}), 
        __fillColor: color, 
        __fillOpacity: opacity, 
        __lineColor: lineColor, 
        __lineOpacity: lineOpacity, 
        __allView: allView,
        __isDashed: isDashed,
      };
      for (const p of data.people) {
        props[`__visited_${p.id}`] = showVisited && visitors.includes(p.id);
        props[`__wanted_${p.id}`] = showWants && wanters.includes(p.id);
      }
      return { ...f, properties: props };
    }),
  };
  const nextStates: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: geo.usStates.features.map((f) => {
      const id = String(f.id);
      const { color, opacity, lineColor, lineOpacity, isDashed, allView } = colorForPlace(data, id, "state", selectedPersonId, showVisited, showWants);
      const visitors = showVisited ? getVisitors(data, id, "state") : [];
      const wanters = showWants ? getWants(data, id, "state") : [];
      const props: any = { 
        ...(f.properties ?? {}), 
        __fillColor: color, 
        __fillOpacity: opacity, 
        __lineColor: lineColor, 
        __lineOpacity: lineOpacity, 
        __allView: allView,
        __isDashed: isDashed,
      };
      for (const p of data.people) {
        props[`__visited_${p.id}`] = showVisited && visitors.includes(p.id);
        props[`__wanted_${p.id}`] = showWants && wanters.includes(p.id);
      }
      return { ...f, properties: props };
    }),
  };
  return { world: nextWorld, usStates: nextStates };
}

function findFirstLabelLayerId(map: maplibregl.Map): string | undefined {
  const style = map.getStyle();
  if (!style || !style.layers) return undefined;
  // Find the first symbol layer, which usually represents labels
  const labelLayer = style.layers.find((l) => l.type === "symbol");
  return labelLayer?.id;
}

export function addLayers(map: maplibregl.Map, world: GeoJSON.FeatureCollection, usStates: GeoJSON.FeatureCollection, people: Person[]) {
  map.addSource("countries", { type: "geojson", data: world, promoteId: "id" });
  map.addSource("us-states", { type: "geojson", data: usStates, promoteId: "id" });

  const labelLayerId = findFirstLabelLayerId(map);

  map.addLayer({
    id: "countries-fill",
    type: "fill",
    source: "countries",
    paint: {
      "fill-color": ["get", "__fillColor"],
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["get", "__fillOpacity"],
        4,
        ["*", ["get", "__fillOpacity"], 0.35],
        6,
        0,
      ],
    },
  }, labelLayerId);

  map.addLayer({
    id: "us-states-fill",
    type: "fill",
    source: "us-states",
    minzoom: 2,
    paint: {
      "fill-color": ["get", "__fillColor"],
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0, 3.5, ["get", "__fillOpacity"], 10, ["get", "__fillOpacity"]],
    },
  }, labelLayerId);

  // Solid lines for non-dashed boundaries
  map.addLayer({
    id: "countries-line",
    type: "line",
    source: "countries",
    filter: ["!=", ["get", "__isDashed"], true],
    paint: {
      "line-color": ["get", "__lineColor"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.75, 4, 1.5, 6, 2],
      "line-opacity": ["get", "__lineOpacity"],
    },
  }, labelLayerId);

  // Dashed lines for wanted boundaries (when selected)
  map.addLayer({
    id: "countries-line-dashed",
    type: "line",
    source: "countries",
    filter: ["==", ["get", "__isDashed"], true],
    paint: {
      "line-color": ["get", "__lineColor"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 4, 2, 6, 2.5],
      "line-opacity": ["get", "__lineOpacity"],
      "line-dasharray": [3, 3],
    },
  }, labelLayerId);

  // Solid lines for non-dashed state boundaries
  map.addLayer({
    id: "us-states-line",
    type: "line",
    source: "us-states",
    minzoom: 2,
    filter: ["!=", ["get", "__isDashed"], true],
    paint: {
      "line-color": ["get", "__lineColor"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.75, 6, 2, 10, 2.5],
      "line-opacity": ["get", "__lineOpacity"],
    },
  }, labelLayerId);

  // Dashed lines for wanted state boundaries
  map.addLayer({
    id: "us-states-line-dashed",
    type: "line",
    source: "us-states",
    minzoom: 2,
    filter: ["==", ["get", "__isDashed"], true],
    paint: {
      "line-color": ["get", "__lineColor"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 6, 2.5, 10, 3],
      "line-opacity": ["get", "__lineOpacity"],
      "line-dasharray": [3, 3],
    },
  }, labelLayerId);

  // In All view, draw independent offset outlines for each visitor/wanter.
  // Each person gets up to two outline rings: solid for visited, dashed for wanted.
  people.forEach((person, index) => {
    const offset = index * 2.5;

    // Visited outline (solid)
    map.addLayer({
      id: `countries-line-visited-${person.id}`,
      type: "line",
      source: "countries",
      filter: ["all", ["get", "__allView"], ["get", `__visited_${person.id}`]],
      paint: {
        "line-color": person.color,
        "line-width": 2,
        "line-offset": offset,
        "line-opacity": 0.9,
      },
    }, labelLayerId);

    // Wanted outline (dashed)
    map.addLayer({
      id: `countries-line-wanted-${person.id}`,
      type: "line",
      source: "countries",
      filter: ["all", ["get", "__allView"], ["get", `__wanted_${person.id}`]],
      paint: {
        "line-color": person.color,
        "line-width": 2,
        "line-offset": offset,
        "line-opacity": 0.9,
        "line-dasharray": [2, 2],
      },
    }, labelLayerId);

    // Visited state outline (solid)
    map.addLayer({
      id: `us-states-line-visited-${person.id}`,
      type: "line",
      source: "us-states",
      minzoom: 2,
      filter: ["all", ["get", "__allView"], ["get", `__visited_${person.id}`]],
      paint: {
        "line-color": person.color,
        "line-width": 2,
        "line-offset": offset,
        "line-opacity": 0.9,
      },
    }, labelLayerId);

    // Wanted state outline (dashed)
    map.addLayer({
      id: `us-states-line-wanted-${person.id}`,
      type: "line",
      source: "us-states",
      minzoom: 2,
      filter: ["all", ["get", "__allView"], ["get", `__wanted_${person.id}`]],
      paint: {
        "line-color": person.color,
        "line-width": 2,
        "line-offset": offset,
        "line-opacity": 0.9,
        "line-dasharray": [2, 2],
      },
    }, labelLayerId);
  });
}

export function updateSources(map: maplibregl.Map, world: GeoJSON.FeatureCollection, usStates: GeoJSON.FeatureCollection) {
  const worldSource = map.getSource("countries") as maplibregl.GeoJSONSource | undefined;
  const stateSource = map.getSource("us-states") as maplibregl.GeoJSONSource | undefined;
  worldSource?.setData(world);
  stateSource?.setData(usStates);
}

export function flyToUS(map: maplibregl.Map) {
  console.log("[flyToUS] flying to US, current zoom:", map.getZoom());
  map.flyTo({ center: [-98.5795, 39.8283], zoom: 3.8, duration: 1200 });
  setTimeout(() => console.log("[flyToUS] post-fly zoom:", map.getZoom()), 1500);
}

export function flyToWorld(map: maplibregl.Map) {
  map.flyTo({ center: [0, 25], zoom: 1.4, duration: 1200 });
}

export function queryPlaceAt(
  map: maplibregl.Map,
  point: maplibregl.PointLike,
  mode: "world" | "us-states" = "world",
): { id: string; kind: "country" | "state"; name: string } | null {
  if (!map.isStyleLoaded()) return null;

  // In US-states mode, only select states — never the US country shape.
  if (mode === "us-states") {
    const stateLayer = map.getLayer("us-states-fill");
    if (stateLayer) {
      const stateFeatures = map.queryRenderedFeatures(point, { layers: ["us-states-fill"] });
      console.log("[queryPlaceAt] us-states mode, clicked point:", point, "found stateFeatures:", stateFeatures);
      if (stateFeatures.length) {
        const f = stateFeatures[0];
        const props = (f.properties ?? {}) as any;
        const id = String(f.id ?? props.id ?? "");
        const name = props.name ?? "";
        console.log("[queryPlaceAt] us-states mode, selected feature:", { id, name, props });
        return id ? { id, kind: "state", name } : null;
      }
    }
    return null;
  }

  // World mode: query states first, then countries.
  const stateLayer = map.getLayer("us-states-fill");
  if (stateLayer) {
    const stateFeatures = map.queryRenderedFeatures(point, { layers: ["us-states-fill"] });
    console.log("[queryPlaceAt] world mode, stateFeatures:", stateFeatures);
    if (stateFeatures.length) {
      const f = stateFeatures[0];
      const props = (f.properties ?? {}) as any;
      const id = String(f.id ?? props.id ?? "");
      const name = props.name ?? "";
      console.log("[queryPlaceAt] world mode, selected state feature:", { id, kind: "state", name, props });
      return id ? { id, kind: "state", name } : null;
    }
  }
  const countryLayer = map.getLayer("countries-fill");
  if (countryLayer) {
    const countryFeatures = map.queryRenderedFeatures(point, { layers: ["countries-fill"] });
    console.log("[queryPlaceAt] world mode, countryFeatures:", countryFeatures);
    if (countryFeatures.length) {
      const f = countryFeatures[0];
      const props = (f.properties ?? {}) as any;
      const id = String(f.id ?? props.id ?? "");
      const name = props.name ?? "";
      console.log("[queryPlaceAt] world mode, selected country feature:", { id, kind: "country", name, props });
      return id ? { id, kind: "country", name } : null;
    }
  }
  return null;
}
