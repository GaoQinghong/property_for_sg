/**
 * Singapore's postal districts. `area` from URA reads like
 * "EVELYN ROAD · D11", so the code is already in the data — this turns it into
 * something the card can label properly.
 */
export const DISTRICT_NAMES: Record<number, string> = {
  1: "莱佛士坊 · 滨海湾 · 珍珠坊",
  2: "丹戎巴葛 · 安顺",
  3: "女皇镇 · 中峇鲁 · 亚历山大",
  4: "直落布兰雅 · 港湾 · 圣淘沙",
  5: "巴西班让 · 金文泰新镇",
  6: "高街 · 美芝路",
  7: "武吉士 · 明古连 · 梧槽",
  8: "小印度 · 花拉公园",
  9: "乌节路 · 加东丽 · 里峇峇利",
  10: "东陵 · 荷兰路 · 武吉知马",
  11: "诺维娜 · 汤申 · 华登园",
  12: "巴利斯地 · 大巴窑 · 实龙岗路",
  13: "麦波申 · 布莱德 · 波东巴西",
  14: "芽笼 · 友诺士 · 巴耶利峇",
  15: "加东 · 如切 · 安珀路",
  16: "勿洛 · 东海岸上段 · 丘园",
  17: "罗央 · 樟宜",
  18: "淡滨尼 · 巴西立",
  19: "实龙岗花园 · 后港 · 榜鹅",
  20: "碧山 · 宏茂桥 · 汤申路上段",
  21: "上武吉知马 · 金文泰园 · 乌鲁班丹",
  22: "裕廊 · 文礼",
  23: "武吉巴督 · 蔡厝港 · 山景 · 奶场",
  24: "林厝港 · 登加",
  25: "克兰芝 · 兀兰",
  26: "上汤申 · 万礼 · 实里达路上段",
  27: "义顺 · 三巴旺",
  28: "实里达 · 杨厝港",
};

/** Pulls the "D11" code out of an `area` string; null when absent. */
export function districtOf(area: string): number | null {
  const match = /\bD(\d{1,2})\b/i.exec(area ?? "");
  if (!match) return null;
  const code = Number(match[1]);
  return code >= 1 && code <= 28 ? code : null;
}

export const districtLabel = (code: number) => `D${String(code).padStart(2, "0")}`;

/** The street half of `area`, i.e. everything before the district code. */
export function streetOf(area: string): string {
  return String(area ?? "").split(" · ")[0].trim();
}
