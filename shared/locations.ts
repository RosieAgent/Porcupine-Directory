import { nhPlaces } from "./nh-places.js";

export type LocationOption = { id: string; label: string; group: string };
// Tourism-region names: https://www.visitnh.gov/things-to-do/scenic-drives
const regions = [
  "Dartmouth/Lake Sunapee",
  "Great North Woods",
  "Lakes Region",
  "Merrimack Valley",
  "Monadnock Region",
  "Seacoast",
  "White Mountains",
];
export const locationOptions: LocationOption[] = [
  { id: "nh", label: "New Hampshire", group: "Statewide" },
  ...regions.map((name) => ({
    id: "region-" + name.toLowerCase().replace(/[^a-z]+/g, "-"),
    label: name + ", NH",
    group: "Regions",
  })),
  ...[...new Set(nhPlaces.map((place) => place.county))].sort().map((name) => ({
    id: "county-" + name.toLowerCase(),
    label: name + " County, NH",
    group: "Counties",
  })),
  ...nhPlaces.map((place) => ({
    id: place.id,
    label: place.name + ", NH",
    group: "Towns, cities & places",
  })),
];

export function locationMatchKey(value: string): string {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/,?\s+(nh|new hampshire)$/, "")
    .trim();
  return name === "nh" ? "new hampshire" : name;
}
const catalog = new Map(
  locationOptions.map((option) => [locationMatchKey(option.label), option]),
);
export function findLocation(value: string) {
  return catalog.get(locationMatchKey(value));
}
export function normalizeLocation(value: string): string {
  return findLocation(value)?.label ?? value.trim();
}
export function locationChoices(legacy: string[] = []) {
  const known = new Set(
    locationOptions.map((option) => locationMatchKey(option.label)),
  );
  const additional: LocationOption[] = [];
  for (const value of legacy) {
    const key = locationMatchKey(value);
    if (!key || known.has(key)) continue;
    known.add(key);
    additional.push({
      id: "legacy-" + key,
      label: value,
      group: "Existing location (not in catalog)",
    });
  }
  return [...locationOptions, ...additional];
}
