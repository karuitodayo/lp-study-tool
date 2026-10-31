type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  imageUrl: string;
  rect: Rect;
  label: string;
};

export default function DiagramOverlay({ imageUrl, rect, label }: Props) {
  return (
    <div className="diagram-wrap">
      <img src={imageUrl} alt="お手本画像" />
      <svg
        className="base"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <rect x={rect.x * 100} y={rect.y * 100} width={rect.w * 100} height={rect.h * 100} className="diagram-rect" />
      </svg>
      <div className="diagram-label-chip">{label}</div>
    </div>
  );
}
