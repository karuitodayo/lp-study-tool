import { useEffect, useState } from "react";
import { api } from "../api";
import type { AnalysisSection, Project, WireframeLayout } from "../types";
import AnalysisImageOverlay from "./AnalysisImageOverlay";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

type Props = {
  project: Project;
  onProjectUpdate: (project: Project) => void;
};

const LAYOUT_LABEL: Record<WireframeLayout, string> = {
  center: "中央寄せ",
  "image-left": "画像：左／文字：右",
  "image-right": "画像：右／文字：左",
  grid: "グリッド",
  list: "縦並びリスト",
  nav: "ヘッダー（ロゴ＋横並びメニュー）",
};

export default function AnalysisPanel({ project, onProjectUpdate }: Props) {
  const analysis = project.analysis;
  const [sections, setSections] = useState<AnalysisSection[]>(analysis.sections);
  const [colorPalette, setColorPalette] = useState(analysis.colorPalette);
  const [typographySystem, setTypographySystem] = useState(analysis.typographySystem);
  const [spacingSystem, setSpacingSystem] = useState(analysis.spacingSystem);
  const [buildApproach, setBuildApproach] = useState(analysis.buildApproach);
  const [saving, setSaving] = useState(false);

  const colorPaletteResize = useAutoResizeTextarea(colorPalette);
  const typographySystemResize = useAutoResizeTextarea(typographySystem);
  const spacingSystemResize = useAutoResizeTextarea(spacingSystem);
  const buildApproachResize = useAutoResizeTextarea(buildApproach);

  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const [geminiStatusError, setGeminiStatusError] = useState<string | null>(null);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  // Gemini APIによる自動分析で新しい分析結果が保存されたとき（analyzedAtが変わったとき）は、
  // 編集中のローカル状態を最新の保存内容に合わせ直す（手動編集中の変更を上書きしないよう、analyzedAtの変化のみを見る）。
  useEffect(() => {
    setSections(analysis.sections);
    setColorPalette(analysis.colorPalette);
    setTypographySystem(analysis.typographySystem);
    setSpacingSystem(analysis.spacingSystem);
    setBuildApproach(analysis.buildApproach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.analyzedAt]);

  useEffect(() => {
    let cancelled = false;
    api
      .getGeminiStatus()
      .then((s) => {
        if (!cancelled) setGeminiStatus(s);
      })
      .catch((e) => {
        if (!cancelled) setGeminiStatusError(e instanceof Error ? e.message : "Gemini APIの設定状況を確認できませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    JSON.stringify(sections) !== JSON.stringify(analysis.sections) ||
    colorPalette !== analysis.colorPalette ||
    typographySystem !== analysis.typographySystem ||
    spacingSystem !== analysis.spacingSystem ||
    buildApproach !== analysis.buildApproach;

  const sourceImage =
    analysis.sourceKind === "finish"
      ? project.images.finish
      : project.images.references.find((r) => r.id === analysis.sourceImageId) ?? null;

  const handleChange = (index: number, patch: Partial<AnalysisSection>) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { project: updated } = await api.saveAnalysis(project.id, {
        sections,
        colorPalette,
        typographySystem,
        spacingSystem,
        buildApproach,
      });
      onProjectUpdate(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleConfirm = async () => {
    const { project: updated } = await api.saveAnalysis(project.id, {
      confirmed: !analysis.confirmed,
      confirmedAt: !analysis.confirmed ? new Date().toISOString() : null,
    });
    onProjectUpdate(updated);
  };

  const hasExistingAnalysis = Boolean(analysis.analyzedAt) || analysis.sections.length > 0;

  const handleAutoAnalyze = async () => {
    if (autoAnalyzing) return;
    if (!project.images.finish) {
      setAutoError("完成イメージ画像が登録されていません。先に「画像登録」タブで登録してください。");
      return;
    }
    if (hasExistingAnalysis) {
      const ok = window.confirm("既存の画像分析を、Gemini APIによる新しい分析結果で上書きします。よろしいですか？");
      if (!ok) return;
    }
    setAutoAnalyzing(true);
    setAutoError(null);
    try {
      const res = await api.generateAnalysisFromImage(project.id);
      if (!res.ok || !res.proposal) {
        setAutoError(res.error ?? "画像分析に失敗しました。");
        return; // 失敗時は既存データに一切触れない
      }
      const { project: updated } = await api.saveAnalysis(project.id, res.proposal);
      onProjectUpdate(updated);
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : "画像分析に失敗しました。");
    } finally {
      setAutoAnalyzing(false);
    }
  };

  const autoAnalyzeCard = (
    <div className="card">
      <h2 className="section-title">画像分析（Gemini API）</h2>
      <p className="explain-text">
        登録済みの完成イメージ画像をGemini APIへ送信し、セクション構成・配置・配色・文字の傾向・HTML/CSSの組み立て方針を自動で読み取り、下の「画像分析結果」へ保存します。推定を含むため、保存後に内容をご確認ください。
      </p>
      <div className="banner-note warn">
        画像はサーバーからGemini APIへ送信されます。APIキーはサーバー側のみで使用し、画面・ログには表示されません。
      </div>
      {geminiStatusError && <div className="banner-note warn">{geminiStatusError}</div>}
      {geminiStatus && !geminiStatus.configured && (
        <div className="banner-note warn">
          Gemini APIキーが未設定です。<code className="md-inline-code">server/.env</code> を開き、
          <code className="md-inline-code">GEMINI_API_KEY=</code> の後ろにAPIキーを貼り付けて、サーバーを再起動してください。
        </div>
      )}
      {geminiStatus?.configured && (
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>使用モデル：{geminiStatus.model}</p>
      )}
      {!project.images.finish && (
        <div className="banner-note warn">完成イメージ画像が未登録です。先に「画像登録」タブで登録してください。</div>
      )}
      {autoError && <div className="banner-note warn">{autoError}</div>}
      <button
        className="btn btn-primary"
        onClick={handleAutoAnalyze}
        disabled={autoAnalyzing || !geminiStatus?.configured || !project.images.finish}
      >
        {autoAnalyzing ? "分析中です…（詳細な画像では3分程度かかることがあります）" : "画像を分析する"}
      </button>
    </div>
  );

  if (!analysis.analyzedAt) {
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
        {autoAnalyzeCard}
        <div className="card">
          <h2 className="section-title">画像分析</h2>
          <div className="empty-hint">
            まだ分析結果がありません。上の「画像を分析する」でGemini APIに自動分析させるか、Claude
            Codeに「登録画像を分析してください」のように依頼すると、Claude
            Codeが画像を直接読み取り、構成・配置をここに保存します。
          </div>
        </div>
      </div>
    );
  }

  const isGeminiAnalysis = analysis.analyzedBy?.startsWith("gemini-api") ?? false;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1200 }}>
      {autoAnalyzeCard}
      <div className="card">
        <h2 className="section-title">画像分析結果</h2>
        <div className="banner-note">
          {isGeminiAnalysis
            ? `これはGemini API（${analysis.analyzedBy?.replace("gemini-api:", "")}）による自動分析です。推定を含みます。内容を確認し、必要に応じて修正してください。`
            : "これはClaude Codeが画像を直接読み取って作成した分析です（自動化されたAI APIではなく、依頼のたびにClaude Codeセッションが手動で分析・保存しています）。内容を確認し、必要に応じて修正してください。"}
        </div>
        {analysis.excludedNote && (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>除外した範囲：{analysis.excludedNote}</p>
        )}
        <p className="explain-text">{analysis.imageDescription}</p>
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          分析日時：{analysis.analyzedAt && new Date(analysis.analyzedAt).toLocaleString("ja-JP")} ／ 分析対象：
          {analysis.sourceKind === "finish" ? "完成イメージ画像" : "参考画像"}
        </p>

        {sourceImage && <AnalysisImageOverlay imageUrl={sourceImage.url} sections={sections} />}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button className="btn btn-primary" onClick={handleToggleConfirm}>
            {analysis.confirmed ? "確定を解除する" : "この内容で確定する"}
          </button>
          {analysis.confirmed && (
            <span className="progress-pill">
              確定済み（{analysis.confirmedAt && new Date(analysis.confirmedAt).toLocaleString("ja-JP")}）
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">ページ全体の方針</h2>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: -6, marginBottom: 10 }}>
          色・文字・余白は画像から正確な数値を測定したものではなく、見た目からの推定です。実装時の目安としてご利用ください。
        </p>
        <div className="two-col-collapse">
          <div className="form-row">
            <label>配色</label>
            <textarea
              ref={colorPaletteResize.ref}
              onInput={colorPaletteResize.onInput}
              value={colorPalette}
              onChange={(e) => setColorPalette(e.target.value)}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>文字の大きさ・書体の傾向</label>
            <textarea
              ref={typographySystemResize.ref}
              onInput={typographySystemResize.onInput}
              value={typographySystem}
              onChange={(e) => setTypographySystem(e.target.value)}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>余白の取り方</label>
            <textarea
              ref={spacingSystemResize.ref}
              onInput={spacingSystemResize.onInput}
              value={spacingSystem}
              onChange={(e) => setSpacingSystem(e.target.value)}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>HTML/CSSで組み立てる方針（全体）</label>
            <textarea
              ref={buildApproachResize.ref}
              onInput={buildApproachResize.onInput}
              value={buildApproach}
              onChange={(e) => setBuildApproach(e.target.value)}
              style={{ minHeight: 90, resize: "none" }}
            />
          </div>
        </div>
      </div>

      {sections.map((s, i) => (
        <AnalysisSectionCard key={s.id} section={s} onChange={(patch) => handleChange(i, patch)} />
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "保存中..." : "この内容で保存する"}
        </button>
      </div>
    </div>
  );
}

// セクション1件分のカード。sections配列はループ中に増減し得るため、自動拡張フック（useAutoResizeTextarea）を
// 安全に使うには1セクション＝1コンポーネントに分ける必要がある（.map内で直接フックを呼ぶとフックの呼び出し順が
// 配列の長さに左右されてしまうため）。
function AnalysisSectionCard({
  section: s,
  onChange,
}: {
  section: AnalysisSection;
  onChange: (patch: Partial<AnalysisSection>) => void;
}) {
  const notesResize = useAutoResizeTextarea(s.notes);
  const observedTextResize = useAutoResizeTextarea(s.observedText);
  const colorNotesResize = useAutoResizeTextarea(s.colorNotes);
  const typographyNotesResize = useAutoResizeTextarea(s.typographyNotes);
  const spacingNotesResize = useAutoResizeTextarea(s.spacingNotes);
  const htmlApproachResize = useAutoResizeTextarea(s.htmlApproach);
  const cssApproachResize = useAutoResizeTextarea(s.cssApproach);

  return (
    <div className="card">
      <div className="step-tag">
        {s.order}. {s.label}
      </div>
      <div className="two-col-collapse" style={{ marginTop: 8 }}>
        <div>
          <div className="form-row">
            <label>ラベル</label>
            <input value={s.label} onChange={(e) => onChange({ label: e.target.value })} />
          </div>
          <div className="form-row">
            <label>配置パターン</label>
            <select
              value={s.layout}
              onChange={(e) => onChange({ layout: e.target.value as WireframeLayout })}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10 }}
            >
              {Object.entries(LAYOUT_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>気づいた点・配置の理由</label>
            <textarea
              ref={notesResize.ref}
              onInput={notesResize.onInput}
              value={s.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
        </div>
        <div>
          <div className="form-row">
            <label>画像内に実際に見えた文字（参考用。そのままコピー文には使いません）</label>
            <textarea
              ref={observedTextResize.ref}
              onInput={observedTextResize.onInput}
              value={s.observedText}
              onChange={(e) => onChange({ observedText: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
          <div className="target-box">
            見出し数: {s.elements.headingCount} ／ 画像: {s.elements.hasImage ? "あり" : "なし"} ／ ボタン:{" "}
            {s.elements.hasButton ? "あり" : "なし"} ／ 列数: {s.elements.columns ?? "-"}
          </div>
        </div>
      </div>

      <div className="two-col-collapse" style={{ marginTop: 12 }}>
        <div>
          <div className="form-row">
            <label>配色（このセクション）</label>
            <textarea
              ref={colorNotesResize.ref}
              onInput={colorNotesResize.onInput}
              value={s.colorNotes}
              onChange={(e) => onChange({ colorNotes: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>文字の大きさ</label>
            <textarea
              ref={typographyNotesResize.ref}
              onInput={typographyNotesResize.onInput}
              value={s.typographyNotes}
              onChange={(e) => onChange({ typographyNotes: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>余白</label>
            <textarea
              ref={spacingNotesResize.ref}
              onInput={spacingNotesResize.onInput}
              value={s.spacingNotes}
              onChange={(e) => onChange({ spacingNotes: e.target.value })}
              style={{ resize: "none" }}
            />
          </div>
        </div>
        <div>
          <div className="form-row">
            <label>HTML構成の方針</label>
            <textarea
              ref={htmlApproachResize.ref}
              onInput={htmlApproachResize.onInput}
              value={s.htmlApproach}
              onChange={(e) => onChange({ htmlApproach: e.target.value })}
              style={{ fontFamily: "monospace", fontSize: 14, resize: "none" }}
            />
          </div>
          <div className="form-row">
            <label>CSSの方針</label>
            <textarea
              ref={cssApproachResize.ref}
              onInput={cssApproachResize.onInput}
              value={s.cssApproach}
              onChange={(e) => onChange({ cssApproach: e.target.value })}
              style={{ fontFamily: "monospace", fontSize: 14, minHeight: 80, resize: "none" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
