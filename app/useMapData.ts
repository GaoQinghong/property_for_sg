import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place, Project, RailLine, RailStation } from "./types";
import { EMPTY_DIRECTORY, type DeveloperDirectory } from "./developers";
import { EMPTY_DISTRICTS, type DistrictCollection } from "./districtLayer";
import { EMPTY_MARKET_REGIONS, type MarketRegionCollection } from "./marketRegions";

const dataUrl = (name: string) => new URL(`./data/${name}`, document.baseURI).href;

async function loadJson<T>(name: string): Promise<T> {
  // GitHub Pages may otherwise reuse yesterday's JSON after a data-only
  // deployment. Each dataset is fetched at most once per page session.
  const response = await fetch(dataUrl(name), { cache: "no-store" });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

type ProjectsFile = { updatedAt?: string; projects: Project[] };

export type ProjectsState = {
  projects: Project[];
  updatedAt: string;
  status: "loading" | "ready" | "error";
};

/** Projects are the page's primary content, so they load immediately. */
export function useProjects(): ProjectsState {
  const [state, setState] = useState<ProjectsState>({ projects: [], updatedAt: "", status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadJson<ProjectsFile>("projects.json")
      .then((file) => {
        if (cancelled) return;
        const projects = Array.isArray(file) ? (file as Project[]) : file.projects;
        setState({
          projects: projects ?? [],
          updatedAt: (Array.isArray(file) ? "" : file.updatedAt) ?? "",
          status: "ready",
        });
      })
      .catch((error) => {
        console.error("项目数据载入失败", error);
        if (!cancelled) setState({ projects: [], updatedAt: "", status: "error" });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/**
 * Fetches a reference dataset the first time its layer is switched on, then
 * keeps it. The rail geometry alone is 95KB, and the school/mall lists another
 * 143KB — none of it is worth downloading for a visitor who only wants to see
 * where the projects are.
 */
function useLazyDataset<T>(name: string, enabled: boolean, empty: T): T {
  const [data, setData] = useState<T>(empty);
  const requested = useRef(false);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    loadJson<T>(name)
      .then(setData)
      .catch((error) => {
        console.error(`${name} 载入失败`, error);
        requested.current = false;
      });
  }, [name, enabled]);

  return data;
}

const NO_LINES: RailLine[] = [];
const NO_STATIONS: RailStation[] = [];
const NO_PLACES: Place[] = [];

export function useRailData(enabled: boolean) {
  const lines = useLazyDataset<RailLine[]>("mrt-lines.json", enabled, NO_LINES);
  const stations = useLazyDataset<RailStation[]>("mrt-stations.json", enabled, NO_STATIONS);
  return { lines, stations };
}

export function usePlaceData(schoolsEnabled: boolean, mallsEnabled: boolean) {
  const schools = useLazyDataset<Place[]>("schools.json", schoolsEnabled, NO_PLACES);
  const malls = useLazyDataset<Place[]>("malls.json", mallsEnabled, NO_PLACES);
  return useMemo(
    () => (schools.length || malls.length ? [...schools, ...malls] : NO_PLACES),
    [schools, malls],
  );
}

/**
 * The developer directory is small (a few KB) and every detail card needs it,
 * so it loads alongside the projects rather than lazily.
 */
export type DeveloperDirectoryState = {
  directory: DeveloperDirectory;
  status: "loading" | "ready" | "error";
};

export function useDeveloperDirectoryState(): DeveloperDirectoryState {
  const [state, setState] = useState<DeveloperDirectoryState>({
    directory: EMPTY_DIRECTORY,
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    loadJson<DeveloperDirectory>("developers.json")
      .then((data) => { if (!cancelled) setState({ directory: data, status: "ready" }); })
      .catch((error) => {
        console.error("开发商目录载入失败", error);
        if (!cancelled) setState({ directory: EMPTY_DIRECTORY, status: "error" });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function useDeveloperDirectory(): DeveloperDirectory {
  return useDeveloperDirectoryState().directory;
}

/** Postal-district polygons, fetched the first time the layer is switched on. */
export function useDistricts(enabled: boolean): DistrictCollection {
  return useLazyDataset<DistrictCollection>("districts.json", enabled, EMPTY_DISTRICTS);
}

/** URA CCR/RCR/OCR boundaries, fetched only when their layer is enabled. */
export function useMarketRegions(enabled: boolean): MarketRegionCollection {
  return useLazyDataset<MarketRegionCollection>("market-regions.json", enabled, EMPTY_MARKET_REGIONS);
}

/** Project ids the visitor has starred, persisted across sessions. */
const STORAGE_KEY = "sg-property-map:favourites";

function readFavourites(): Set<string> {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    // A blocked or corrupt localStorage just means no saved favourites.
    return new Set();
  }
}

export function useFavourites() {
  // The site renders entirely on the client, so reading storage in the state
  // initialiser is safe and avoids a second render pass.
  const [favourites, setFavourites] = useState<Set<string>>(readFavourites);

  const toggle = useCallback((id: string) => {
    setFavourites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Persisting is best-effort; the in-memory set still works.
      }
      return next;
    });
  }, []);

  return { favourites, toggle };
}
