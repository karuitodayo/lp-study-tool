import type { ProjectSummary } from "../types";
import { api } from "../api";

type Props = {
  projects: ProjectSummary[] | null;
  onOpen: (id: string) => void;
  onDeleted: () => void;
};

const SAMPLE_TOTAL_STEPS = 4; // 専用教材が未作成のプロジェクトで表示する共通サンプルの手順数

export default function ProjectList({ projects, onOpen, onDeleted }: Props) {
  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`「${name}」を削除します。画像・教材の進捗もすべて消えます。よろしいですか？`)) {
      return;
    }
    await api.deleteProject(id);
    onDeleted();
  };

  return (
    <div>
      <div className="list-main-head">
        <h1>プロジェクト一覧</h1>
        {projects !== null && projects.length > 0 && <span className="count">{projects.length}件</span>}
      </div>

      {projects === null && <p>読み込み中...</p>}

      {projects !== null && projects.length === 0 && (
        <div className="empty-hint">まだプロジェクトがありません。左の「＋新規プロジェクト」から作成してください。</div>
      )}

      {projects !== null && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((p) => {
            const total = p.materialStepCount ?? SAMPLE_TOTAL_STEPS;
            const current = Math.min(p.progress.maxReachedStepIndex + 1, total);
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            return (
              <button key={p.id} className="project-card" onClick={() => onOpen(p.id)}>
                <div className="project-card-thumb">
                  {p.finishImageUrl ? (
                    <img src={p.finishImageUrl} alt="" />
                  ) : (
                    <span className="placeholder" aria-hidden="true">
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <circle cx="8.5" cy="9.5" r="1.5" />
                        <path d="M4 16l4.5-4.5 3 3 4-4.5 4.5 4.5" />
                      </svg>
                    </span>
                  )}
                  <span className="project-card-delete" onClick={(e) => handleDelete(e, p.id, p.name)} title="削除">
                    ×
                  </span>
                </div>
                <div className="project-card-body">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-meta">更新：{new Date(p.updatedAt).toLocaleString("ja-JP")}</div>
                  <div className="project-card-progress">
                    <span className="track">
                      <span className="fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="label">
                      実装教材 {current} / {total}
                      {p.materialStepCount === null ? "（サンプル）" : ""}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
