export type ProjectStatus = "在售" | "售罄" | "即将开盘" | "确定开发" | "土地供应";

export type Project = {
  id: number | string;
  name: string;
  area: string;
  status: ProjectStatus;
  units: number;
  sold: number;
  developer: string;
  tenure: string;
  tenureBasis?: "verified" | "pending";
  tenureSource?: string;
  launch: string;
  top: string;
  /** "Newton · 470m", or "待定位" when the project has no exact position. */
  mrt: string;
  /** Nearest primary school, same shape as `mrt`. */
  school: string;
  /** Primary schools within 1km of *every* block; null when unlocated. */
  schoolsWithin1km?: number | null;
  /** Schools within 1km of some blocks but not all — the site straddles the radius. */
  schoolsWithin1kmPartial?: number | null;
  lat: number;
  lng: number;
  /** Per-block address points, present only when a project registers several. */
  addressPoints?: { lat: number; lng: number }[];
  updatedAt?: string;
  source?: string;
  locationAccuracy?: "exact" | "district";
  website?: string;
  /** Actual/project-marketing use where verified; otherwise inferred from URA's residential datasets. */
  useType: "residential" | "mixed";
  useBasis: "verified" | "inferred";
  useSource?: string;
  /** Physical housing form, separate from residential/mixed project use. */
  housingType: "non-landed" | "landed" | "strata-landed";
  housingTypeBasis: "verified" | "inferred";
  housingTypeSource?: string;
};

export type RailLine = {
  ref: string;
  name: string;
  color: string;
  status: "operating" | "future";
  segments: [number, number][][];
};

export type RailStation = {
  name: string;
  ref: string;
  lat: number;
  lng: number;
  station: string;
  status: "operating" | "future";
};

export type PlaceType = "小学" | "中学" | "商场";

export type Place = {
  name: string;
  type: PlaceType;
  lat: number;
  lng: number;
  address?: string;
  nearestMrt?: string;
  bus?: string;
};

export const STATUS_CLASS: Record<ProjectStatus, string> = {
  在售: "sale",
  售罄: "sold-out",
  即将开盘: "soon",
  确定开发: "confirmed",
  土地供应: "land",
};

export const PLACE_TYPES: PlaceType[] = ["小学", "中学", "商场"];

/** Placeholder written by the updater when a project has no exact position. */
export const UNLOCATED = "待定位";
