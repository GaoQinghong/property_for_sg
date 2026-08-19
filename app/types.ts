export type ProjectStatus = "在售" | "即将开盘" | "确定开发" | "土地供应";

export type Project = {
  id: number | string;
  name: string;
  area: string;
  status: ProjectStatus;
  units: number;
  sold: number;
  developer: string;
  tenure: string;
  launch: string;
  top: string;
  /** "Newton · 470m", or "待定位" when the project has no exact position. */
  mrt: string;
  /** Nearest primary school, same shape as `mrt`. */
  school: string;
  /** Primary schools inside the 1km priority radius; null when unlocated. */
  schoolsWithin1km?: number | null;
  lat: number;
  lng: number;
  updatedAt?: string;
  source?: string;
  locationAccuracy?: "exact" | "district";
  website?: string;
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
  即将开盘: "soon",
  确定开发: "confirmed",
  土地供应: "land",
};

export const PLACE_TYPES: PlaceType[] = ["小学", "中学", "商场"];

/** Placeholder written by the updater when a project has no exact position. */
export const UNLOCATED = "待定位";
