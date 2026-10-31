import { useEffect, useState } from "react";
import { api } from "../api";
import type { MaterialChapter, MaterialStep, Project, ProjectProgress } from "../types";
import DiagramOverlay from "./DiagramOverlay";
import DiffCodeBlock from "./DiffCodeBlock";
import StagePreview from "./StagePreview";
import StructureDiagram from "./StructureDiagram";
import MaterialRegenerationReview from "./MaterialRegenerationReview";

type Props = {
  chapter: MaterialChapter;
  project: Project;
  isStale: boolean;
  onProgressChange: (progress: Partial<ProjectProgress>) => void;
  onProjectUpdate: (project: Project) => void;
};

// サーバー側（materialGenerator.jsのANIMATION_HINT_PATTERN）と同じ簡易判定。
// こちらは「引き継ぐ」チェックボックスを表示するかどうかの見た目の判断だけに使い、
// 実際に何を抜き出してAIへ渡すかはサーバー側が決める（二重に真実を持たないようにする）。
const ANIMATION_HINT_PATTERN = /@keyframes|animation-name|animation\s*:|animation-duration|transition\s*:/;
function chapterHasAnimations(chapter: MaterialChapter): boolean {
  return chapter.steps.some((s) =>
    s.fileBlocks.some((fb) => fb.file === "style.css" && ANIMATION_HINT_PATTERN.test(fb.copyCode))
  );
}

