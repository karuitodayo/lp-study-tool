import { useMemo } from "react";
import type { MaterialChapter } from "../types";
import { buildMaterialDiffReport, type FileBlockDiff, type NameDiff, type StepMatch } from "../materialDiff";

type Props = {
  oldChapter: MaterialChapter;
  newChapter: MaterialChapter;
  onAdopt: () => void;
  onDiscard: () => void;
  adopting: boolean;
  discarding: boolean;
  error: string | null;
};

function NameList({ title, diff }: { title: string; diff: NameDiff }) {
  if (diff.removed.length === 0 && diff.added.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
      {diff.removed.length > 0 && (
        <div style={{ fontSize: 12.5 }}>
          旧にあって新にない：{diff.removed.map((c) => <code key={c} style={{ marginRight: 6 }}>{c}</code>)}
        </div>
      )}
      {diff.added.length > 0 && (
        <div style={{ fontSize: 12.5 }}>
          新にあって旧にない：{diff.added.map((c) => <code key={c} style={{ marginRight: 6 }}>{c}</code>)}
        </div>
      )}
    </div>
  );
}

function FileBlockDiffView({ diff }: { diff: FileBlockDiff }) {
  if (!diff.hasChange) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line, #333)" }}>
      <span className="file-chip">{diff.file}</span>
      {(!diff.existsInOld || !diff.existsInNew) && (
        <div style={{ fontSize: 12.5, marginTop: 4, color: "#9c5a00" }}>
          {!diff.existsInOld ? "このファイルへの追加は、新しい教材でだけ行われます。" : "このファイルへの追加は、旧い教材にしかありませんでした。"}
        </div>
      )}
      {diff.insertLocationChanged && (
        <div style={{ marginTop: 6, fontSize: 12.5 }}>
          <div style={{ fontWeight: 700 }}>挿入位置</div>
          {diff.oldInsertLocation && <div>旧：{diff.oldInsertLocation}</div>}
          {diff.newInsertLocation && <div>新：{diff.newInsertLocation}</div>}
        </div>
      )}
      <NameList title="クラス名（HTML）" diff={diff.classNames} />
      <NameList title="CSSセレクタ" diff={diff.cssSelectors} />
      {(diff.tagNames.removed.length > 0 || diff.tagNames.added.length > 0) && (
        <div style={{ marginTop: 6, fontSize: 12.5 }}>
          <div style={{ fontWeight: 700 }}>タグ構造</div>
          {diff.tagNames.removed.length > 0 && <div>旧にあって新にない：{diff.tagNames.removed.join(", ")}</div>}
          {diff.tagNames.added.length > 0 && <div>新にあって旧にない：{diff.tagNames.added.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

function StepMatchCard({ match }: { match: StepMatch }) {
  if (match.kind === "unmatchedOld") {
    return (
      <details className="card" style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5 }}>
          ● 手順{match.oldStep.order}「{match.oldStep.title}」
          <span style={{ color: "#9c5a00", marginLeft: 6 }}>対応不明（新しい教材にはありません）</span>
        </summary>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
          新しい教材の、どの手順とも対応がはっきりしませんでした。もしこの手順の内容をVS Code側で実装済みの場合、新しい教材のどの手順にも対応する説明が見当たらないため、このまま残すか手動で見直してください。
        </p>
      </details>
    );
  }
  if (match.kind === "unmatchedNew") {
    return (
      <details className="card" style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5 }}>
          ● 手順{match.newStep.order}「{match.newStep.title}」
          <span style={{ color: "#2e7d32", marginLeft: 6 }}>新しく追加された手順</span>
        </summary>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
          旧い教材には対応する手順がありませんでした。実装済みのコードには、まだこの手順の内容が反映されていません。
        </p>
      </details>
    );
  }
  // matched
  if (!match.hasChange) {
    return (
      <div className="card" style={{ marginBottom: 8, fontSize: 13.5, color: "var(--ink-soft)" }}>
        手順{match.newStep.order}「{match.newStep.title}」：変更なし
      </div>
    );
  }
  return (
    <details className="card" style={{ marginBottom: 8 }} open>
      <summary style={{ cursor: "pointer", fontSize: 13.5 }}>
        ● 手順{match.newStep.order}「{match.newStep.title}」
        {match.oldStep.title !== match.newStep.title && (
          <span style={{ color: "var(--ink-soft)", marginLeft: 6 }}>（旧：「{match.oldStep.title}」）</span>
        )}
      </summary>
      <div style={{ marginTop: 4 }}>
        {match.fileDiffs.map((fd) => (
          <FileBlockDiffView key={fd.file} diff={fd} />
        ))}
      </div>
    </details>
  );
}

export default function MaterialRegenerationReview({
  oldChapter,
  newChapter,
  onAdopt,
  onDiscard,
  adopting,
  discarding,
  error,
}: Props) {
  const report = useMemo(() => buildMaterialDiffReport(oldChapter, newChapter), [oldChapter, newChapter]);
  const { structure, steps } = report;
  const unclearCount = steps.filter((s) => s.kind === "unmatchedOld").length;
  const changedCount = steps.filter((s) => s.kind === "matched" && s.hasChange).length;

  return (
    <div className="card" style={{ marginTop: 12, borderColor: "var(--accent)" }}>
      <div className="progress-pill" style={{ marginBottom: 8 }}>
        新しい教材（まだ保存されていません）
      </div>
      <p className="explain-text">
        内容を確認し、「この内容を採用する」を押すまで、現在の教材は書き換わりません。採用すると、置き換えられる現在の教材は自動的にバックアップとして保存されます。
      </p>

      <div style={{ fontSize: 13, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>教材全体の骨格</div>
        {structure.hasChange ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {structure.oldStepCount !== structure.newStepCount && (
              <li>手順の数：{structure.oldStepCount} → {structure.newStepCount}</li>
            )}
            {structure.oldSectionCount !== structure.newSectionCount && (
              <li>
                &lt;section&gt;の数：{structure.oldSectionCount} → {structure.newSectionCount}
                （区切り方が変わっています。古いコードの&lt;/section&gt;の位置がずれる可能性があります）
              </li>
            )}
            {structure.oldHasPageWrapper !== structure.newHasPageWrapper && (
              <li>
                ページ全体を囲む&lt;div class="page"&gt;：{structure.oldHasPageWrapper ? "あり" : "なし"} →{" "}
                {structure.newHasPageWrapper ? "あり" : "なし"}
              </li>
            )}
          </ul>
        ) : (
          <div style={{ color: "var(--ink-soft)" }}>大きな骨格（section分割・ページの囲み方）に変化はありません。</div>
        )}
      </div>

      {unclearCount > 0 && (
        <div className="banner-note warn" style={{ fontSize: 12.5 }}>
          対応がはっきりしない旧い手順が{unclearCount}件あります（下の一覧で「対応不明」と表示）。実装済みのコードにこれらの手順の内容がある場合は、新しい教材のどこにも対応がないため、残すかどうかご自身で判断してください。
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 6px" }}>
        手順ごとの変更点（変更がある{changedCount}件を開いて表示しています）
      </div>
      <div>
        {steps.map((s) => (
          <StepMatchCard key={s.kind === "unmatchedOld" ? `old-${s.oldStep.id}` : s.kind === "unmatchedNew" ? `new-${s.newStep.id}` : `m-${s.newStep.id}`} match={s} />
        ))}
      </div>

      {error && <div className="banner-note warn">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" onClick={onAdopt} disabled={adopting || discarding}>
          {adopting ? "採用中..." : "この内容を採用する"}
        </button>
        <button className="btn btn-ghost" onClick={onDiscard} disabled={adopting || discarding}>
          {discarding ? "破棄中..." : "破棄して、現在の教材のままにする"}
        </button>
      </div>
    </div>
  );
}
