import { useState } from "react";
import { api } from "../api";
import type { Project, ProjectBrief } from "../types";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

type Props = {
  project: Project;
  onProjectUpdate: (project: Project) => void;
};

const FIELDS: { key: keyof ProjectBrief; label: string; placeholder?: string }[] = [
  { key: "purpose", label: "目的（何のためのLPか）", placeholder: "例：資料請求を増やす" },
  { key: "target", label: "ターゲット", placeholder: "例：30代の人事担当者" },
  { key: "problem", label: "ターゲットが抱える課題", placeholder: "例：採用にかかる工数が多い" },
  { key: "product", label: "商品・サービス" },
  { key: "cta", label: "促したい行動（CTA）", placeholder: "例：無料相談に申し込む" },
  { key: "deadline", label: "納期", placeholder: "未定でも可" },
];

export default function DesignPanel({ project, onProjectUpdate }: Props) {
  const [brief, setBrief] = useState<ProjectBrief>(project.brief);
  const [requestText, setRequestText] = useState(project.design.requestText);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const materialsResize = useAutoResizeTextarea(brief.materials);
  const requestTextResize = useAutoResizeTextarea(requestText);
  const notesResize = useAutoResizeTextarea(brief.notes);

  const dirty =
    JSON.stringify(brief) !== JSON.stringify(project.brief) || requestText !== project.design.requestText;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Parameters<typeof api.updateProject>[1] = {
        brief,
        design: { requestText },
      };
      // 内容を編集したら、古い内容のまま「確定済み」表示が残らないように解除する
      if (project.design.confirmed) {
        patch.design = { ...patch.design, confirmed: false, confirmedAt: null };
      }
      const { project: updated } = await api.updateProject(project.id, patch);
      onProjectUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { project: updated } = await api.generateDesignSummary(project.id);
      onProjectUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下書きの生成に失敗しました。");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleConfirm = async () => {
    const next = !project.design.confirmed;
    const { project: updated } = await api.updateProject(project.id, {
      design: { confirmed: next, confirmedAt: next ? new Date().toISOString() : null },
    });
    onProjectUpdate(updated);
  };

  const summary = project.design.summary;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
      <div className="card">
        <h2 className="section-title">①設計：入力</h2>
        <p className="explain-text">
          わかっている範囲だけで構いません。未定の項目は空欄のままで進められます。
        </p>

        <div className="two-col-collapse" style={{ marginTop: 16 }}>
          {FIELDS.map((f) => (
            <div className="form-row" key={f.key}>
              <label>{f.label}</label>
              <input
                value={brief[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setBrief({ ...brief, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>支給素材・禁止表現などのメモ</label>
            <textarea
              ref={materialsResize.ref}
              onInput={materialsResize.onInput}
              value={brief.materials}
              onChange={(e) => setBrief({ ...brief, materials: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>案件の依頼文（クライアントからの発注文などをそのまま貼り付け）</label>
            <textarea
              ref={requestTextResize.ref}
              onInput={requestTextResize.onInput}
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="依頼メールや仕様書の文章をそのまま貼り付けておくと、あとで見返せます。"
              style={{ minHeight: 100, resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>その他メモ</label>
            <textarea
              ref={notesResize.ref}
              onInput={notesResize.onInput}
              value={brief.notes}
              onChange={(e) => setBrief({ ...brief, notes: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
        </div>

        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
          参考画像の登録・メモは「画像登録」タブで行います（現在
          {project.images.references.length > 0 ? `${project.images.references.length}枚登録済み` : "未登録"}）。
        </p>

        {error && <div className="banner-note warn">{error}</div>}

        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">①設計：整理・確定</h2>
        <p className="explain-text">
          入力内容をもとに「誰の・どんな課題に・何を提案し・どう行動してもらうか」の下書きを作ります。
        </p>
        <div className="banner-note warn">
          AI未接続のため、入力内容を定型文に当てはめた下書きです（AIによる分析・提案ではありません）。実際の整理・提案はAI連携後に対応します。
        </div>

        <button className="btn" onClick={handleGenerate} disabled={generating}>
          {generating ? "作成中..." : summary ? "下書きを作り直す（サンプル）" : "下書きを作る（サンプル）"}
        </button>

        {summary && (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {summary.missing.length > 0 && (
              <div className="banner-note warn">
                入力が不足している項目：{summary.missing.join("、")}
              </div>
            )}
            <div className="two-col-collapse">
              <div className="target-box">
                <strong>誰の・どんな課題：</strong>
                {summary.whoProblem}
              </div>
              <div className="target-box">
                <strong>何を提案するか：</strong>
                {summary.proposal}
              </div>
              <div className="target-box">
                <strong>どう行動してもらうか：</strong>
                {summary.action}
              </div>
              <div className="target-box">{summary.referenceNote}</div>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>{summary.note}</p>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn btn-primary" onClick={handleToggleConfirm}>
                {project.design.confirmed ? "確定を解除する" : "この内容で確定する"}
              </button>
              {project.design.confirmed && (
                <span className="progress-pill">
                  確定済み（{project.design.confirmedAt && new Date(project.design.confirmedAt).toLocaleString("ja-JP")}）
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
