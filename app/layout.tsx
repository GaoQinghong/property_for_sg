import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "狮城新盘地图｜新加坡私人住宅与 EC",
  description: "在地图上研究新加坡在售、即将开盘及已确定开发的私人住宅与 EC 项目。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
