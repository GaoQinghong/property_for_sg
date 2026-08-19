/** Derives nearest-MRT and nearby-school facts for projects. */
import { distanceMetres, formatDistance, nearest } from "./geo.mjs";

// OSM tags Singapore's LRT and the Sentosa Express as "monorail" alongside the
// real MRT network, so pick the heavy-rail stations by tag and treat LRT as a
// fallback only. Sentosa Express stops are excluded outright — they are not
// public commuter rail and would otherwise win on distance for Sentosa units.
const SENTOSA_EXPRESS = new Set(["A", "A South", "B", "C", "D", "E", "F", "Beach", "Imbiah", "Cove", "Waterfront", "Merlion", "VivoCity"]);

function isMrt(station) {
  return station.station === "subway" || station.station === "train";
}

function isLrt(station) {
  return (station.station === "monorail" || station.station === "light_rail") && !SENTOSA_EXPRESS.has(station.name);
}

export const SCHOOL_PRIORITY_RADIUS_M = 1000;

/**
 * Fills `mrt`, `school` and `schoolsWithin1km` for one project.
 *
 * Only projects with an exact location get computed distances: a district
 * fallback pin is a hashed jitter around the district centre, so any distance
 * measured from it would be fiction presented as fact.
 */
export function enrichProject(project, { stations, schools }) {
  if (project.locationAccuracy !== "exact") {
    return { ...project, mrt: "待定位", school: "待定位", schoolsWithin1km: null };
  }

  const origin = { lat: project.lat, lng: project.lng };

  const operating = stations.filter((station) => station.status === "operating");
  const nearestRail = nearest(origin, operating.filter(isMrt)) || nearest(origin, operating.filter(isLrt));
  const mrt = nearestRail
    ? `${nearestRail.point.name} · ${formatDistance(nearestRail.metres)}`
    : "待定位";

  const primary = schools.filter((school) => school.type === "小学");
  const nearestPrimary = nearest(origin, primary);
  const within1km = primary.filter((school) => distanceMetres(origin, school) <= SCHOOL_PRIORITY_RADIUS_M).length;
  const school = nearestPrimary
    ? `${nearestPrimary.point.name} · ${formatDistance(nearestPrimary.metres)}`
    : "待定位";

  return { ...project, mrt, school, schoolsWithin1km: within1km };
}

export function enrichProjects(projects, sources) {
  return projects.map((project) => enrichProject(project, sources));
}
