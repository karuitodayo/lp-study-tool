import { useRef, useState } from "react";
import { api } from "../api";
import type { Project, WireframeCandidate, WireframeSection } from "../types";
import WireframeSectionCard from "./WireframeSectionCard";
import WireframePagePreview from "./WireframePagePreview";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

type Props = {
  project: Project;
  onProjectUpdate: (project: Project) => void;
};

function blankSection(): WireframeSection {
  return {
    id: `custom-${Date.now()}`,
    type: "custom",
    title: "新しいセクション",
    bodyText: "",
    role: "（このセクションの役割をここに書いてください）",
    reason: "（この位置に置いた理由をここに書いてください）",
    layout: "center",
    hasButton: false,
    ctaText: null,
    ctaItems: [],
    columns: null,
    // 手動追加のセクションは画像分析の範囲を持たないため、ページ全体のワイヤーでは
    // 他のセクションの下に固定高さで追加される。
    boundingBox: null,
    hasImage: false,
    // 画像分析に基づかないため、observedTextは無い。ページ全体のワイヤーでは、
    // この場合は見出し・本文（title/bodyText）をそのまま表示文章として使う。
    observedText: null,
  };
}

export default function WireframePanel({ project, onProjectUpdate }: Props) {
  const [sections, setSections] = useState<WireframeSection[]>(project.wireframe.sections);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(sections) !== JSON.stringify(project.wireframe.sections);

  const runGenerate = async (source: "brief" | "finish_image" | "analysis") => {
    if (sections.length > 0) {
      const ok = window.confirm(
        "すでにあるワイヤーフレームを新しいテンプレートで上書きします。編集済みの内容は失われます。よろしいですか？"
      );
      if (!ok) return;
    }
    setGenerating(true);
    setError(null);
    try {
      const { project: updated } = await api.generateWireframe(project.id, source);
      setSections(updated.wireframe.sections);
      onProjectUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました。");
    } finally {
      setGenerating(false);
    }
  };

  const handleChange = (index: number, patch: Partial<WireframeSection>) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const move = (index: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleDelete = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    setSections((prev) => [...prev, blankSection()]);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { project: updated } = await api.updateProject(project.id, { wireframe: { sections } });
      onProjectUpdate(updated);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const hasFinishImage = Boolean(project.images.finish);
  const hasAnalysis = project.analysis.sections.length > 0;

  // 別案のワイヤーフレーム画像（外部で見つけた・作った構成案）。
  // 完成イメージ画像＝色・雰囲気の参考、こちらの採用案＝配置・構成の基準、として教材生成時に役割を分ける。
  const candidateFileInputRef = useRef<HTMLInputElement>(null);
  const [candidateUploading, setCandidateUploading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const handleCandidateUpload = async (file: File) => {
    setCandidateUploading(true);
    setCandidateError(null);
    try {
      const { project: updated } = await api.uploadWireframeCandidate(project.id, file);
      onProjectUpdate(updated);
    } catch (e) {
      setCandidateError(e instanceof Error ? e.message : "アップロードに失敗しました。");
    } finally {
      setCandidateUploading(false);
    }
  };

  const handleCandidateNoteChange = async (candidateId: string, note: string) => {
    const { project: updated } = await api.updateWireframeCandidate(project.id, candidateId, { note });
    onProjectUpdate(updated);
  };

  const handleCandidateSelect = async (candidateId: string, selected: boolean) => {
    const { project: updated } = await api.updateWireframeCandidate(project.id, candidateId, { selected });
    onProjectUpdate(updated);
  };

  const handleCandidateDelete = async (candidateId: string) => {
    const { project: updated } = await api.deleteWireframeCandidate(project.id, candidateId);
    onProjectUpdate(updated);
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1200 }}>
      <div className="card">
        <h2 className="section-title">②ワイヤーフレーム：生成</h2>
        <p className="explain-text">
          「①設計」の内容をもとに、セクションの順番と配置案のたたき台を作ります。生成後は自由に編集できます。
        </p>
        <div className="banner-note warn">
          「設計の内容から生成する」「完成イメージ画像から構成案を起こす」は、LPでよく使われる定番構成のテンプレートです（画像の解析はしていません）。実際に画像を読み取った構成は「画像分析の結果から生成する」を使ってください（「画像分析」タブでGemini APIまたはClaude Codeが画像を読み取って保存した結果を使います）。
        </div>
        {!project.design.confirmed && (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            「①設計」がまだ確定していません。確定前でも生成できますが、先に設計を整理しておくと内容が反映されやすくなります。
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => runGenerate("analysis")}
            disabled={generating || !hasAnalysis}
            title={hasAnalysis ? "" : "先に「画像分析」タブで分析結果を保存してください"}
          >
            画像分析の結果から生成する{hasAnalysis ? "" : "（分析結果が必要）"}
          </button>
          <button className="btn" onClick={() => runGenerate("brief")} disabled={generating}>
            {generating ? "生成中..." : "設計の内容から生成する（サンプル）"}
          </button>
          <button
            className="btn"
            onClick={() => runGenerate("finish_image")}
            disabled={generating || !hasFinishImage}
            title={hasFinishImage ? "" : "先に「画像登録」タブで完成イメージ画像を登録してください"}
          >
            完成イメージ画像から構成案を起こす（サンプル）
          </button>
        </div>
        {!hasAnalysis && (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
            「画像分析の結果から生成する」は、画像分析タブに分析結果があるときだけ使えます。分析結果がある場合は画像解析に基づく構成、それ以外はテンプレートになります。
          </p>
        )}
        {!hasFinishImage && (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}>
            完成イメージ画像は未登録です。登録すると画像を参考にした入口が使えます（ただし画像の中身をAIが解析するわけではありません）。
          </p>
        )}
        {project.wireframe.generatedAt && (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>
            生成元：
            {project.wireframe.basedOn === "analysis"
              ? "画像分析の結果"
              : project.wireframe.basedOn === "finish_image"
              ? "完成イメージ画像の入口（テンプレート）"
              : "設計の内容（テンプレート）"}
            ／ 最終生成：{new Date(project.wireframe.generatedAt).toLocaleString("ja-JP")}
          </p>
        )}

        {error && <div className="banner-note warn">{error}</div>}
      </div>

      <div className="card">
        <h2 className="section-title">別案のワイヤーフレーム画像</h2>
        <p className="explain-text">
          他のサイトを参考にした、または自分で描いたワイヤーフレーム案の画像を登録できます。「この案を採用する」を押した1枚が、④実装教材を作成するときに完成イメージ画像と一緒にClaude
          Codeへ渡され、「配置・構成の基準」として使われます（完成イメージ画像は「色・雰囲気の参考」のまま変わりません）。
        </p>
        <div
          className="upload-box"
          onClick={() => candidateFileInputRef.current?.click()}
          style={{ cursor: "pointer" }}
        >
          {candidateUploading ? "アップロード中..." : "クリックして別案の画像を追加（JPEG/PNG/WebP/GIF・8MBまで）"}
        </div>
        <input
          ref={candidateFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCandidateUpload(file);
            e.target.value = "";
          }}
        />
        {candidateError && <div className="banner-note warn">{candidateError}</div>}

        {project.wireframe.candidates.length === 0 && (
          <div className="empty-hint" style={{ marginTop: 10 }}>
            まだ別案の画像が登録されていません。
          </div>
        )}

        {project.wireframe.candidates.map((c) => (
          <WireframeCandidateRow
            key={c.id}
            candidate={c}
            onNoteBlur={(note) => handleCandidateNoteChange(c.id, note)}
            onSelect={(selected) => handleCandidateSelect(c.id, selected)}
            onDelete={() => handleCandidateDelete(c.id)}
          />
        ))}
      </div>

      {sections.length === 0 && (
        <div className="empty-hint">まだワイヤーフレームがありません。上のボタンから生成するか、セクションを追加してください。</div>
      )}

      {sections.length > 0 && (
        <div className="card">
          <h2 className="section-title">ページ全体の下書き（スマホ幅）</h2>
          <WireframePagePreview
            sections={sections}
            finishImageUrl={project.images.finish?.url ?? null}
            assets={project.assets}
          />
        </div>
      )}

      {sections.map((s, i) => (
        <WireframeSectionCard
          key={s.id}
          section={s}
          index={i}
          total={sections.length}
          onChange={(patch) => handleChange(i, patch)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          onDelete={() => handleDelete(i)}
        />
      ))}

      {saveError && <div className="banner-note warn">{saveError}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn" onClick={handleAdd}>
          + セクションを追加
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "保存中..." : "この内容で保存する"}
        </button>
      </div>

      <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
        次の工程「③デザイン」は今後の実装予定です。ここではセクションの順番・役割・配置の整理までを扱います。
      </p>
    </div>
  );
}

