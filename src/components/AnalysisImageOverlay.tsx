import type { AnalysisSection } from "../types";

type Props = {
  imageUrl: string;
  sections: AnalysisSection[];
};

export default function AnalysisImageOverlay({ imageUrl, sections }: Props) {
  return (
    <div className="diagram-wrap">
      <img src={imageUrl} alt="分析対象の画像" />
      <svg
        className="base"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {sections.map((s, i) => (
          <rect
            key={s.id}
            x={s.boundingBox.x * 100}
            y={s.boundingBox.y * 100}
            width={s.boundingBox.w * 100}
            height={s.boundingBox.h * 100}
            className="diagram-rect"
            style={{ fillOpacity: 0.08 + (i % 2) * 0.05 }}
          />
        ))}
      </svg>
      {sections.map((s) => (
        <div
          key={s.id}
          style={{
            position: "absolute",
            left: `${s.boundingBox.x * 100}%`,
            top: `${s.boundingBox.y * 100}%`,
            transform: "translate(4px, 4px)",
          }}
          className="diagram-label-chip"
        >
          {s.order}. {s.label}
        </div>
      ))}
    </div>
  );
}
