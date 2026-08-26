import { resolveGroups, type DeveloperDirectory, type DeveloperGroup, type DeveloperProject } from "./developers";
import type { Project, ProjectStatus } from "./types";

const normalise = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const KNOWN = new Set(["待公布", "待定位", "—", ""]);

export type PortfolioRow = {
  name: string;
  url: string;
  sourceUrl?: string;
  status: ProjectStatus | "历史项目";
  top: string | null;
  yearType: NonNullable<DeveloperProject["yearType"]> | "current_record";
  units: number | null;
  tenure: string | null;
  propertyType: string;
  referenceYear?: number;
  currentId?: string;
};

export type RankedDeveloper = {
  key: string;
  group: DeveloperGroup;
  rank: number;
  score: number;
  verifiedProjects: number;
  activeProjects: number;
  attributableUnits: number;
  activeProjectIds: string[];
  portfolio: PortfolioRow[];
};

const knownText = (value?: string) => value && !KNOWN.has(value) ? value : null;
const scorePart = (value: number, maximum: number, weight: number) => maximum > 0 ? value / maximum * weight : 0;

function rowFrom(entry: DeveloperProject, current?: Project): PortfolioRow {
  const currentTop = knownText(current?.top);
  const verifiedTop = entry.top == null ? null : String(entry.top);
  return {
    name: current?.name ?? entry.name,
    url: current?.website ?? entry.url,
    sourceUrl: entry.sourceUrl,
    status: current?.status ?? "历史项目",
    top: verifiedTop ?? currentTop,
    yearType: verifiedTop ? (entry.yearType ?? "unknown") : (currentTop ? "current_record" : "unknown"),
    units: current?.units || entry.units || null,
    tenure: knownText(current?.tenure) ?? entry.tenure ?? null,
    propertyType: entry.propertyType ?? "",
    referenceYear: entry.year,
    currentId: current ? String(current.id) : undefined,
  };
}

const statusOrder: Record<PortfolioRow["status"], number> = {
  "在售": 0,
  "售罄": 1,
  "即将开盘": 2,
  "确定开发": 3,
  "土地供应": 4,
  "历史项目": 5,
};

/**
 * Reproducible research ranking based only on data the site can verify.
 * JV unit counts are split equally among all resolved parent groups so the
 * market total is not multiplied by the number of partners.
 */
export function buildDeveloperRanking(projects: Project[], directory: DeveloperDirectory): RankedDeveloper[] {
  const entries = Object.entries(directory.groups);
  if (!entries.length) return [];

  const groupKeyByName = new Map(entries.map(([key, group]) => [group.name, key]));
  const currentByGroup = new Map<string, Map<string, Project>>(entries.map(([key]) => [key, new Map()]));
  const attributableUnits = new Map<string, number>(entries.map(([key]) => [key, 0]));

  for (const project of projects) {
    if (project.status === "土地供应") continue;
    const groupKeys = [...new Set(resolveGroups(project, directory)
      .map((group) => groupKeyByName.get(group.name))
      .filter((key): key is string => Boolean(key)))];
    if (!groupKeys.length) continue;
    const share = project.units / groupKeys.length;
    for (const key of groupKeys) {
      currentByGroup.get(key)?.set(normalise(project.name), project);
      attributableUnits.set(key, (attributableUnits.get(key) ?? 0) + share);
    }
  }

  const maxActive = Math.max(...entries.map(([key]) => currentByGroup.get(key)?.size ?? 0), 1);
  const maxUnits = Math.max(...entries.map(([key]) => attributableUnits.get(key) ?? 0), 1);

  const ranked = entries.map(([key, group]) => {
    const active = currentByGroup.get(key) ?? new Map<string, Project>();
    const seen = new Set<string>();
    const portfolio: PortfolioRow[] = [];

    for (const entry of group.projects) {
      const projectKey = normalise(entry.name);
      seen.add(projectKey);
      portfolio.push(rowFrom(entry, active.get(projectKey)));
    }
    for (const [projectKey, project] of active) {
      if (seen.has(projectKey)) continue;
      portfolio.push(rowFrom({ name: project.name, url: project.website ?? group.website }, project));
    }

    portfolio.sort((a, b) => {
      const status = statusOrder[a.status] - statusOrder[b.status];
      if (status) return status;
      const aYear = Number.parseInt(a.top ?? String(a.referenceYear ?? 0), 10) || 0;
      const bYear = Number.parseInt(b.top ?? String(b.referenceYear ?? 0), 10) || 0;
      return bYear - aYear || a.name.localeCompare(b.name);
    });

    const verifiedProjects = group.projects.length;
    const activeProjects = active.size;
    const units = attributableUnits.get(key) ?? 0;
    // Historical portfolios are intentionally display-only: the directory is
    // a curated representative sample, not a complete common time window.
    const score = scorePart(units, maxUnits, 55)
      + scorePart(activeProjects, maxActive, 45);

    return {
      key,
      group,
      rank: 0,
      score: Math.round(score * 10) / 10,
      verifiedProjects,
      activeProjects,
      attributableUnits: Math.round(units),
      activeProjectIds: [...active.values()].map((project) => String(project.id)),
      portfolio,
    };
  });

  ranked.sort((a, b) => b.score - a.score
    || b.attributableUnits - a.attributableUnits
    || a.group.name.localeCompare(b.group.name));
  return ranked.map((developer, index) => ({ ...developer, rank: index + 1 }));
}
