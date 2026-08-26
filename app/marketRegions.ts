export type MarketSegment = "CCR" | "RCR" | "OCR";

export type MarketRegionFeature = {
  type: "Feature";
  properties: { segment: MarketSegment };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
};

export type MarketRegionCollection = {
  type: "FeatureCollection";
  labels?: Record<MarketSegment, { lat: number; lng: number }>;
  features: MarketRegionFeature[];
};

export const EMPTY_MARKET_REGIONS: MarketRegionCollection = { type: "FeatureCollection", features: [] };

export const MARKET_REGION_STYLE: Record<MarketSegment, { name: string; color: string }> = {
  CCR: { name: "核心中央区", color: "#8f3152" },
  RCR: { name: "中央区其他地区", color: "#b06b16" },
  OCR: { name: "中央区以外", color: "#23706a" },
};
