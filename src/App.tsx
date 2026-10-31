import { useEffect, useState } from "react";
import { api } from "./api";
import type { ProjectSummary } from "./types";
import ProjectList from "./components/ProjectList";
import ProjectCreateForm from "./components/ProjectCreateForm";
import Workspace from "./components/Workspace";

type View = { name: "list" } | { name: "create" } | { name: "workspace"; projectId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadProjects = async () => {
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "プロジェクト一覧の取得に失敗しました。");
    }
  };

  useEffect(() => {
    reloadProjects();
  }, []);

  // ワークスペース（プロジェクト内の各タブ）は今回のSoft Afterglow改修の対象外のため、
  // 従来どおり上部ヘッダー＋本文のレイアウトのまま変更しない。
  if (view.name === "workspace") {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <span className="mark">LP制作教材</span>
            <span className="sub">自分だけのLP制作学習ツール</span>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setView({ name: "list" });
              reloadProjects();
            }}
          >
            ← プロジェクト一覧へ
          </button>
        </header>
        <main className="page">
          {error && <div className="banner-note warn">{error}</div>}
          <Workspace projectId={view.projectId} />
        </main>
      </div>
    );
  }

  // プロジェクト一覧・新規作成は、Soft Afterglowの左サイドバー構成。
  return (
    <div className="list-shell">
      <aside className="list-sidebar">
        {/* 夜空〜夕焼けの装飾（星・波・三日月）。操作要素より背面・クリック不可。 */}
        <div className="sidebar-decor" aria-hidden="true">
          <img className="sidebar-decor-stars" src="/assets/soft-afterglow/night-stars.svg" alt="" />
          <img className="sidebar-decor-moon" src="/assets/soft-afterglow/crescent-moon.svg" alt="" />
          <img className="sidebar-decor-wave" src="/assets/soft-afterglow/twilight-wave.svg" alt="" />
        </div>
        <div className="list-sidebar-brand">
          <span className="mark">LP制作教材</span>
          <span className="sub">自分だけのLP制作学習ツール</span>
        </div>
        <button className="btn-new-project" onClick={() => setView({ name: "create" })}>
          + 新規プロジェクト
        </button>
      </aside>

      <main className="list-main">
        {error && <div className="banner-note warn">{error}</div>}

        {view.name === "list" && (
          <ProjectList
            projects={projects}
            onOpen={(id) => setView({ name: "workspace", projectId: id })}
            onDeleted={reloadProjects}
          />
        )}

        {view.name === "create" && (
          <ProjectCreateForm
            onCancel={() => setView({ name: "list" })}
            onCreated={(id) => setView({ name: "workspace", projectId: id })}
          />
        )}
      </main>
    </div>
  );
}
