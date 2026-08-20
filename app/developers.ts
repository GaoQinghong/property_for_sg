import type { Project } from "./types";

export type DeveloperProject = {
  name: string;
  /** A year published in the developer's portfolio; not assumed to be TOP. */
  year?: number;
  /** TOP year/date only when explicitly verified. */
  top?: string | number;
  /** Keeps actual TOP, completion and forward-looking dates distinct. */
  yearType?: "actual_top" | "completion" | "estimated_top" | "estimated_completion" | "expected_vp" | "unknown";
  units?: number;
  tenure?: string;
  propertyType?: string;
  url: string;
  /** Evidence for the facts above when it differs from the project page. */
  sourceUrl?: string;
};

export type DeveloperGroup = {
  name: string;
  nameZh?: string;
  website: string;
  source: string;
  domains?: string[];
  match: string[];
  projects: DeveloperProject[];
};

export type DeveloperDirectory = {
  updatedAt?: string;
  note?: string;
  groups: Record<string, DeveloperGroup>;
  /** SPV name (lowercased) → the groups behind it. Most launches are JVs. */
  spvOverrides: Record<string, string[]>;
};

export const EMPTY_DIRECTORY: DeveloperDirectory = { groups: {}, spvOverrides: {} };

const normalise = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Resolves the parent groups behind URA's `developer` field.
 *
 * URA registers the project-specific SPV ("Topaz Residential Pte Ltd"), not the
 * brand, so 121 of 124 projects carry a unique developer string — and most of
 * those SPVs are joint ventures, hence a list rather than a single group.
 * Resolution runs most-authoritative first:
 *   1. an explicit, individually verified override for an opaque SPV
 *   2. the project appears in a group's own published portfolio
 *   3. the SPV name itself carries the brand ("CDL Selesta Pte Ltd")
 */
export function resolveGroups(project: Project, directory: DeveloperDirectory): DeveloperGroup[] {
  const developer = String(project.developer ?? "").toLowerCase().trim();
  const override = directory.spvOverrides[developer];
  if (override?.length) {
    const groups = override.map((key) => directory.groups[key]).filter(Boolean);
    if (groups.length) return groups;
  }

  const entries = Object.entries(directory.groups);
  const projectKey = normalise(project.name);
  const claimed = entries
    .filter(([, group]) => group.projects.some((entry) => normalise(entry.name) === projectKey))
    .map(([, group]) => group);
  if (claimed.length) return claimed;

  const branded = entries
    .filter(([, group]) => group.match.some((needle) => developer.includes(needle)))
    .map(([, group]) => group);
  return branded;
}

/** The developer's own page for this project, when one of its groups publishes one. */
export function officialProjectUrl(project: Project, groups: DeveloperGroup[]): string | null {
  if (project.website) return project.website;
  const projectKey = normalise(project.name);
  for (const group of groups) {
    const match = group.projects.find((entry) => normalise(entry.name) === projectKey);
    if (match) return match.url;
  }
  return null;
}

export type HistoryEntry = DeveloperProject & { group: string };

const historyYear = (entry: DeveloperProject) => {
  const fromFact = entry.top == null ? NaN : Number.parseInt(String(entry.top), 10);
  return Number.isFinite(fromFact) ? fromFact : (entry.year ?? Number.NEGATIVE_INFINITY);
};

const historyDateType: Partial<Record<NonNullable<DeveloperProject["yearType"]>, string>> = {
  actual_top: "实际 TOP",
  completion: "竣工",
  estimated_top: "预计 TOP",
  estimated_completion: "预计竣工",
  expected_vp: "预计空置交付",
};

export function developerProjectDateLabel(entry: DeveloperProject): string {
  if (entry.top != null) {
    const type = entry.yearType ? historyDateType[entry.yearType] : undefined;
    return `${entry.top}${type ? ` · ${type}` : ""}`;
  }
  if (entry.year) return `${entry.year} · 官网目录年份`;
  return "年份待核实";
}

/**
 * Other developments by the same groups, sorted by an explicitly published
 * TOP/completion/reference year. Unknown dates stay at the end.
 */
export function pastProjects(project: Project, groups: DeveloperGroup[]): HistoryEntry[] {
  const projectKey = normalise(project.name);
  const seen = new Set<string>([projectKey]);
  const merged: HistoryEntry[] = [];

  for (const group of groups) {
    for (const entry of group.projects) {
      const key = normalise(entry.name);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...entry, group: group.nameZh || group.name });
    }
  }

  return merged.sort((a, b) => historyYear(b) - historyYear(a) || a.name.localeCompare(b.name));
}

export const groupLabel = (group: DeveloperGroup) =>
  group.nameZh ? `${group.nameZh} ${group.name}` : group.name;

export const searchUrl = (project: Project) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${project.name} Singapore condominium official`)}`;
