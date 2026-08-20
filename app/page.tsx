"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PLACE_TYPES,
  STATUS_CLASS,
  UNLOCATED,
  type PlaceType,
  type Project,
} from "./types";
import { DISTRICT_NAMES, districtLabel, districtOf, streetOf } from "./districts";
import {
  groupLabel,
  officialProjectUrl,
  pastProjects,
  resolveGroups,
  searchUrl,
  type DeveloperDirectory,
} from "./developers";
import {
  useDeveloperDirectory,
  useFavourites,
  usePlaceData,
  useProjects,
  useRailData,
} from "./useMapData";

const STATUS_FILTERS = ["全部", "在售", "即将开盘", "确定开发", "土地供应"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Place pins are noise at city zoom, so they only render once zoomed in. */
const PLACE_MIN_ZOOM = 13;

const PLACE_STYLE: Record<PlaceType, { symbol: string; color: string }> = {
  小学: { symbol: "小", color: "#3a6394" },
  中学: { symbol: "中", color: "#5c4589" },
  商场: { symbol: "购", color: "#a8445c" },
};

/** Leaflet tooltips take raw HTML, so anything from the data files is escaped. */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

export default function Home() {
  const { projects, updatedAt, status: dataStatus } = useProjects();
  const directory = useDeveloperDirectory();
  const { favourites, toggle: toggleFavourite } = useFavourites();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("全部");
  const [query, setQuery] = useState("");
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [showMrt, setShowMrt] = useState(true);
  // Schools and malls stay off until asked for: 557 extra pins bury the
  // projects, and their data is only fetched when a layer is switched on.
  const [placeFilters, setPlaceFilters] = useState<Record<PlaceType, boolean>>({
    小学: false, 中学: false, 商场: false,
  });
  const [listOpen, setListOpen] = useState(false);
  const [showDataInfo, setShowDataInfo] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  // Bumped on every pan/zoom so viewport-dependent layers re-render; `zoom` is
  // kept in state rather than read off the map ref during render.
  const [mapView, setMapView] = useState({ zoom: 11, version: 0 });

  const { lines: railLines, stations: railStations } = useRailData(showMrt);
  const anyPlaceLayer = placeFilters.小学 || placeFilters.中学 || placeFilters.商场;
  const places = usePlaceData(placeFilters.小学 || placeFilters.中学, placeFilters.商场);

  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const mrtLayer = useRef<L.LayerGroup | null>(null);
  const placesLayer = useRef<L.LayerGroup | null>(null);
  const stationRenderer = useRef<L.Canvas | null>(null);
  const markersById = useRef(new Map<string, L.Marker>());

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (activeStatus !== "全部" && project.status !== activeStatus) return false;
      if (onlyFavourites && !favourites.has(String(project.id))) return false;
      if (!keyword) return true;
      return `${project.name} ${project.area} ${project.developer}`.toLowerCase().includes(keyword);
    });
  }, [projects, activeStatus, query, onlyFavourites, favourites]);

  // Derived, not stored: a project filtered out of `visible` therefore closes
  // its own detail card, which previously stayed open describing a project
  // that no longer had a pin on the map.
  const selected = useMemo(
    () => visible.find((project) => String(project.id) === selectedId) ?? null,
    [visible, selectedId],
  );

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return;
    const map = L.map(mapElement.current, { zoomControl: false, attributionControl: true })
      .setView([1.3521, 103.8198], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    mapInstance.current = map;
    // Stations are drawn on a canvas: 240 individual SVG nodes measurably
    // slowed panning on the previous build.
    stationRenderer.current = L.canvas({ padding: 0.3 });
    markerLayer.current = L.layerGroup().addTo(map);
    mrtLayer.current = L.layerGroup().addTo(map);
    placesLayer.current = L.layerGroup().addTo(map);

    const onViewChange = () => setMapView((value) => ({ zoom: map.getZoom(), version: value.version + 1 }));
    map.on("moveend zoomend", onViewChange);
    const markers = markersById.current;
    setMapReady(true);

    return () => {
      map.off("moveend zoomend", onViewChange);
      map.remove();
      mapInstance.current = null;
      markerLayer.current = null;
      mrtLayer.current = null;
      placesLayer.current = null;
      markers.clear();
      setMapReady(false);
    };
  }, []);

  // Project pins: rebuilt only when the filtered set changes, never on
  // selection — selection just toggles a class on the existing element.
  useEffect(() => {
    const layer = markerLayer.current;
    if (!mapReady || !layer) return;
    layer.clearLayers();
    markersById.current.clear();

    visible.forEach((project) => {
      const id = String(project.id);
      const marker = L.marker([project.lat, project.lng], {
        icon: L.divIcon({
          className: "project-marker-shell",
          html: `<span class="real-map-pin ${STATUS_CLASS[project.status]}">${project.units}</span>`,
          iconSize: [44, 34],
          iconAnchor: [22, 30],
        }),
        keyboard: false,
      });
      const approximate = project.locationAccuracy === "district"
        ? "<br><em>位置为邮区中心估算</em>" : "";
      marker.bindTooltip(
        `<b>${escapeHtml(project.name)}</b><br>${escapeHtml(project.area)}${approximate}`,
        { direction: "top", offset: [0, -25] },
      );
      marker.on("click", () => setSelectedId(id));
      marker.addTo(layer);
      markersById.current.set(id, marker);
    });
  }, [visible, mapReady]);

  useEffect(() => {
    markersById.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("active", id === selectedId);
    });
  }, [selectedId, visible, mapReady]);

  useEffect(() => {
    const layer = mrtLayer.current;
    if (!mapReady || !layer) return;
    layer.clearLayers();
    if (!showMrt) return;

    railLines.forEach((line) => line.segments.forEach((points) => {
      L.polyline(points, {
        color: line.color,
        weight: line.status === "future" ? 2.2 : 2.6,
        opacity: line.status === "future" ? 0.3 : 0.4,
        dashArray: line.status === "future" ? "7 7" : undefined,
        lineCap: "round",
        interactive: false,
      }).addTo(layer);
    }));

    railStations.forEach((station) => {
      const future = station.status === "future";
      L.circleMarker([station.lat, station.lng], {
        renderer: stationRenderer.current ?? undefined,
        radius: future ? 4.5 : 3.6,
        color: future ? "#65736c" : "#fff",
        weight: future ? 1.5 : 1.3,
        dashArray: future ? "2 2" : undefined,
        fillColor: future ? "#fff" : "#44534c",
        fillOpacity: future ? 0.78 : 0.72,
      }).bindTooltip(
        `<b>${escapeHtml(station.name)}</b><br>${escapeHtml(station.ref || "站码待公布")} · ${future ? "建设中 / 规划中" : "运营中"}`,
        { direction: "top" },
      ).addTo(layer);
    });
  }, [mapReady, showMrt, railLines, railStations]);

  // Schools and malls are culled to the current viewport so the map never
  // holds hundreds of off-screen DOM pins.
  useEffect(() => {
    const layer = placesLayer.current;
    const map = mapInstance.current;
    if (!mapReady || !layer || !map) return;
    layer.clearLayers();
    if (!anyPlaceLayer || map.getZoom() < PLACE_MIN_ZOOM) return;

    const bounds = map.getBounds().pad(0.2);
    places.forEach((place) => {
      if (!placeFilters[place.type]) return;
      if (!bounds.contains([place.lat, place.lng])) return;
      const style = PLACE_STYLE[place.type];
      const details = place.address
        ? `<br>${escapeHtml(place.address)}${place.nearestMrt ? `<br>最近地铁：${escapeHtml(place.nearestMrt)}` : ""}`
        : "";
      L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: "place-marker-shell",
          html: `<span class="place-pin ${place.type === "商场" ? "mall" : "school"}" style="--place-color:${style.color}">${style.symbol}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        keyboard: false,
      }).bindTooltip(
        `<b>${escapeHtml(place.name)}</b><br>${place.type}${details}`,
        { direction: "top", offset: [0, -8] },
      ).addTo(layer);
    });
  }, [mapReady, placeFilters, places, anyPlaceLayer, mapView]);

  useEffect(() => {
    if (!selected || !mapInstance.current) return;
    const map = mapInstance.current;
    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 13), { duration: 0.7 });
  }, [selected]);

  const selectProject = (project: Project) => {
    setSelectedId(String(project.id));
    setListOpen(false);
  };

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">SG</span>
        <span>
          <h1>狮城新盘地图</h1>
          <small>私人住宅与 EC 研究工具</small>
        </span>
      </div>
      <div className="header-meta">
        {dataStatus === "ready" && <><span className="live-dot" aria-hidden="true" />数据更新于 {updatedAt}</>}
        {dataStatus === "loading" && <>正在载入数据…</>}
        {dataStatus === "error" && <span className="load-error">数据载入失败，请刷新重试</span>}
        <button type="button" onClick={() => setShowDataInfo(true)}>数据说明</button>
      </div>
    </header>

    <section className="workspace">
      <aside className={`sidebar ${listOpen ? "open" : ""}`}>
        <div className="search-wrap">
          <label htmlFor="search">搜索项目、地区或开发商</label>
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              id="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：武吉知马"
            />
          </div>
        </div>

        <div className="status-tabs" role="group" aria-label="按项目状态筛选">
          {STATUS_FILTERS.map((status) => <button
            key={status}
            type="button"
            className={activeStatus === status ? "active" : ""}
            aria-pressed={activeStatus === status}
            onClick={() => setActiveStatus(status)}
          >{status}</button>)}
        </div>

        <div className="results-head">
          <span><b>{visible.length}</b> 个项目</span>
          <button
            type="button"
            className={onlyFavourites ? "favourite-filter active" : "favourite-filter"}
            aria-pressed={onlyFavourites}
            onClick={() => setOnlyFavourites((value) => !value)}
          >★ 只看收藏 <span className="filter-count">{favourites.size}</span></button>
        </div>

        <div className="project-list">
          {visible.map((project) => <button
            key={project.id}
            type="button"
            className={`project-card ${String(project.id) === selectedId ? "selected" : ""}`}
            aria-current={String(project.id) === selectedId}
            onClick={() => selectProject(project)}
          >
            <div className="card-top">
              <span className={`status ${STATUS_CLASS[project.status]}`}><i aria-hidden="true" />{project.status}</span>
              <span className="units">
                {favourites.has(String(project.id)) && <span className="card-star" aria-label="已收藏">★</span>}
                {project.units.toLocaleString()} 户
              </span>
            </div>
            <h3>{project.name}</h3>
            <p>
              {streetOf(project.area)}
              {districtOf(project.area) && <span className="card-district">
                {districtLabel(districtOf(project.area)!)} · {DISTRICT_NAMES[districtOf(project.area)!]}
              </span>}
            </p>
            <div className="card-stats">
              <span><small>开盘</small>{project.launch}</span>
              <span><small>最近地铁</small>{project.mrt.split(" · ")[0]}</span>
            </div>
          </button>)}
          {!visible.length && dataStatus === "ready" && <div className="empty">没有符合条件的项目</div>}
          {dataStatus === "loading" && <div className="empty">正在载入项目数据…</div>}
          {dataStatus === "error" && <div className="empty">项目数据载入失败，请刷新页面重试。</div>}
        </div>
      </aside>

      <section className="map" aria-label="新加坡项目地图">
        <div ref={mapElement} className="real-map" />

        <div className="map-layers" role="group" aria-label="地图图层">
          <button
            type="button"
            className={showMrt ? "active mrt" : "mrt"}
            aria-pressed={showMrt}
            onClick={() => setShowMrt((value) => !value)}
          ><span aria-hidden="true">M</span>MRT</button>
          {PLACE_TYPES.map((type) => <button
            key={type}
            type="button"
            className={placeFilters[type] ? `active place-${PLACE_STYLE[type].symbol}` : `place-${PLACE_STYLE[type].symbol}`}
            aria-pressed={placeFilters[type]}
            onClick={() => setPlaceFilters((value) => ({ ...value, [type]: !value[type] }))}
          ><span aria-hidden="true">{PLACE_STYLE[type].symbol}</span>{type}</button>)}
        </div>

        {anyPlaceLayer && mapReady && mapView.zoom < PLACE_MIN_ZOOM
          && <p className="zoom-hint" role="status">放大地图以显示学校与商场</p>}

        <button
          type="button"
          className="list-toggle"
          aria-expanded={listOpen}
          onClick={() => setListOpen((value) => !value)}
        >{listOpen ? "收起列表" : `项目列表 (${visible.length})`}</button>

        <div className="legend">
          <span><i className="sale" aria-hidden="true" />在售</span>
          <span><i className="soon" aria-hidden="true" />即将开盘</span>
          <span><i className="confirmed" aria-hidden="true" />确定开发</span>
          <span><i className="land" aria-hidden="true" />土地供应</span>
        </div>

        {selected && <ProjectDetail
          project={selected}
          directory={directory}
          dataUpdatedAt={updatedAt}
          favourite={favourites.has(String(selected.id))}
          onToggleFavourite={() => toggleFavourite(String(selected.id))}
          onClose={() => setSelectedId(null)}
        />}
      </section>
    </section>

    {showDataInfo && <DataInfo updatedAt={updatedAt} onClose={() => setShowDataInfo(false)} />}
  </main>;
}

function ProjectDetail({ project, directory, dataUpdatedAt, favourite, onToggleFavourite, onClose }: {
  project: Project;
  directory: DeveloperDirectory;
  dataUpdatedAt: string;
  favourite: boolean;
  onToggleFavourite: () => void;
  onClose: () => void;
}) {
  const onSale = project.status === "在售";
  const unlocated = project.mrt === UNLOCATED;
  const district = districtOf(project.area);
  const groups = resolveGroups(project, directory);
  const official = officialProjectUrl(project, groups);
  const history = pastProjects(project, groups);
  return <article className="detail-card">
    <button className="close" type="button" aria-label="关闭项目详情" onClick={onClose}>×</button>
    <div className="detail-title">
      <div>
        <span className={`status ${STATUS_CLASS[project.status]}`}><i aria-hidden="true" />{project.status}</span>
        <h2>{project.name}</h2>
        <p>{project.area}{project.tenure !== "待公布" ? ` · ${project.tenure}` : ""}</p>
      </div>
      <button
        type="button"
        className={favourite ? "bookmark active" : "bookmark"}
        aria-pressed={favourite}
        aria-label={favourite ? "取消收藏" : "收藏该项目"}
        onClick={onToggleFavourite}
      >{favourite ? "★" : "☆"}</button>
    </div>

    <div className="inventory">
      <div><strong>{project.units.toLocaleString()}</strong><small>总户数</small></div>
      <div><strong>{onSale ? project.sold.toLocaleString() : "—"}</strong><small>已售</small></div>
      <div><strong>{onSale ? (project.units - project.sold).toLocaleString() : "—"}</strong><small>估算未售</small></div>
    </div>

    <dl className="facts">
      <div>
        <dt>邮区</dt>
        <dd>{district ? <>{districtLabel(district)}<span className="district-name">{DISTRICT_NAMES[district]}</span></> : "待公布"}</dd>
      </div>
      <div><dt>街道</dt><dd>{streetOf(project.area) || "待公布"}</dd></div>
      <div className="wide">
        <dt>开发商<span className="unit-note">URA 登记</span></dt>
        <dd>
          {project.developer}
          {groups.length > 0
            ? <span className="developer-groups">
                {groups.length > 1 && <span className="jv-note">合资：</span>}
                {groups.map((group) => <a
                  key={group.name}
                  className="developer-group"
                  href={group.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >{groupLabel(group)} ↗</a>)}
              </span>
            : <span className="school-count">所属集团待查证</span>}
        </dd>
      </div>
      <div><dt>预计开盘</dt><dd>{project.launch}</dd></div>
      <div><dt>预计 TOP</dt><dd>{project.top}</dd></div>
      <div><dt>最近地铁<span className="unit-note">直线</span></dt><dd>{project.mrt}</dd></div>
      <div className="wide">
        <dt>最近小学<span className="unit-note">直线</span></dt>
        <dd>
          {project.school}
          {typeof project.schoolsWithin1km === "number" && <span className="school-count">
            1km 内 {project.schoolsWithin1km} 所小学
            {(project.schoolsWithin1kmPartial ?? 0) > 0 && <>
              ，另 {project.schoolsWithin1kmPartial} 所仅部分栋可及
              <span className="school-note">
                该楼盘门牌跨度较大，报名优先权按各户实际地址计算
              </span>
            </>}
          </span>}
        </dd>
      </div>
    </dl>

    {history.length > 0 && <section className="developer-history">
      <h3>该开发商的其他楼盘<span className="unit-note">由近到远</span></h3>
      <ol>
        {history.map((entry) => <li key={`${entry.group}-${entry.name}`}>
          <a href={entry.url} target="_blank" rel="noopener noreferrer">{entry.name}</a>
          <span className="history-meta">
            {groups.length > 1 && <span className="history-group">{entry.group}</span>}
            <span className="history-year">{entry.year ?? "在售 / 筹备"}</span>
          </span>
        </li>)}
      </ol>
      <p className="history-source">
        取自{groups.map((group, index) => <span key={group.name}>
          {index > 0 && "、"}
          <a href={group.source} target="_blank" rel="noopener noreferrer">{group.name} 官网</a>
        </span>)}，年份为官网标注的落成年，未标注者为在售或筹备中。
      </p>
    </section>}

    <div className="source-note">
      <span>{project.source || "URA"}</span>
      库存来自 URA 开发商月报，最后核对于 {project.updatedAt || dataUpdatedAt}
      {unlocated && "；该项目尚未取得精确地址，图钉按邮区中心估算，距离数据暂缺"}
    </div>
    <a className="primary-action" href={official ?? searchUrl(project)} target="_blank" rel="noopener noreferrer">
      {official ? "查看开发商官方项目页" : "搜索该项目资料"} <span aria-hidden="true">→</span>
    </a>
  </article>;
}

function DataInfo({ updatedAt, onClose }: { updatedAt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  // The native dialog gives Escape handling, focus trapping and an inert
  // backdrop without reimplementing any of it.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    // A click landing on the dialog box itself rather than its contents is a
    // click on the backdrop.
    const onClick = (event: MouseEvent) => { if (event.target === element) element.close(); };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, []);

  return <dialog
    className="modal"
    ref={dialog}
    aria-labelledby="data-info-title"
    onClose={onClose}
  >
    <div className="modal-body">
      <button className="close" type="button" aria-label="关闭" onClick={() => dialog.current?.close()}>×</button>
      <h2 id="data-info-title">数据说明</h2>
      <dl>
        <dt>项目与库存</dt>
        <dd>URA 开发商销售月报（PMI_Resi_Developer_Sales）与住宅供应管道（PMI_Resi_Pipeline），每日自动同步，最后更新 {updatedAt}。URA 在次月 15 日发布上月销售数据。</dd>
        <dt>坐标</dt>
        <dd>优先取 URA 提供的 SVY21 坐标，其余通过 OneMap 地理编码。仍无法解析的项目按邮区中心估算，详情卡片会明确标注。</dd>
        <dt>地铁与学校距离</dt>
        <dd>由项目坐标计算的<b>直线距离</b>，非步行距离。学校坐标已按 MOE 登记邮编在 OneMap 上重新校准（原 OSM 坐标平均偏差数十米，足以影响 1km 判定）。</dd>
        <dt>1km 小学优先权</dt>
        <dd>MOE 按各户<b>实际门牌地址</b>量 1km。大型楼盘分多个门牌、跨度可达数百米，因此本站对每个门牌点分别计算：全部门牌都在 1km 内才计入「1km 内」，只有部分门牌在范围内的单独标注。仍属参考，报名请以 MOE 官方查询为准。</dd>
        <dt>轨道线路</dt>
        <dd>OpenStreetMap，含建设中与规划中线路（虚线）。几何已按 4m 容差简化。</dd>
        <dt>开发商与历史楼盘</dt>
        <dd>URA 登记的是项目公司（SPV）而非集团，且多数项目为合资。集团归属与历史楼盘均取自各开发商官网自有域名，逐条人工查证，链接不收中介引流站。目前仅部分项目完成查证，未查证的只显示 URA 原始开发商名。</dd>
      </dl>
      <p className="modal-note">本站为研究工具，数据可能滞后或有误，购房决策请以开发商与官方公告为准。</p>
    </div>
  </dialog>;
}
