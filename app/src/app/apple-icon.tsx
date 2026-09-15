import { ImageResponse } from "next/og";

// ImageResponse can only render styled divs, not an <svg>, so this mirrors
// icon.svg's geometry rather than sharing it directly.
const CANVAS = 180;
export const size = { width: CANVAS, height: CANVAS };
export const contentType = "image/png";

// Same three rects as icon.svg's viewBox 0 0 100 100, scaled ~1.12x with a
// 34px margin - iOS's own mask needs that breathing room.
const BARS = [
  { left: 50, top: 92, width: 18, height: 36, color: "#cb4735" },
  { left: 81, top: 65, width: 18, height: 63, color: "#ab6200" },
  { left: 112, top: 106, width: 18, height: 22, color: "#8b4a62" },
];

interface BarSpec {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
}

const Bar = ({ left, top, width, height, color }: BarSpec) => (
  <div
    style={{ position: "absolute", left, top, width, height, borderRadius: width / 2, background: color }}
  />
);

const AppleIconMark = () => (
  <div style={{ width: "100%", height: "100%", background: "#f5f2ea", position: "relative", display: "flex" }}>
    {BARS.map((bar) => (
      <Bar key={bar.left} {...bar} />
    ))}
  </div>
);

const Icon = () => new ImageResponse(<AppleIconMark />, size);

export default Icon;
