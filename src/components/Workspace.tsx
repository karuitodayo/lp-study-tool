import { useEffect, useState } from "react";
import { api } from "../api";
import type { MaterialChapter, Project } from "../types";
import { resolveChapter } from "../materialAssets";
import DesignPanel from "./DesignPanel";
import WireframePanel from "./WireframePanel";
import ImagesPanel from "./ImagesPanel";
import AnalysisPanel from "./AnalysisPanel";
import AssetsPanel from "./AssetsPanel";
import MaterialPanel from "./MaterialPanel";
import MaterialEmptyState from "./MaterialEmptyState";
import OwnCodePreview from "./OwnCodePreview";
import ConsultPanel from "./ConsultPanel";

type Props = { projectId: string };
type Tab = "images" | "assets" | "analysis" | "design" | "wireframe" | "material" | "own" | "consult";

// 専用教材が未作成のときに、実装用素材タブの「使う場所」一覧を空にするための章。
// 無関係な共通サンプルの枠に割り当てさせないため、共通サンプルは使わない。
const EMPTY_CHAPTER: MaterialChapter = {
  id: "empty",
  title: "",
  isSample: false,
  sampleImageUrl: "",
  sampleImageNote: "",
  noteBanner: "",
  noteBannerTone: "info",
  steps: [],
};

