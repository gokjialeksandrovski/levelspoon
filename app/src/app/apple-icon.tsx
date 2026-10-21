import { ImageResponse } from "next/og";

// ImageResponse can only render styled divs, not an <svg>, so this mirrors
// icon.svg's geometry rather than sharing it directly.
const CANVAS = 180;

// 512 also serves the web manifest: Chrome won't offer install without a PNG
// of at least 144px. icon.svg stays out of the manifest: listed there, Chrome
// picks it and fails Page.getInstallabilityErrors with no-acceptable-icon.
const MANIFEST_SIDE = 512;
const ICON_SIDES = [CANVAS, MANIFEST_SIDE];

export const generateImageMetadata = () =>
  ICON_SIDES.map((side) => ({ id: String(side), size: { width: side, height: side }, contentType: "image/png" }));

// Same three rects as icon.svg's viewBox 0 0 100 100, scaled ~1.12x with a
// 34px margin on the 180 canvas - iOS's own mask needs that breathing room.
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
  scale: number;
}

const Bar = ({ left, top, width, height, color, scale }: BarSpec) => (
  <div
    style={{
      position: "absolute",
      left: left * scale,
      top: top * scale,
      width: width * scale,
      height: height * scale,
      borderRadius: (width * scale) / 2,
      background: color,
    }}
  />
);

const AppleIconMark = ({ scale }: { scale: number }) => (
  <div style={{ width: "100%", height: "100%", background: "#f5f2ea", position: "relative", display: "flex" }}>
    {BARS.map((bar) => (
      <Bar key={bar.left} {...bar} scale={scale} />
    ))}
  </div>
);

const Icon = async ({ id }: { id: Promise<string> }) => {
  const side = Number(await id);
  return new ImageResponse(<AppleIconMark scale={side / CANVAS} />, { width: side, height: side });
};

export default Icon;
