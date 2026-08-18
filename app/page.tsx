"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProjectStatus = "在售" | "即将开盘" | "确定开发" | "土地供应";
const projects = [
  { id: 1, name: "Dunearn House", area: "武吉知马 · D11", status: "在售" as ProjectStatus, units: 228, sold: 86, developer: "Frasers Property / Sekisui House", tenure: "99 年", launch: "2026 年 7 月", top: "2030", mrt: "Botanic Gardens · 760m", school: "南洋小学 · 1km 内", lat: 1.3268, lng: 103.8121 },
  { id: 2, name: "Thomson Reserve", area: "汤申 · D20", status: "即将开盘" as ProjectStatus, units: 540, sold: 0, developer: "待最终确认", tenure: "99 年", launch: "预计 2026 下半年", top: "待公布", mrt: "Upper Thomson · 320m", school: "爱同学校 · 1km 内", lat: 1.3545, lng: 103.8328 },
  { id: 3, name: "Narra Residences", area: "山景 · D23", status: "在售" as ProjectStatus, units: 540, sold: 193, developer: "Santander Properties", tenure: "99 年", launch: "2026 年", top: "2030", mrt: "Hillview · 1.2km", school: "CHIJ Our Lady Queen of Peace", lat: 1.3659, lng: 103.7634 },
  { id: 4, name: "River Valley Green (Parcel C)", area: "里峇峇利 · D09", status: "确定开发" as ProjectStatus, units: 470, sold: 0, developer: "土地已中标", tenure: "99 年", launch: "尚未公布", top: "待公布", mrt: "Great World · 450m", school: "River Valley Primary · 1km 内", lat: 1.2936, lng: 103.8258 },
  { id: 5, name: "Bayshore Drive", area: "东海岸 · D16", status: "确定开发" as ProjectStatus, units: 1280, sold: 0, developer: "土地已中标", tenure: "99 年", launch: "尚未公布", top: "待公布", mrt: "Bayshore · 120m", school: "Temasek Primary", lat: 1.3126, lng: 103.9412 },
  { id: 6, name: "Marina Gardens Lane", area: "滨海湾 · D01", status: "土地供应" as ProjectStatus, units: 775, sold: 0, developer: "尚未招标", tenure: "99 年", launch: "预计 2026 年 8 月卖地", top: "待公布", mrt: "Marina South · 180m", school: "—", lat: 1.2786, lng: 103.8682 },
];
const statusClass: Record<ProjectStatus, string> = { 在售: "sale", 即将开盘: "soon", 确定开发: "confirmed", 土地供应: "land" };
type RailLine = { ref:string; name:string; color:string; status:"operating"|"future"; segments:number[][][] };
type RailStation = { name:string; ref:string; lat:number; lng:number; station:string; status:"operating"|"future" };
const places = [
  {name:"南洋小学",type:"小学",lat:1.3211,lng:103.8078},{name:"莱佛士女子小学",type:"小学",lat:1.3327,lng:103.8065},{name:"爱同学校",type:"小学",lat:1.3607,lng:103.8331},{name:"美以美女校（小学）",type:"小学",lat:1.3249,lng:103.8282},{name:"River Valley Primary",type:"小学",lat:1.2935,lng:103.8363},{name:"Temasek Primary",type:"小学",lat:1.3175,lng:103.9453},{name:"Pei Hwa Presbyterian Primary",type:"小学",lat:1.3382,lng:103.7761},
  {name:"华侨中学",type:"中学",lat:1.3258,lng:103.8056},{name:"国家初级学院",type:"中学",lat:1.3304,lng:103.8045},{name:"圣若瑟书院",type:"中学",lat:1.3328,lng:103.8286},{name:"CHIJ Secondary",type:"中学",lat:1.3329,lng:103.8428},{name:"Bukit Panjang Govt High",type:"中学",lat:1.3822,lng:103.7383},{name:"Temasek Secondary",type:"中学",lat:1.315,lng:103.9473},
  {name:"ION Orchard",type:"商场",lat:1.304,lng:103.8318},{name:"Great World",type:"商场",lat:1.2938,lng:103.8319},{name:"VivoCity",type:"商场",lat:1.2644,lng:103.8221},{name:"Jewel Changi Airport",type:"商场",lat:1.3602,lng:103.9897},{name:"Junction 8",type:"商场",lat:1.3507,lng:103.8488},{name:"The Rail Mall",type:"商场",lat:1.3581,lng:103.7679},{name:"Parkway Parade",type:"商场",lat:1.3013,lng:103.9052},{name:"West Mall",type:"商场",lat:1.35,lng:103.7497},
] as const;

