export default function AnalysisPage() {
  const reportUrl = new URL("./reports/singapore-property-20y.html", document.baseURI).href;
  return <main className="analysis-page" data-route-root tabIndex={-1}>
    <header className="topbar analysis-topbar">
      <a className="brand brand-link" href="#/" aria-label="返回狮城新盘地图">
        <span className="brand-mark" aria-hidden="true">SG</span>
        <span>
          <h1>狮城新盘研究</h1>
          <small>私人住宅与 EC 研究工具</small>
        </span>
      </a>
      <nav className="site-nav" aria-label="网站页面">
        <a href="#/">楼盘地图</a>
        <a href="#/developers">开发商排名</a>
        <a href="#/analysis" className="active" aria-current="page">20年分析</a>
      </nav>
      <a className="report-open" href={reportUrl} target="_blank" rel="noopener noreferrer">独立打开 ↗</a>
    </header>
    <iframe
      className="analysis-frame"
      src={reportUrl}
      title="新加坡20年：家庭收入、私宅价格、区域分化、新盘溢价与政策周期"
    />
  </main>;
}