// 別案の画像1件分。candidatesは増減する配列のため、自動拡張フックを安全に使うには
// 1件＝1コンポーネントに分ける（AnalysisSectionCardと同じ理由）。
// メモ欄はdefaultValue＋onBlurの非制御入力だが、onInputでの高さ調整は入力内容を直接参照するため問題なく動く。
function WireframeCandidateRow({
  candidate: c,
  onNoteBlur,
  onSelect,
  onDelete,
}: {
  candidate: WireframeCandidate;
  onNoteBlur: (note: string) => void;
  onSelect: (selected: boolean) => void;
  onDelete: () => void;
}) {
  const noteResize = useAutoResizeTextarea(c.note);

  return (
    <div className="card ref-item" style={{ gridTemplateColumns: "180px 1fr", marginTop: 10 }}>
      <img src={c.url} alt={c.originalName} className="thumb" style={{ height: 130, objectFit: "cover" }} />
      <div>
        <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}>
          補足メモ（参考にしたい理由など）
        </label>
        <textarea
          ref={noteResize.ref}
          onInput={noteResize.onInput}
          defaultValue={c.note}
          placeholder="例：この2カラムの並べ方を参考にしたい"
          onBlur={(e) => onNoteBlur(e.target.value)}
          style={{ width: "100%", minHeight: 50, marginTop: 4, resize: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          {c.selected ? (
            <>
              <span className="progress-pill">採用中（配置・構成の基準）</span>
              <button className="btn btn-sm" onClick={() => onSelect(false)}>
                採用を解除する
              </button>
            </>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => onSelect(true)}>
              この案を採用する
            </button>
          )}
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
