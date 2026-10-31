import { useEffect, useState } from "react";
import { api } from "../api";
import type { Project } from "../types";

type Props = {
  project: Project;
  onProjectUpdate: (project: Project) => void;
};

export default function MaterialEmptyState({ project, onProjectUpdate }: Props) {
  // サーバーに保存されたproject.material.generationStatusを唯一の正とする。
  // ページ再読み込み後も「生成中」の表示が復元される（完了検知・自動更新はWorkspace側のポーリングが行う）。
  const [generating, setGenerating] = useState(() => project.material.generationStatus?.state === "generating");
  useEffect(() => {
    setGenerating(project.material.generationStatus?.state === "generating");
  }, [project.material.generationStatus?.state]);
  const [error, setError] = useState<string | null>(null);

  const hasFinishImage = Boolean(project.images.finish);
  const hasConfirmedAnalysis = project.analysis.confirmed;
  const canGenerate = hasFinishImage && hasConfirmedAnalysis && !generating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateMaterial(project.id);
      if (!res.ok || !res.proposal) {
        setError(res.error ?? "教材の生成に失敗しました。");
        return; // 失敗時は既存データに一切触れない（もともと未作成のまま）
      }
      const { project: updated } = await api.saveMaterial(project.id, res.proposal);
      onProjectUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "教材の生成に失敗しました。");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 820 }}>
      <h2 className="section-title">④実装教材</h2>
      <div className="empty-hint">まだこのプロジェクト専用の教材がありません。</div>

      <p className="explain-text" style={{ marginTop: 12 }}>
        登録済みの完成イメージ画像と、確定済みの画像分析・①設計をもとに、既存のClaude Code接続でこのプロジェクト専用の教材（ファイルの準備から、ヘッダーとファーストビューを一手順ずつ作る教材）を作成します。
      </p>
      <div className="banner-note warn">
        作成にはPC内のClaude Code CLI（お使いのサブスクリプション枠）を使います。手順数が多いため、数分かかることがあります。
      </div>

      {!hasFinishImage && (
        <div className="banner-note warn">完成イメージ画像が未登録です。先に「画像登録」タブで登録してください。</div>
      )}
      {hasFinishImage && !hasConfirmedAnalysis && (
        <div className="banner-note warn">
          確定済みの画像分析がありません。先に「画像分析」タブで内容を確認し、「この内容で確定する」を押してください。
        </div>
      )}
      {error && <div className="banner-note warn">{error}</div>}

      <button className="btn btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
        {generating ? "教材を作成中です…（数分かかることがあります）" : "教材を作成する"}
      </button>
    </div>
  );
}
