import type { Project } from "./types";
import { districtOf } from "./districts";

export type DistrictFeature = {
  type: "Feature";
  properties: {
    district: number;
    subzone: string;
    planningArea: string;
    /** Districts whose postal codes both appear inside this subzone. */
    straddles?: number[];
    /** No addresses inside it at all — district taken from the nearest subzone. */
    inferred?: boolean;
  };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};

export type DistrictCollection = {
  type: "FeatureCollection";
  /** Area-weighted label anchor per district, precomputed by the build script. */
  labels?: Record<string, { lat: number; lng: number }>;
  features: DistrictFeature[];
};

export const EMPTY_DISTRICTS: DistrictCollection = { type: "FeatureCollection", features: [] };

/**
 * Supply per district drives the fill, so the colour carries a measurement
 * rather than an arbitrary identity — 28 regions is far past the point where
 * distinct hues stay tellable apart, and the D-number labels carry identity.
 */
export function countByDistrict(projects: Project[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const project of projects) {
    const district = districtOf(project.area);
    if (district) counts.set(district, (counts.get(district) ?? 0) + 1);
  }
  return counts;
}

/**
 * A single-hue ordinal ramp, validated against the light chart surface:
 * monotone lightness, every adjacent gap ≥ 0.06 ΔL, light end ≥ 2:1.
 */
export const SUPPLY_BUCKETS: { min: number; label: string; color: string }[] = [
  { min: 13, label: "13+", color: "#0d366b" },
  { min: 9, label: "9–12", color: "#184f95" },
  { min: 5, label: "5–8", color: "#256abf" },
  { min: 3, label: "3–4", color: "#3987e5" },
  { min: 1, label: "1–2", color: "#86b6ef" },
];

/** Districts with no supply stay unfilled — absent reads better than "a little". */
export function fillFor(count: number): string | null {
  return SUPPLY_BUCKETS.find((bucket) => count >= bucket.min)?.color ?? null;
}
