import type { WireframeLayout } from "../types";

type Props = {
  layout: WireframeLayout;
  hasButton: boolean;
};

const W = 320;
const H = 150;
const STROKE = "#333333";
const BAR = "#bdbdbd";
const BAR_DARK = "#333333";

function imageBox(x: number, y: number, w: number, h: number, key: string) {
  return (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke={STROKE} strokeWidth={1.4} />
      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke={STROKE} strokeWidth={1} />
      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke={STROKE} strokeWidth={1} />
    </g>
  );
}

function headingBar(x: number, y: number, w: number, key: string) {
  return <rect key={key} x={x} y={y} width={w} height={9} fill={BAR_DARK} />;
}

function textLines(x: number, y: number, w: number, lines: number, key: string) {
  return (
    <g key={key}>
      {Array.from({ length: lines }).map((_, i) => (
        <rect
          key={i}
          x={x}
          y={y + i * 11}
          width={i === lines - 1 ? w * 0.6 : w}
          height={5}
          fill={BAR}
        />
      ))}
    </g>
  );
}

function buttonBox(x: number, y: number, key: string) {
  const w = 74;
  const h = 20;
  return (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#fff" stroke={STROKE} strokeWidth={1.4} />
      <rect x={x + 16} y={y + h / 2 - 3} width={w - 32} height={6} fill={STROKE} />
    </g>
  );
}

export default function WireframeDiagram({ layout, hasButton }: Props) {
  const els: JSX.Element[] = [];

  if (layout === "center") {
    const cw = 190;
    const cx = (W - cw) / 2;
    els.push(headingBar(cx, 24, cw, "h"));
    els.push(textLines(cx, 46, cw, 3, "t"));
    if (hasButton) els.push(buttonBox((W - 74) / 2, 100, "b"));
  } else if (layout === "image-left" || layout === "image-right") {
    const imgW = 130;
    const imgX = layout === "image-left" ? 16 : W - 16 - imgW;
    const textX = layout === "image-left" ? imgW + 32 : 16;
    const textW = W - imgW - 48;
    els.push(imageBox(imgX, 20, imgW, 110, "img"));
    els.push(headingBar(textX, 28, textW, "h"));
    els.push(textLines(textX, 50, textW, 4, "t"));
    if (hasButton) els.push(buttonBox(textX, 112, "b"));
  } else if (layout === "grid") {
    const cols = 3;
    const gap = 14;
    const colW = (W - gap * (cols + 1)) / cols;
    for (let i = 0; i < cols; i++) {
      const x = gap + i * (colW + gap);
      els.push(imageBox(x, 18, colW, 54, `img-${i}`));
      els.push(textLines(x, 80, colW, 3, `t-${i}`));
    }
  } else if (layout === "list") {
    const rows = 3;
    for (let i = 0; i < rows; i++) {
      const y = 16 + i * 42;
      els.push(imageBox(16, y, 32, 32, `icon-${i}`));
      els.push(textLines(60, y + 2, W - 76, 2, `t-${i}`));
    }
  } else if (layout === "nav") {
    // ロゴ（左）＋ メニュー項目（右に横並び）の横長ヘッダー
    els.push(imageBox(16, 20, 44, 24, "logo"));
    const items = 4;
    const itemW = 42;
    const gap = 14;
    const startX = W - 16 - items * itemW - (items - 1) * gap;
    for (let i = 0; i < items; i++) {
      els.push(
        <rect key={`nav-${i}`} x={startX + i * (itemW + gap)} y={28} width={itemW} height={7} fill={BAR} />
      );
    }
    els.push(<line key="rule" x1={0} y1={64} x2={W} y2={64} stroke="#eee" strokeWidth={2} />);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", background: "#fff" }}
    >
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="#fff" stroke="#ddd" />
      {els}
    </svg>
  );
}
