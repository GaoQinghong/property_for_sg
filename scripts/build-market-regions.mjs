/**
 * Builds URA's three private-residential market segments from the same Master
 * Plan subzones used by the postal layer.
 *
 * Official definition:
 *   CCR = postal districts 9–11 + Downtown Core + Sentosa
 *   RCR = Central Region outside CCR
 *   OCR = planning areas outside Central Region
 *
 *   node scripts/build-market-regions.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import polygonClipping from "polygon-clipping";

const source = new URL("../public/data/districts.json", import.meta.url);
const target = new URL("../public/data/market-regions.json", import.meta.url);

const CENTRAL_PLANNING_AREAS = new Set([
  "DOWNTOWN CORE", "ORCHARD", "MARINA EAST", "MARINA SOUTH", "MUSEUM", "NEWTON",
  "OUTRAM", "RIVER VALLEY", "ROCHOR", "SINGAPORE RIVER", "STRAITS VIEW", "BISHAN",
  "BUKIT MERAH", "BUKIT TIMAH", "GEYLANG", "KALLANG", "MARINE PARADE", "NOVENA",
  "QUEENSTOWN", "SOUTHERN ISLANDS", "TANGLIN", "TOA PAYOH",
]);

function marketSegment(feature) {
  const { district, planningArea, subzone } = feature.properties;
  if ((district >= 9 && district <= 11) || planningArea === "DOWNTOWN CORE" || subzone === "SENTOSA") return "CCR";
  return CENTRAL_PLANNING_AREAS.has(planningArea) ? "RCR" : "OCR";
}

const districts = JSON.parse(await readFile(source, "utf8"));
const order = ["OCR", "RCR", "CCR"];
const features = order.map((segment) => {
  const polygons = districts.features
    .filter((feature) => marketSegment(feature) === segment)
    .map((feature) => feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates]);
  const coordinates = polygonClipping.union(...polygons);
  return {
    type: "Feature",
    properties: { segment },
    geometry: { type: "MultiPolygon", coordinates },
  };
});

const output = {
  type: "FeatureCollection",
  source: "URA REALIS market-segment definition; URA Master Plan subzone geometry",
  labels: {
    CCR: { lat: 1.304, lng: 103.829 },
    RCR: { lat: 1.322, lng: 103.906 },
    OCR: { lat: 1.397, lng: 103.746 },
  },
  features,
};
await writeFile(target, `${JSON.stringify(output)}\n`);
console.log(`已写入 ${features.length} 个市场区：${features.map((feature) => feature.properties.segment).join(" / ")}`);