export default function Workspace({ projectId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    api
      .getProject(projectId)
      .then((p) => {
        if (cancelled) return;
        setProject(p.project);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました。"));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // 教材の生成（作成・作り直し）が「生成中」の間だけ、完了を検知するために定期的に
  // プロジェクトを再取得する。ページ再読み込みや別タブへの切り替えでローカルの状態（ボタンの
  // ローディング表示）が失われても、サーバー側に保存された生成状態（project.material.generationStatus）
  // を見て復元・自動更新するための仕組み。生成中でない間は一切通信しない。
  const generationState = project?.material.generationStatus?.state ?? null;
  useEffect(() => {
    if (generationState !== "generating") return;
    let cancelled = false;
    const timer = setInterval(() => {
      api
        .getProject(projectId)
        .then((p) => {
          if (!cancelled) setProject(p.project);
        })
        .catch(() => {
          // ポーリング中の一時的な通信失敗は無視し、次回の間隔で再試行する（自動再試行とは別物で、
          // あくまで既に進行中の処理の結果を取りに行っているだけ）。
        });
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, generationState]);

  // プロジェクトを更新し、サーバーへ保存する共通処理。
  const persist = async (patch: Parameters<typeof api.updateProject>[1]) => {
    setSaving(true);
    try {
      const { project: updated } = await api.updateProject(projectId, patch);
      setProject(updated);
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <div className="banner-note warn">{error}</div>;
  }
  if (!project) {
    return <p>読み込み中...</p>;
  }

  const rawChapter = project.material.chapter ?? EMPTY_CHAPTER;
  const chapter = project.material.chapter ? resolveChapter(project.material.chapter, project.assets) : null;
  const totalSteps = chapter?.steps.length ?? 0;
  const isStale =
    project.material.chapter !== null &&
    Boolean(
      (project.analysis.confirmedAt &&
        project.analysis.confirmedAt !== project.material.basedOnAnalysisConfirmedAt) ||
        (project.wireframe.generatedAt &&
          project.wireframe.generatedAt !== project.material.basedOnWireframeGeneratedAt)
    );

  return (
    <div className="workspace">
      <div className="workspace-head">
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 2 }}>{project.name}</h1>
          <div className="save-status">
            {saving ? "保存中..." : savedAt ? `最終保存: ${savedAt.toLocaleTimeString("ja-JP")}` : "未編集"}
          </div>
        </div>
      </div>

      <div className="workspace-body">
        <nav className="workspace-nav" aria-label="画面切り替え">
          <button
            className={`nav-icon-btn ${tab === "images" ? "active" : ""}`}
            onClick={() => setTab("images")}
            title="画像登録"
          >
            <svg viewBox="0 0 20 20">
              <rect x="3" y="4" width="14" height="12" rx="2" />
              <circle cx="7.5" cy="8.5" r="1.3" />
              <path d="M4 14l4-4 3 3 3-4 3 3" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "assets" ? "active" : ""}`}
            onClick={() => setTab("assets")}
            title={`実装用素材${project.assets.length > 0 ? `（${project.assets.length}）` : ""}`}
          >
            <svg viewBox="0 0 20 20">
              <rect x="3" y="3" width="9" height="9" rx="1.5" />
              <rect x="8" y="8" width="9" height="9" rx="1.5" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "analysis" ? "active" : ""}`}
            onClick={() => setTab("analysis")}
            title={`画像分析${project.analysis.confirmed ? "✓" : ""}`}
          >
            <svg viewBox="0 0 20 20">
              <circle cx="9" cy="9" r="5.2" />
              <line x1="13" y1="13" x2="17" y2="17" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "design" ? "active" : ""}`}
            onClick={() => setTab("design")}
            title={`①設計${project.design.confirmed ? "✓" : ""}`}
          >
            <svg viewBox="0 0 20 20">
              <path d="M4 16l1-4 8-8 3 3-8 8-4 1z" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "wireframe" ? "active" : ""}`}
            onClick={() => setTab("wireframe")}
            title="②ワイヤーフレーム"
          >
            <svg viewBox="0 0 20 20">
              <rect x="3" y="3" width="6" height="6" />
              <rect x="11" y="3" width="6" height="6" />
              <rect x="3" y="11" width="6" height="6" />
              <rect x="11" y="11" width="6" height="6" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "material" ? "active" : ""}`}
            onClick={() => setTab("material")}
            title={`④実装教材${chapter ? `✓（${project.progress.currentStepIndex + 1}/${totalSteps}）` : "（未作成）"}`}
          >
            <svg viewBox="0 0 20 20">
              <path d="M7 5L3 10l4 5M13 5l4 5-4 5" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "own" ? "active" : ""}`}
            onClick={() => setTab("own")}
            title="自分のコードを試す"
          >
            <svg viewBox="0 0 20 20">
              <path d="M4 5h12v8H9l-3 3v-3H4z" />
            </svg>
          </button>
          <button
            className={`nav-icon-btn ${tab === "consult" ? "active" : ""}`}
            onClick={() => setTab("consult")}
            title="相談欄"
          >
            <svg viewBox="0 0 20 20">
              <path d="M4 5h12v7H8l-3 3v-3H4z" />
              <line x1="7" y1="8" x2="13" y2="8" />
            </svg>
          </button>
        </nav>

        <div className="workspace-content">
          {tab === "images" && (
            <ImagesPanel
              project={project}
              onProjectUpdate={(p) => {
                setProject(p);
                setSavedAt(new Date());
              }}
            />
          )}

          {tab === "assets" && (
            <AssetsPanel
              project={project}
              chapter={rawChapter}
              onProjectUpdate={(p) => {
                setProject(p);
                setSavedAt(new Date());
              }}
            />
          )}

          {tab === "analysis" && (
            <AnalysisPanel
              project={project}
              onProjectUpdate={(p) => {
                setProject(p);
                setSavedAt(new Date());
              }}
            />
          )}

          {tab === "design" && (
            <DesignPanel
              project={project}
              onProjectUpdate={(p) => {
                setProject(p);
                setSavedAt(new Date());
              }}
            />
          )}

          {tab === "wireframe" && (
            <WireframePanel
              project={project}
              onProjectUpdate={(p) => {
                setProject(p);
                setSavedAt(new Date());
              }}
            />
          )}

          {tab === "material" &&
            (chapter ? (
              <MaterialPanel
                key={chapter.id}
                chapter={chapter}
                project={project}
                isStale={isStale}
                onProgressChange={(progress) => persist({ progress })}
                onProjectUpdate={(p) => {
                  setProject(p);
                  setSavedAt(new Date());
                }}
              />
            ) : (
              <MaterialEmptyState
                project={project}
                onProjectUpdate={(p) => {
                  setProject(p);
                  setSavedAt(new Date());
                }}
              />
            ))}

          {tab === "own" && <OwnCodePreview />}

          {tab === "consult" && <ConsultPanel project={project} />}
        </div>
      </div>
    </div>
  );
}
