const VERIFIED_HOUSING_TYPES = new Map([
  ["CASHEW GREEN", { type: "landed", source: "https://eservice.ura.gov.sg/property-market-information/pmiResidentialTransactionSearch" }],
  ["LANDED HOUSING DEVELOPMENT", { type: "landed", source: "https://eservice.ura.gov.sg/maps/api/" }],
  ["POLLEN COLLECTION", { type: "landed", source: "https://www.bukitsembawang.sg/" }],
  ["POLLEN COLLECTION II", { type: "landed", source: "https://www.bukitsembawang.sg/PollenCollection-2/" }],
  ["SPRING WATERS VILLAS", { type: "landed", source: "https://eservice.ura.gov.sg/property-market-information/pmiResidentialTransactionSearch" }],
  ["LENTOR GARDENS RESIDENCES", { type: "strata-landed", source: "https://kingsford.com.sg/lentorgardensresidences/" }],
]);

export const URA_HOUSING_SOURCE = "https://eservice.ura.gov.sg/maps/api/";

export function classifyHousingType(project) {
  const verified = VERIFIED_HOUSING_TYPES.get(String(project.name || "").trim().toUpperCase());
  if (verified) return {
    housingType: verified.type,
    housingTypeBasis: "verified",
    housingTypeSource: verified.source,
  };
  return {
    housingType: "non-landed",
    housingTypeBasis: "inferred",
    housingTypeSource: URA_HOUSING_SOURCE,
  };
}
