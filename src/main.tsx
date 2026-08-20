import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import DeveloperRankingPage from "../app/developerRankingPage";
import "../app/globals.css";
import "../app/developer-ranking.css";

function AppRouter() {
  const [hash, setHash] = useState(window.location.hash);
  const developersRoute = hash === "#/developers";
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    document.title = developersRoute
      ? "新加坡私宅开发商当前活跃度排名｜狮城新盘地图"
      : "狮城新盘地图｜新加坡私人住宅与 EC";
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-route-root]")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [developersRoute]);
  return developersRoute ? <DeveloperRankingPage /> : <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
