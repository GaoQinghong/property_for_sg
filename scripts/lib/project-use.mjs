const MIXED_NAME_PARTS = [
  "AUREA", "BLOOMSBURY RESIDENCES", "CANNINGHILL PIERS", "HUDSON PLACE RESIDENCES",
  "J'DEN", "JDEN", "LUCERNE GRAND", "MIDTOWN BAY", "NEWPORT RESIDENCES",
  "ONE MARINA GARDENS", "PARKTOWN RESIDENCE", "PINERY RESIDENCES",
  "ROBERTSON OPUS", "SKYWATERS", "TENGAH GARDEN", "THE RESERVE RESIDENCES",
  "TMW MAXWELL", "UNION SQUARE RESIDENCES", "W RESIDENCES MARINA VIEW", "ZYON GRAND",
];

const COMMERCIAL_ENTITY = /COMMERCIAL|RETAIL|MALL|HOTEL|OFFICE|SERVICED/i;

export const URA_RESIDENTIAL_SOURCE = "https://eservice.ura.gov.sg/maps/api/";

export function classifyProjectUse(project) {
  const name = String(project.name || "").toUpperCase();
  const mixed = MIXED_NAME_PARTS.some((part) => name.includes(part))
    || COMMERCIAL_ENTITY.test(String(project.developer || ""));
  if (mixed) return {
    useType: "mixed",
    useBasis: "verified",
    useSource: project.website || URA_RESIDENTIAL_SOURCE,
  };
  return {
    useType: "residential",
    useBasis: "inferred",
    useSource: URA_RESIDENTIAL_SOURCE,
  };
}
