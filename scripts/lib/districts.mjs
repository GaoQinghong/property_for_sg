/**
 * Postal sector → postal district.
 *
 * Singapore has no official polygon for D01–D28; the districts are defined by
 * the first two digits of the postal code. Sector 74 is intentionally absent —
 * it is not in use (verified against OneMap, which returns nothing for 74xxxx).
 */
export const SECTOR_TO_DISTRICT = {
  "01": 1, "02": 1, "03": 1, "04": 1, "05": 1, "06": 1,
  "07": 2, "08": 2,
  "14": 3, "15": 3, "16": 3,
  "09": 4, "10": 4,
  "11": 5, "12": 5, "13": 5,
  "17": 6,
  "18": 7, "19": 7,
  "20": 8, "21": 8,
  "22": 9, "23": 9,
  "24": 10, "25": 10, "26": 10, "27": 10,
  "28": 11, "29": 11, "30": 11,
  "31": 12, "32": 12, "33": 12,
  "34": 13, "35": 13, "36": 13, "37": 13,
  "38": 14, "39": 14, "40": 14, "41": 14,
  "42": 15, "43": 15, "44": 15, "45": 15,
  "46": 16, "47": 16, "48": 16,
  "49": 17, "50": 17, "81": 17,
  "51": 18, "52": 18,
  "53": 19, "54": 19, "55": 19, "82": 19,
  "56": 20, "57": 20,
  "58": 21, "59": 21,
  "60": 22, "61": 22, "62": 22, "63": 22, "64": 22,
  "65": 23, "66": 23, "67": 23, "68": 23,
  "69": 24, "70": 24, "71": 24,
  "72": 25, "73": 25,
  "77": 26, "78": 26,
  "75": 27, "76": 27,
  "79": 28, "80": 28,
};

export function districtOfPostal(postal) {
  const code = String(postal ?? "").padStart(6, "0");
  return SECTOR_TO_DISTRICT[code.slice(0, 2)] ?? null;
}

/** Ray casting against one linear ring. */
function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > point.lat) !== (yj > point.lat)
      && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon for GeoJSON Polygon and MultiPolygon, holes respected. */
export function containsPoint(geometry, point) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  for (const rings of polygons) {
    if (!inRing(point, rings[0])) continue;
    const inHole = rings.slice(1).some((hole) => inRing(point, hole));
    if (!inHole) return true;
  }
  return false;
}

/** Area-weighted centroid, used to place one label per district. */
export function centroidOf(geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const rings of polygons) {
    const ring = rings[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      area += cross;
      cx += (ring[j][0] + ring[i][0]) * cross;
      cy += (ring[j][1] + ring[i][1]) * cross;
    }
  }
  if (area === 0) return null;
  return { lng: cx / (3 * area), lat: cy / (3 * area), area: Math.abs(area / 2) };
}
