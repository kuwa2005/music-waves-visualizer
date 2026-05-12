/** エフェクト・スペアナ等で共通利用するデフォルト20色（任意 #RRGGBB と併用） */
export const DEFAULT_COLOR_PALETTE_20 = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#808080",
  "#800000",
  "#808000",
  "#008000",
  "#800080",
  "#008080",
  "#000080",
  "#ffa500",
  "#ffc0cb",
  "#40e0d0",
  "#9932cc",
  "#7cfc00",
] as const;

export type DefaultPaletteColor = (typeof DEFAULT_COLOR_PALETTE_20)[number];
