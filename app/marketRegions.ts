export type MarketSegment = "CCR" | "RCR" | "OCR";

export type MarketRegionFeature = {
  type: "Feature";
  properties: { segment: MarketSegment };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
};

export type MarketRegionCollection = {
  type: "FeatureCollection";
  labels?: Record<MarketSegment, { lat: number; lng: number }>;
  boundaries?: Array<{
    type: "Feature";
    properties: { between: string };
    geometry: { type: "MultiLineString"; coordinates: number[][][] };
  }>;
  features: MarketRegionFeature[];
};

export const EMPTY_MARKET_REGIONS: MarketRegionCollection = { type: "FeatureCollection", features: [] };

export const MARKET_REGION_STYLE: Record<MarketSegment, { name: string; color: string }> = {
  CCR: { name: "核心中央区", color: "#a51f46" },
  RCR: { name: "中央区其他地区", color: "#c75d00" },
  OCR: { name: "中央区以外", color: "#00766c" },
};
