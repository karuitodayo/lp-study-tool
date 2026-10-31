import type { StructureDiagram as StructureDiagramType } from "../types";

type Props = { diagram: StructureDiagramType };

// 親要素・子要素・並び方・余白を、箱・ラベル・矢印で示す模式図（お手本画像そのものではない）。
// 色だけに頼らないよう、ラベルに名前（セレクター名）と番号を付けている。
const W = 320;
const H = 140;

export default function StructureDiagram({ diagram }: Props) {
  return (
    <div className="structure-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label="親要素・子要素・余白の模式図">
        {diagram.boxes.map((b) => (
          <g key={b.id}>
            <rect
              x={b.x * W}
              y={b.y * H}
              width={b.w * W}
              height={b.h * H}
              className={`structure-box ${b.emphasis ? "emphasis" : ""}`}
            />
            <text x={b.x * W + 6} y={b.y * H + 14} className="structure-box-label">
              {b.label}
            </text>
          </g>
        ))}
        {diagram.arrows?.map((a, i) => (
          <g key={`arrow-${i}`}>
            <line
              x1={a.from.x * W}
              y1={a.from.y * H}
              x2={a.to.x * W}
              y2={a.to.y * H}
              className="structure-arrow"
              markerEnd="url(#structure-arrow-head)"
            />
            {a.label && (
              <text
                x={(a.from.x + a.to.x) * 0.5 * W}
                y={(a.from.y + a.to.y) * 0.5 * H - 5}
                className="structure-arrow-label"
                textAnchor="middle"
              >
                {a.label}
              </text>
            )}
          </g>
        ))}
        {diagram.notes?.map((n, i) => (
          <text key={`note-${i}`} x={n.x * W} y={n.y * H} className="structure-note" textAnchor="middle">
            {n.text}
          </text>
        ))}
        <defs>
          <marker id="structure-arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
          </marker>
        </defs>
      </svg>
      <p className="structure-caption">
        実際のページの見た目ではなく、親要素・子要素の関係と余白を説明するための模式図です。
      </p>
    </div>
  );
}
