export const URA_TRANSACTION_SOURCE = "https://eservice.ura.gov.sg/property-market-information/pmiResidentialTransactionSearch";

export function formatTenure(value = "") {
  const text = String(value).trim();
  if (!text || text === "待公布") return "待公布";
  if (/^freehold$/i.test(text)) return "永久产权";
  const commencing = text.match(/^(\d+)\s*yrs?\s*lease commencing from\s*(\d{4})$/i);
  if (commencing) return `${commencing[1]} 年（自 ${commencing[2]} 年起）`;
  const leasehold = text.match(/^(\d+)\s*years?\s*leasehold$/i);
  if (leasehold) return `${leasehold[1]} 年`;
  return text;
}

export function tenureFromApi(project, ...records) {
  const raw = records.map((record) => record?.tenure).find(Boolean);
  if (raw) return {
    tenure: formatTenure(raw),
    tenureBasis: "verified",
    tenureSource: URA_TRANSACTION_SOURCE,
  };
  return {
    tenure: formatTenure(project.tenure),
    tenureBasis: project.tenureBasis || (project.tenure && project.tenure !== "待公布" ? "verified" : "pending"),
    ...(project.tenureSource ? { tenureSource: project.tenureSource } : {}),
  };
}
