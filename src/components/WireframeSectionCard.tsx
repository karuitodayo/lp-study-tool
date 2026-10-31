import type { WireframeLayout, WireframeSection } from "../types";
import WireframeDiagram from "./WireframeDiagram";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

type Props = {
  section: WireframeSection;
  index: number;
  total: number;
  onChange: (patch: Partial<WireframeSection>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

const LAYOUT_OPTIONS: { value: WireframeLayout; label: string }[] = [
  { value: "center", label: "中央寄せ" },
  { value: "image-left", label: "画像：左／文字：右" },
  { value: "image-right", label: "画像：右／文字：左" },
  { value: "grid", label: "グリッド（3列）" },
  { value: "list", label: "縦並びリスト" },
  { value: "nav", label: "ヘッダー（ロゴ＋横並びメニュー）" },
];

export default function WireframeSectionCard({
  section,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: Props) {
  const observedTextResize = useAutoResizeTextarea(section.observedText ?? "");
  const bodyTextResize = useAutoResizeTextarea(section.bodyText);
  const ctaItemsResize = useAutoResizeTextarea(section.ctaItems.join("\n"));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="step-tag">SECTION {index + 1} / {total}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm" onClick={onMoveUp} disabled={index === 0}>
            ↑ 上へ
          </button>
          <button className="btn btn-sm" onClick={onMoveDown} disabled={index === total - 1}>
            ↓ 下へ
          </button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>

      <div className="two-col-collapse" style={{ marginTop: 10 }}>
        <div>
          <div className="form-row">
            <label>画像から読み取った文章（ページ全体の下書きに表示）</label>
            <textarea
              ref={observedTextResize.ref}
              onInput={observedTextResize.onInput}
              value={section.observedText ?? ""}
              placeholder={
                section.boundingBox
                  ? "（画像から文字を読み取れませんでした。必要であれば入力してください）"
                  : "（画像分析に基づかないセクションのため、下の「見出し」「本文」がそのまま下書きに表示されます）"
              }
              onChange={(e) => onChange({ observedText: e.target.value || null })}
              style={{ resize: "none" }}
            />
            <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
              ページ全体の下書き（スマホ幅のプレビュー）には、この文章をそのまま表示します。読み取れていない場合は推測で埋めず、空欄のままにしてください。
            </p>
          </div>
          <div className="form-row">
            <label>見出し（管理用・この教材での呼び名）</label>
            <input value={section.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div className="form-row">
            <label>本文（管理用の説明）</label>
            <textarea
              ref={bodyTextResize.ref}
              onInput={bodyTextResize.onInput}
              value={section.bodyText}
              onChange={(e) => onChange({ bodyText: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>配置パターン</label>
            <select
              value={section.layout}
              onChange={(e) => onChange({ layout: e.target.value as WireframeLayout })}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10 }}
            >
              {LAYOUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={section.hasImage}
                onChange={(e) => onChange({ hasImage: e.target.checked })}
                style={{ width: "auto" }}
              />
              写真を置く
            </label>
          </div>
          <div className="form-row">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={section.hasButton}
                onChange={(e) => onChange({ hasButton: e.target.checked })}
                style={{ width: "auto" }}
              />
              ボタンを置く
            </label>
            {section.hasButton && section.ctaItems.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 4px" }}>
                  複数のボタンが並ぶ区画です。1行に1つ、ボタンの文言を入力してください。
                </p>
                <textarea
                  ref={ctaItemsResize.ref}
                  onInput={ctaItemsResize.onInput}
                  value={section.ctaItems.join("\n")}
                  onChange={(e) => onChange({ ctaItems: e.target.value.split("\n") })}
                  style={{ resize: "none" }}
                />
              </div>
            )}
            {section.hasButton && section.ctaItems.length === 0 && (
              <input
                value={section.ctaText ?? ""}
                placeholder="ボタンの文言（例：無料相談に申し込む）"
                onChange={(e) => onChange({ ctaText: e.target.value })}
                style={{ marginTop: 6 }}
              />
            )}
          </div>

          <div className="target-box" style={{ marginTop: 4 }}>
            <strong>役割：</strong>
            {section.role}
          </div>
          <div className="target-box" style={{ marginTop: 8 }}>
            <strong>この順番にした理由：</strong>
            {section.reason}
          </div>
        </div>

        <div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 6 }}>
            見出し・文章・画像・ボタンの配置イメージ（白黒の簡易図）
          </p>
          <WireframeDiagram layout={section.layout} hasButton={section.hasButton} />
        </div>
      </div>
    </div>
  );
}
