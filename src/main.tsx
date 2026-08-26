import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import DeveloperRankingPage from "../app/developerRankingPage";
import AnalysisPage from "../app/analysisPage";
import "../app/globals.css";
import "../app/developer-ranking.css";
import "../app/analysis.css";

function AppRouter() {
  const [hash, setHash] = useState(window.location.hash);
  const developersRoute = hash === "#/developers";
  const analysisRoute = hash === "#/analysis";
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    document.title = analysisRoute
      ? "新加坡20年私宅分析｜狮城新盘研究"
      : developersRoute
        ? "新加坡私宅开发商当前活跃度排名｜狮城新盘地图"
        : "狮城新盘地图｜新加坡私人住宅与 EC";
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-route-root]")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [developersRoute, analysisRoute]);
  if (analysisRoute) return <AnalysisPage />;
  return developersRoute ? <DeveloperRankingPage /> : <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
