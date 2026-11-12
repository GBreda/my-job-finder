import { createTheme } from "@mantine/core";

const pine = [
  "#e7f5f1",
  "#c9e8e0",
  "#9ad4c6",
  "#64bda8",
  "#389f88",
  "#0e6b58",
  "#0c5e4d",
  "#0a4e40",
  "#083f34",
  "#062f27",
] as const;

export const theme = createTheme({
  primaryColor: "pine",
  colors: { pine },
  primaryShade: 5,
  fontFamily: "Outfit, system-ui, sans-serif",
  headings: { fontFamily: "Fraunces, Georgia, serif", fontWeight: "560" },
  defaultRadius: "md",
  cursorType: "pointer",
});
