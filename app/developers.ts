import type { Project } from "./types";

export type DeveloperProject = { name: string; year?: number; url: string };

export type DeveloperGroup = {
  name: string;
  nameZh?: string;
  website: string;
  source: string;
  match: string[];
  projects: DeveloperProject[];
};

export type DeveloperDirectory = {
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

/**
 * Other developments by the same groups, newest first. Entries without a
 * published year sort ahead of dated ones — those are the current and upcoming
 * launches, which are "nearest in time" by definition.
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

  return merged.sort((a, b) => (b.year ?? Number.POSITIVE_INFINITY) - (a.year ?? Number.POSITIVE_INFINITY));
}

export const groupLabel = (group: DeveloperGroup) =>
  group.nameZh ? `${group.nameZh} ${group.name}` : group.name;

export const searchUrl = (project: Project) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${project.name} Singapore condominium official`)}`;