export default function MaterialPanel({ chapter, project, isStale, onProgressChange, onProjectUpdate }: Props) {
  const steps = chapter.steps;
  const [index, setIndex] = useState(() => Math.min(project.progress.currentStepIndex, steps.length - 1));
  const maxReached = Math.max(project.progress.maxReachedStepIndex, index);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  // 手順ナビの折りたたみ（PC幅でコード・プレビューに幅を譲るための表示状態。進捗や保存データとは無関係）。
  const [navCollapsed, setNavCollapsed] = useState(false);

  // 生成中かどうかは、サーバーに保存されたproject.material.generationStatusを唯一の正とする。
  // 初期値をそこから導出することで、ページ再読み込みやタブの行き来の後でも「生成中」の表示が復元される。
  const [regenerating, setRegenerating] = useState(() => project.material.generationStatus?.state === "generating");
  useEffect(() => {
    setRegenerating(project.material.generationStatus?.state === "generating");
  }, [project.material.generationStatus?.state]);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [carryOverAnimations, setCarryOverAnimations] = useState(true);
  const hasExistingAnimations = chapterHasAnimations(chapter);

  const pendingRegeneration = project.material.pendingRegeneration;
  const [adopting, setAdopting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [reviseInstruction, setReviseInstruction] = useState("");
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [proposalStep, setProposalStep] = useState<MaterialStep | null>(null);
  const [applying, setApplying] = useState(false);

  // 手順を切り替えたら、前の手順に対する未適用の修正案は破棄する（別の手順に誤って適用しないように）。
  useEffect(() => {
    setProposalStep(null);
    setReviseInstruction("");
    setReviseError(null);
  }, [index]);

  const handleRegenerate = async () => {
    const ok = window.confirm(
      "現在の教材を元に、新しい内容を生成します（数分かかります）。\n" +
        "生成後、変更点を確認してから採用するかどうかを選べます（この時点ではまだ上書きされません）。\n" +
        "すでにVS Codeなどで実装を始めている場合、クラス名やHTML構造が変わることがあります。"
    );
    if (!ok) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await api.generateMaterial(project.id, {
        carryOverAnimations: hasExistingAnimations && carryOverAnimations,
      });
      if (!res.ok || !res.project) {
        setRegenError(res.error ?? "教材の生成に失敗しました。");
        return; // 失敗時は既存の教材に一切触れない
      }
      // ここではまだ保存しない。サーバー側がproject.material.pendingRegenerationとして
      // 提案を保持しているので、それを比較パネルに表示する（採用／破棄は別の操作）。
      onProjectUpdate(res.project);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "教材の生成に失敗しました。");
    } finally {
      setRegenerating(false);
    }
  };

  const handleAdoptRegeneration = async () => {
    setAdopting(true);
    setReviewError(null);
    try {
      const res = await api.adoptMaterialRegeneration(project.id);
      if (!res.ok || !res.project) {
        setReviewError(res.error ?? "採用に失敗しました。");
        return;
      }
      onProjectUpdate(res.project);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "採用に失敗しました。");
    } finally {
      setAdopting(false);
    }
  };

  const handleDiscardRegeneration = async () => {
    setDiscarding(true);
    setReviewError(null);
    try {
      const res = await api.discardMaterialRegeneration(project.id);
      if (!res.ok || !res.project) {
        setReviewError(res.error ?? "破棄に失敗しました。");
        return;
      }
      onProjectUpdate(res.project);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "破棄に失敗しました。");
    } finally {
      setDiscarding(false);
    }
  };

  const handleRevise = async () => {
    const text = reviseInstruction.trim();
    if (!text || revising) return;
    setRevising(true);
    setReviseError(null);
    try {
      const res = await api.reviseMaterialStep(project.id, step.id, text);
      if (!res.ok || !res.step) {
        setReviseError(res.error ?? "修正案の作成に失敗しました。");
        return;
      }
      setProposalStep(res.step);
    } catch (e) {
      setReviseError(e instanceof Error ? e.message : "修正案の作成に失敗しました。");
    } finally {
      setRevising(false);
    }
  };

  const handleApplyProposal = async () => {
    if (!proposalStep) return;
    setApplying(true);
    try {
      const newSteps = steps.map((s, i) => (i === index ? proposalStep : s));
      const { project: updated } = await api.saveMaterial(project.id, { chapter: { ...chapter, steps: newSteps } });
      onProjectUpdate(updated);
      setProposalStep(null);
      setReviseInstruction("");
    } catch (e) {
      setReviseError(e instanceof Error ? e.message : "適用に失敗しました。");
    } finally {
      setApplying(false);
    }
  };

  // 「次へ」を押した分だけ先に進める。クリックで未到達の手順へは飛べない。
  const goTo = (next: number) => {
    if (next < 0 || next >= steps.length) return;
    if (next > maxReached) return;
    setIndex(next);
    onProgressChange({ currentStepIndex: next });
  };

  const handleNext = () => {
    if (isLast) return;
    const next = index + 1;
    setIndex(next);
    onProgressChange({ currentStepIndex: next, maxReachedStepIndex: Math.max(maxReached, next) });
  };

  return (
    <div className={`material-layout ${navCollapsed ? "nav-collapsed" : ""}`}>
      <div className="step-nav-rail">
        <button
          className="nav-toggle-btn"
          onClick={() => setNavCollapsed((v) => !v)}
          title={navCollapsed ? "手順ナビを開く" : "手順ナビを折りたたむ"}
        >
          <span className="nav-arrow">‹</span>
          <span className="label-text">折りたたむ</span>
        </button>
        <nav className="step-nav">
          {steps.map((s, i) => {
            const reachable = i <= maxReached;
            return (
              <button
                key={s.id}
                className={`step-nav-item ${i === index ? "current" : ""} ${i < index ? "done" : ""}`}
                disabled={!reachable}
                onClick={() => goTo(i)}
                title={reachable ? s.title : "「次へ」で順に進めると表示されます"}
              >
                <span className="dot" />
                <span className="label-text">{s.title}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="material-main">
        {chapter.noteBanner && (
          <div className={`banner-note ${chapter.noteBannerTone === "warn" ? "warn" : ""}`}>{chapter.noteBanner}</div>
        )}
        {isStale && (
          <div className="banner-note warn">
            画像分析またはワイヤーフレームがこの教材の作成後に変更されています。内容が古くなっている可能性があるため、見直しをおすすめします。
          </div>
        )}
        {regenError && <div className="banner-note warn">{regenError}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {project.material.generatedAt
              ? `最終生成：${new Date(project.material.generatedAt).toLocaleString("ja-JP")}`
              : "最終生成：不明"}
          </div>
          {pendingRegeneration ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              下の内容を確認し、採用するか破棄するかを選ぶと、もう一度作り直せます。
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {hasExistingAnimations && (
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={carryOverAnimations}
                    onChange={(e) => setCarryOverAnimations(e.target.checked)}
                    disabled={regenerating}
                  />
                  以前の演出（アニメーション）を引き継ぐ
                </label>
              )}
              <button className="btn btn-sm" onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? "教材を作り直しています…（数分かかることがあります）" : "教材をもう一度作り直す"}
              </button>
            </div>
          )}
        </div>

        {pendingRegeneration && (
          <MaterialRegenerationReview
            oldChapter={chapter}
            newChapter={pendingRegeneration.proposal.chapter}
            onAdopt={handleAdoptRegeneration}
            onDiscard={handleDiscardRegeneration}
            adopting={adopting}
            discarding={discarding}
            error={reviewError}
          />
        )}

        <div className="step-head">
          <div className="step-tag">
            STEP {step.order} / {steps.length}
          </div>
          <h2>{step.title}</h2>
          <p className="goal">{step.goal}</p>
        </div>

        <div>
          <h3 className="section-title">B. 図と説明（親要素・子要素・余白の関係）</h3>
          <StructureDiagram diagram={step.structureDiagram} />
          <p className="explain-text" style={{ whiteSpace: "pre-wrap" }}>
            {step.explanation}
          </p>
        </div>

        <div>
          <h3 className="section-title">C. どこに書くか</h3>
          {step.fileBlocks.map((fb, i) => (
            <div className="target-box" key={i} style={{ marginBottom: i < step.fileBlocks.length - 1 ? 8 : 0 }}>
              <span className="op-chip">{fb.operationType}</span>
              <span className="file-chip">{fb.file}</span>
              {fb.insertLocation}
            </div>
          ))}
        </div>

        <div>
          <h3 className="section-title">D. コード（緑色が今回の追加分）</h3>
          <div style={{ display: "grid", gap: 14 }}>
            {step.fileBlocks.map((fb, i) => (
              <DiffCodeBlock
                key={i}
                fileName={fb.file}
                contextLines={fb.beforeLines}
                addedLines={fb.newLines}
                afterContextLines={fb.afterLines}
                copyCode={fb.copyCode}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="section-title">この手順を相談で修正する（任意）</h3>
          <p className="explain-text">
            この手順について質問・修正依頼をすると、Claude
            Codeが変更案を作成します。相談しただけではこの教材は書き換わりません。内容を確認し、「この内容を適用する」を押したときだけ教材とプレビューに反映されます。
          </p>
          <textarea
            value={reviseInstruction}
            onChange={(e) => setReviseInstruction(e.target.value)}
            placeholder="例：ボタンの色をもう少し薄くしたい／余白をもっと広げたい"
            style={{ minHeight: 70 }}
            disabled={revising || applying}
          />
          {reviseError && <div className="banner-note warn">{reviseError}</div>}
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={handleRevise} disabled={revising || applying || !reviseInstruction.trim()}>
              {revising ? "変更案を作成中です…" : "変更案を作成する"}
            </button>
          </div>

          {proposalStep && (
            <div className="card" style={{ marginTop: 14, borderColor: "var(--accent)" }}>
              <div className="progress-pill" style={{ marginBottom: 8 }}>
                変更案（まだ適用されていません）
              </div>
              <p className="goal">{proposalStep.goal}</p>
              <p className="explain-text" style={{ whiteSpace: "pre-wrap" }}>
                {proposalStep.explanation}
              </p>
              <div style={{ display: "grid", gap: 14 }}>
                {proposalStep.fileBlocks.map((fb, i) => (
                  <DiffCodeBlock
                    key={i}
                    fileName={fb.file}
                    contextLines={fb.beforeLines}
                    addedLines={fb.newLines}
                    afterContextLines={fb.afterLines}
                    copyCode={fb.copyCode}
                  />
                ))}
              </div>
              <p style={{ fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>変更案の表示見本</p>
              <StagePreview html={proposalStep.previewHtml} css={proposalStep.previewCss} heightPx={300} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" onClick={handleApplyProposal} disabled={applying}>
                  {applying ? "適用中..." : "この内容を適用する"}
                </button>
                <button className="btn btn-ghost" onClick={() => setProposalStep(null)} disabled={applying}>
                  破棄する
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="step-footer">
          <button className="btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
            ← 前の手順
          </button>
          <button className="btn btn-primary" onClick={handleNext} disabled={isLast}>
            {isLast ? "最後の手順です" : "次へ →"}
          </button>
        </div>
      </div>

      <aside className="material-side">
        <div>
          <h3 className="section-title">A. 今回作るところ（お手本画像の対象範囲）</h3>
          <DiagramOverlay imageUrl={chapter.sampleImageUrl} rect={step.diagramRect} label={step.diagramLabel} />
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>{chapter.sampleImageNote}</p>
          {step.diagramCaveat && (
            <p style={{ fontSize: 14, color: "#9c5a00", marginTop: 4 }}>※ {step.diagramCaveat}</p>
          )}
        </div>

        <div>
          <h3 className="section-title">E. この手順まで進めた表示見本</h3>
          <StagePreview html={step.previewHtml} css={step.previewCss} heightPx={420} />
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>
            この表示は教材として固定したサンプルコードによる「教材コードの表示見本」です。あなたが貼り付けたコードの表示（「自分のコードを試す」タブ）やお手本画像とは別物で、あなたの手元のファイルとは連動していません。
          </p>
        </div>

        <div>
          <h3 className="section-title">F. 調整と確認</h3>
          <div className="adjust-list">
            {step.adjustPoints.map((a) => (
              <div className="adjust-item" key={a.prop}>
                <div className="adjust-label">{a.label}</div>
                <div>
                  <code>{a.prop}</code>: <code>{a.value}</code>
                  <div style={{ marginTop: 4, color: "var(--ink-soft)" }}>{a.note}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="check-first">
            <span className="check-first-label">表示が違うときにまず見る場所：</span>
            {step.checkFirst}
            <div style={{ marginTop: 4, color: "var(--ink-soft)", fontSize: 14 }}>
              （これは最初に確認する候補です。実際の原因は、あなたのコードを見なければ断定できません。）
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