export default function Home() {
  const [selected, setSelected] = useState(projects[0]);
  const [activeStatus, setActiveStatus] = useState<ProjectStatus | "全部">("全部");
  const [query, setQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [showMrt, setShowMrt] = useState(true);
  const [railLines, setRailLines] = useState<RailLine[]>([]);
  const [railStations, setRailStations] = useState<RailStation[]>([]);
  const [placeFilters, setPlaceFilters] = useState({ 小学:true, 中学:true, 商场:true });
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const mrtLayer = useRef<any>(null);
  const placesLayer = useRef<any>(null);
  const visible = useMemo(() => projects.filter((project) => {
    const keyword = query.trim().toLowerCase();
    return (activeStatus === "全部" || project.status === activeStatus) && (!keyword || `${project.name} ${project.area} ${project.developer}`.toLowerCase().includes(keyword));
  }), [activeStatus, query]);

  useEffect(() => {
    Promise.all([
      fetch("./data/mrt-lines.json").then(response => response.json()),
      fetch("./data/mrt-stations.json").then(response => response.json()),
    ]).then(([lines, stations]) => { setRailLines(lines); setRailStations(stations); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startMap = () => {
      if (cancelled || !mapElement.current || mapInstance.current) return;
      const L = (window as any).L;
      if (!L) return;
      const map = L.map(mapElement.current, { zoomControl: false, attributionControl: true }).setView([1.3521, 103.8198], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      L.control.zoom({ position: "topright" }).addTo(map);
      mapInstance.current = map;
      markerLayer.current = L.layerGroup().addTo(map);
      mrtLayer.current = L.layerGroup().addTo(map);
      placesLayer.current = L.layerGroup().addTo(map);
      setMapReady(true);
    };
    if ((window as any).L) startMap();
    else {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet"; stylesheet.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(stylesheet);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.onload = startMap;
      document.head.appendChild(script);
    }
    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !markerLayer.current) return;
    markerLayer.current.clearLayers();
    visible.forEach(project => {
      const marker = L.marker([project.lat, project.lng], { icon: L.divIcon({ className: "project-marker-shell", html: `<span class="real-map-pin ${statusClass[project.status]}">${project.units}</span>`, iconSize: [44, 34], iconAnchor: [22, 30] }) });
      marker.bindTooltip(`<b>${project.name}</b><br>${project.area}`, { direction: "top", offset: [0, -25] });
      marker.on("click", () => setSelected(project));
      marker.addTo(markerLayer.current);
    });
  }, [visible, mapReady]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mrtLayer.current) return;
    mrtLayer.current.clearLayers();
    if (!showMrt) return;
    railLines.forEach(line => line.segments.forEach(points => L.polyline(points, { color:line.color, weight:line.status === "future" ? 2.2 : 2.6, opacity:line.status === "future" ? .22 : .28, dashArray:line.status === "future" ? "7 7" : undefined, lineCap:"round" }).bindTooltip(`${line.ref} · ${line.status === "future" ? "未来线路" : "运营线路"}`, { sticky:true }).addTo(mrtLayer.current)));
    railStations.forEach(station => {
      const future = station.status === "future";
      L.circleMarker([station.lat,station.lng], { radius:future ? 4.5 : 3.6, color:future ? "#65736c" : "#fff", weight:future ? 1.5 : 1.3, dashArray:future ? "2 2" : undefined, fillColor:future ? "#fff" : "#44534c", fillOpacity:future ? .78 : .72 })
        .bindTooltip(`<b>${station.name}</b><br>${station.ref || "站码待公布"} · ${future ? "建设中 / 规划中" : "运营中"}`, { direction:"top" }).addTo(mrtLayer.current);
    });
  }, [mapReady, showMrt, railLines, railStations]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !placesLayer.current) return;
    placesLayer.current.clearLayers();
    const config:Record<string,{symbol:string,color:string}> = { 小学:{symbol:"小",color:"#4878b7"}, 中学:{symbol:"中",color:"#7255a6"}, 商场:{symbol:"购",color:"#c35c72"} };
    places.filter(place => placeFilters[place.type]).forEach(place => {
      const style = config[place.type];
      const markerType = place.type === "商场" ? "mall" : "school";
      L.marker([place.lat,place.lng], { icon:L.divIcon({ className:"place-marker-shell", html:`<span class="place-pin ${markerType}" style="--place-color:${style.color}">${style.symbol}</span>`, iconSize:[24,24], iconAnchor:[12,12] }) })
        .bindTooltip(`<b>${place.name}</b><br>${place.type}`, { direction:"top", offset:[0,-8] }).addTo(placesLayer.current);
    });
  }, [mapReady, placeFilters]);

  useEffect(() => { mapInstance.current?.flyTo([selected.lat, selected.lng], Math.max(mapInstance.current.getZoom(), 13), { duration: .7 }); }, [selected]);

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">SG</span><span><strong>狮城新盘地图</strong><small>私人住宅与 EC 研究工具</small></span></a>
      <div className="header-meta"><span className="live-dot" />数据更新于 2026-08-18 <button>数据说明</button></div>
    </header>
    <section className="workspace">
      <aside className="sidebar">
        <div className="search-wrap"><label htmlFor="search">搜索项目、地区或开发商</label><div className="search-box"><span>⌕</span><input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例如：武吉知马" /></div></div>
        <div className="status-tabs">{(["全部", "在售", "即将开盘", "确定开发", "土地供应"] as const).map(status => <button key={status} className={activeStatus === status ? "active" : ""} onClick={() => setActiveStatus(status)}>{status}</button>)}</div>
        <div className="results-head"><span><b>{visible.length}</b> 个项目</span><button>筛选 <span className="filter-count">3</span></button></div>
        <div className="project-list">{visible.map(project => <button key={project.id} className={`project-card ${selected.id === project.id ? "selected" : ""}`} onClick={() => setSelected(project)}>
          <div className="card-top"><span className={`status ${statusClass[project.status]}`}><i />{project.status}</span><span className="units">{project.units.toLocaleString()} 户</span></div>
          <h2>{project.name}</h2><p>{project.area} · {project.tenure}</p>
          <div className="card-stats"><span><small>开盘</small>{project.launch}</span><span><small>最近地铁</small>{project.mrt.split(" · ")[0]}</span></div>
        </button>)}{!visible.length && <div className="empty">没有符合条件的项目</div>}</div>
      </aside>
      <section className="map" aria-label="新加坡项目地图">
        <div ref={mapElement} className="real-map" />
        <div className="map-layers">
          <button className={showMrt ? "active mrt" : "mrt"} onClick={() => setShowMrt(value => !value)}><span>M</span>MRT</button>
          {(["小学","中学","商场"] as const).map(type => <button key={type} className={placeFilters[type] ? `active ${type}` : type} onClick={() => setPlaceFilters(value => ({...value,[type]:!value[type]}))}><span>{type === "商场" ? "购" : type[0]}</span>{type}</button>)}
        </div>
        <div className="legend"><span><i className="sale" />在售</span><span><i className="soon" />即将开盘</span><span><i className="confirmed" />确定开发</span><span><i className="land" />土地供应</span></div>
        <article className="detail-card">
          <button className="close">×</button><div className="detail-title"><div><span className={`status ${statusClass[selected.status]}`}><i />{selected.status}</span><h1>{selected.name}</h1><p>{selected.area} · {selected.tenure}</p></div><button className="bookmark">☆</button></div>
          <div className="inventory"><div><strong>{selected.units.toLocaleString()}</strong><small>总户数</small></div><div><strong>{selected.status === "在售" ? selected.sold : "—"}</strong><small>已售</small></div><div><strong>{selected.status === "在售" ? selected.units-selected.sold : "—"}</strong><small>估算未售</small></div></div>
          <dl className="facts"><div><dt>开发商</dt><dd>{selected.developer}</dd></div><div><dt>预计开盘</dt><dd>{selected.launch}</dd></div><div><dt>预计 TOP</dt><dd>{selected.top}</dd></div><div><dt>最近地铁</dt><dd>{selected.mrt}</dd></div><div className="wide"><dt>附近学校</dt><dd>{selected.school}</dd></div></dl>
          <div className="source-note"><span>URA</span>库存来自开发商月报，最后核对于 2026-08-18</div><button className="primary-action">查看完整项目资料 <span>→</span></button>
        </article>
      </section>
    </section>
  </main>;
}
