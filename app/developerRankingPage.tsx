"use client";

import { useMemo, useState } from "react";
import { buildDeveloperRanking, type PortfolioRow } from "./developerRanking";
import { groupLabel } from "./developers";
import { useDeveloperDirectoryState, useProjects } from "./useMapData";

const formatNumber = (value: number) => value.toLocaleString("zh-CN");

const yearTypeLabel: Record<PortfolioRow["yearType"], string> = {
  actual_top: "实际 TOP",
  completion: "竣工",
  estimated_top: "预计 TOP",
  estimated_completion: "预计竣工",
  expected_vp: "预计空置交付",
  current_record: "当前项目资料",
  unknown: "",
};

export default function DeveloperRankingPage() {
  const { projects, updatedAt, status } = useProjects();
  const { directory, status: directoryStatus } = useDeveloperDirectoryState();
  const [query, setQuery] = useState("");

  const ranking = useMemo(
    () => buildDeveloperRanking(projects, directory),
    [projects, directory],
  );
  const keyword = query.trim().toLowerCase();
  const visible = useMemo(() => ranking.filter((developer) => {
    if (!keyword) return true;
    const haystack = [
      developer.group.name,
      developer.group.nameZh,
      ...developer.portfolio.map((project) => project.name),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(keyword);
  }), [ranking, keyword]);

  const mappedProjects = new Set(ranking.flatMap((developer) => developer.activeProjectIds)).size;
  const eligibleProjects = projects.filter((project) => project.status !== "土地供应").length;
  const verifiedProjects = ranking.reduce((total, developer) => total + developer.verifiedProjects, 0);
  const ready = status === "ready" && directoryStatus === "ready" && ranking.length > 0;
  const hasError = status === "error" || directoryStatus === "error";

  return <main className="rankings-page" data-route-root tabIndex={-1}>
    <header className="topbar ranking-topbar">
      <a className="brand brand-link" href="#/" aria-label="返回狮城新盘地图">
        <span className="brand-mark" aria-hidden="true">SG</span>
        <span>
          <h1>狮城新盘研究</h1>
          <small>私人住宅与 EC 研究工具</small>
        </span>
      </a>
      <nav className="site-nav" aria-label="网站页面">
        <a href="#/">楼盘地图</a>
        <a href="#/developers" className="active" aria-current="page">开发商排名</a>
        <a href="#/analysis">20年分析</a>
      </nav>
      <div className="ranking-updated"><span className="live-dot" aria-hidden="true" />数据截至 {updatedAt || directory.updatedAt || "载入中"}</div>
    </header>

    <section className="ranking-hero">
      <div>
        <p className="eyebrow">SINGAPORE PRIVATE RESIDENTIAL DEVELOPER ACTIVITY</p>
        <h2>新加坡私宅开发商<br />当前活跃度排名</h2>
        <p className="hero-copy">
          依据开发商官网、年报与本站 URA 在售/储备项目，衡量本站可核验记录覆盖、当前规模和开发广度。
          这是研究工具生成的动态指数，不是政府排名，也不代表建筑质量或投资回报保证。
        </p>
      </div>
      <aside className="method-card" aria-label="排名计算方法">
        <span className="method-kicker">当前活跃度模型 · 100 分</span>
        <dl>
          <div><dt>55%</dt><dd>当前项目折算户数</dd></div>
          <div><dt>45%</dt><dd>当前项目广度</dd></div>
        </dl>
        <p>合资权益未公开时，户数按已确认参与集团数均分；这是研究折算值，不等同持股权益。</p>
      </aside>
    </section>

    <section className="ranking-summary" aria-label="数据覆盖概览">
      <div><strong>{ranking.length || "—"}</strong><span>已核验集团</span></div>
      <div><strong>{verifiedProjects || "—"}</strong><span>集团官网项目记录</span></div>
      <div><strong>{mappedProjects || "—"}</strong><span>已匹配当前项目</span></div>
      <div><strong>{projects.length || "—"}</strong><span>URA 当前样本</span></div>
    </section>

    <section className="ranking-content">
      <div className="ranking-toolbar">
        <div>
          <h2>集团榜单</h2>
          <p>展开集团即可查看其已核验私宅记录及 TOP、户数、产权等资料。</p>
        </div>
        <label className="developer-search">
          <span>搜索开发商或楼盘</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：CDL、Upperhouse" />
        </label>
      </div>

      {!ready && <div className="ranking-state" role="status" aria-live="polite">{hasError ? "数据载入失败，请刷新重试。" : "正在计算开发商排名…"}</div>}
      {ready && visible.length === 0 && <div className="ranking-state" role="status" aria-live="polite">没有匹配的开发商或楼盘。</div>}

      {ready && <div className="ranking-list">
        {visible.map((developer, visibleIndex) => <details
          className={`rank-card rank-${developer.rank}`}
          key={developer.key}
          open={Boolean(keyword) || visibleIndex === 0}
        >
          <summary>
            <span className="rank-number" aria-label={`第 ${developer.rank} 名`}>{String(developer.rank).padStart(2, "0")}</span>
            <span className="rank-identity">
              <strong>{developer.group.nameZh || developer.group.name}</strong>
              {developer.group.nameZh && <small>{developer.group.name}</small>}
            </span>
            <span className="score-block"><strong>{developer.score.toFixed(1)}</strong><small>活跃度分</small></span>
            <span className="rank-metrics">
              <span><b>{developer.verifiedProjects}</b> 官网项目</span>
              <span><b>{developer.activeProjects}</b> 当前项目</span>
              <span><b>{formatNumber(developer.attributableUnits)}</b> 折算户数</span>
            </span>
            <span className="expand-indicator" aria-hidden="true">⌄</span>
          </summary>

          <div className="rank-details">
            <div className="rank-source">
              <p>{groupLabel(developer.group)} · 已收录 {developer.portfolio.length} 个可核验或当前项目</p>
              <span>
                <a href={developer.group.website} target="_blank" rel="noopener noreferrer">集团官网 ↗</a>
                <a href={developer.group.source} target="_blank" rel="noopener noreferrer">项目来源 ↗</a>
              </span>
            </div>
            <div className="portfolio-table" role="table" aria-label={`${developer.group.name} 私宅项目`}>
              <div className="portfolio-header" role="row">
                <span role="columnheader">私宅项目</span><span role="columnheader">TOP / 竣工</span><span role="columnheader">户数</span><span role="columnheader">产权</span><span role="columnheader">状态</span>
              </div>
              {developer.portfolio.map((project) => <PortfolioProjectRow
                key={`${developer.key}-${project.name}`}
                project={project}
              />)}
            </div>
          </div>
        </details>)}
      </div>}
    </section>

    <section className="ranking-notes">
      <h2>口径与限制</h2>
      <div>
        <p><strong>不是权威质量榜。</strong>活跃度分只比较已完成集团匹配的当前 URA 项目规模与广度；历史代表项目不参与得分，不会因本站多录入记录而加分。</p>
        <p><strong>当前匹配覆盖。</strong>本站已完成 {mappedProjects}/{eligibleProjects || "—"} 个非土地供应项目的集团匹配；未匹配 SPV 不进入排名，覆盖增加后名次会变化。</p>
        <p><strong>资料不猜测。</strong>当前项目优先使用 URA 数据；历史项目只有在开发商官网明确披露时才填写 TOP、户数与产权，缺项统一标为“待核实”。</p>
        <p><strong>合资折算。</strong>一个楼盘可同时列在多个参与集团名下；权益未公开时，排名户数按参与集团均分，项目清单仍保留完整项目。</p>
      </div>
      <p className="ranking-source-note">
        项目与供应数据：<a href="https://eservice.ura.gov.sg/maps/api/" target="_blank" rel="noopener noreferrer">URA Data Service ↗</a>；
        集团归属和历史项目：各开发商官网项目组合页，逐条提供来源链接。
      </p>
    </section>
  </main>;
}

function PortfolioProjectRow({ project }: { project: PortfolioRow }) {
  return <div className="portfolio-row" role="row">
    <div className="portfolio-name" role="cell">
      <a href={project.url} target="_blank" rel="noopener noreferrer">{project.name} ↗</a>
      {(project.propertyType || project.referenceYear) && <small>{project.propertyType}{project.propertyType && project.referenceYear ? " · " : ""}{project.referenceYear ? `官网目录年份 ${project.referenceYear}` : ""}</small>}
      {project.sourceUrl && project.sourceUrl !== project.url && <a className="fact-source" href={project.sourceUrl} target="_blank" rel="noopener noreferrer">资料来源 ↗</a>}
    </div>
    <div className="portfolio-fact" role="cell">
      <small>TOP / 竣工</small>
      <span>{project.top ?? "待核实"}</span>
      {project.top && yearTypeLabel[project.yearType] && <em>{yearTypeLabel[project.yearType]}</em>}
    </div>
    <div className="portfolio-fact" role="cell"><small>户数</small><span>{project.units ? formatNumber(project.units) : "待核实"}</span></div>
    <div className="portfolio-fact" role="cell"><small>产权</small><span>{project.tenure ?? "待核实"}</span></div>
    <div className="portfolio-fact" role="cell"><small>状态</small><span className={`portfolio-status status-${project.status}`}>{project.status}</span></div>
  </div>;
}
