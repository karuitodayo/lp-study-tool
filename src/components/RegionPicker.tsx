import { useRef, useState } from "react";
import type { Region } from "../types";

type Props = {
  imageUrl: string;
  region: Region | null;
  onChange: (region: Region | null) => void;
};

type Point = { x: number; y: number };

export default function RegionPicker({ imageUrl, region, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  const toRelative = (clientX: number, clientY: number): Point => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toRelative(e.clientX, e.clientY);
    setDragStart(p);
    setDragCurrent(p);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    setDragCurrent(toRelative(e.clientX, e.clientY));
  };
  const handlePointerUp = () => {
    if (dragStart && dragCurrent) {
      const x = Math.min(dragStart.x, dragCurrent.x);
      const y = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.abs(dragCurrent.x - dragStart.x);
      const h = Math.abs(dragCurrent.y - dragStart.y);
      if (w > 0.01 && h > 0.01) {
        onChange({ x, y, w, h });
      }
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  const liveRect: Region | null =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          w: Math.abs(dragCurrent.x - dragStart.x),
          h: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  const shown = liveRect ?? region;

  return (
    <div>
      <div
        ref={wrapRef}
        className="diagram-wrap"
        style={{ cursor: "crosshair", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img src={imageUrl} draggable={false} alt="参考画像" />
        {shown && (
          <svg
            className="base"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <rect
              x={shown.x * 100}
              y={shown.y * 100}
              width={shown.w * 100}
              height={shown.h * 100}
              className="diagram-rect"
            />
          </svg>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          ドラッグで参考範囲を指定（任意）
        </span>
        {region && (
          <button className="btn btn-sm" onClick={() => onChange(null)}>
            クリア
          </button>
        )}
      </div>
    </div>
  );
}
