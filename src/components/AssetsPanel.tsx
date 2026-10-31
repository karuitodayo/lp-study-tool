import { useRef, useState } from "react";
import { api } from "../api";
import type { MaterialChapter, Project, ProjectAsset } from "../types";

type Props = {
  project: Project;
  chapter: MaterialChapter;
  onProjectUpdate: (project: Project) => void;
};

function collectMaterialSlots(chapter: MaterialChapter) {
  const map = new Map<string, { key: string; label: string; suggestedFileName: string }>();
  chapter.steps.forEach((s) => s.photoSlots.forEach((slot) => map.set(slot.key, slot)));
  return [...map.values()];
}

// ②ワイヤーフレームで「写真を置く」にしたセクションも、使う場所として選べるようにする。
// 教材（④）のphotoSlotsとは別物のため、キーに接頭辞を付けて区別する。
function collectWireframeSlots(project: Project) {
  return project.wireframe.sections
    .filter((s) => s.hasImage)
    .map((s) => ({ key: `wireframe:${s.id}`, label: s.title || "（名称未設定のセクション）" }));
}

function SlotOptions({
  materialSlots,
  wireframeSlots,
  assignedSlotKeys,
}: {
  materialSlots: { key: string; label: string }[];
  wireframeSlots: { key: string; label: string }[];
  assignedSlotKeys: Set<string> | null;
}) {
  const renderOption = (s: { key: string; label: string }) => (
    <option key={s.key} value={s.key} disabled={assignedSlotKeys?.has(s.key) ?? false}>
      {s.label}
      {assignedSlotKeys?.has(s.key) ? "（使用中・変更すると入れ替わります）" : ""}
    </option>
  );
  return (
    <>
      {materialSlots.length > 0 && <optgroup label="④実装教材の写真枠">{materialSlots.map(renderOption)}</optgroup>}
      {wireframeSlots.length > 0 && (
        <optgroup label="②ワイヤーフレームの画像枠">{wireframeSlots.map(renderOption)}</optgroup>
      )}
    </>
  );
}

export default function AssetsPanel({ project, chapter, onProjectUpdate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [suggestedFileName, setSuggestedFileName] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const materialSlots = collectMaterialSlots(chapter);
  const wireframeSlots = collectWireframeSlots(project);
  const assignedSlotKeys = new Set(project.assets.map((a) => a.slotKey).filter(Boolean) as string[]);

  const handleFilePick = (file: File) => {
    setPendingFile(file);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const { project: updated } = await api.uploadAsset(project.id, pendingFile, {
        name: name || pendingFile.name,
        purpose,
        suggestedFileName: suggestedFileName || undefined,
        slotKey: slotKey || null,
      });
      onProjectUpdate(updated);
      setPendingFile(null);
      setName("");
      setPurpose("");
      setSuggestedFileName("");
      setSlotKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました。");
    } finally {
      setUploading(false);
    }
  };

  const handleSlotChange = async (asset: ProjectAsset, newSlotKey: string) => {
    const { project: updated } = await api.updateAsset(project.id, asset.id, { slotKey: newSlotKey || null });
    onProjectUpdate(updated);
  };

  const handleDelete = async (asset: ProjectAsset) => {
    const { project: updated } = await api.deleteAsset(project.id, asset.id);
    onProjectUpdate(updated);
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1200 }}>
      <div className="card">
        <h2 className="section-title">実装用素材</h2>
        <p className="explain-text">
          完成イメージ画像・参考画像とは別に、実際にコーディングで使う写真・画像を登録します。登録した素材は教材のプレビューに反映され、使っていない場合は仮枠として表示されます。
        </p>
        <div className="banner-note warn">
          素材を登録しただけでは、あなたの制作フォルダに配置したことにはなりません。教材のコードに書かれた相対パス（例：<code>images/hero-coffee.jpg</code>）と同じ場所・同じファイル名で、ご自身のVS Codeプロジェクトにも保存してください。
        </div>

        <div className="upload-box" onClick={() => fileInputRef.current?.click()} style={{ cursor: "pointer", marginTop: 10 }}>
          {pendingFile ? `選択中: ${pendingFile.name}` : "クリックして画像を選択（JPEG/PNG/WebP/GIF/SVG・8MBまで）"}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFilePick(f);
            e.target.value = "";
          }}
        />

        {pendingFile && (
          <div style={{ marginTop: 14 }}>
            <div className="two-col-collapse">
              <div className="form-row">
                <label>素材名</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：ヒーローのコーヒー写真" />
              </div>
              <div className="form-row">
                <label>用途・メモ</label>
                <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：ファーストビュー右側の写真" />
              </div>
              <div className="form-row">
                <label>保存するファイル名（VS Codeのimagesフォルダに置く名前）</label>
                <input
                  value={suggestedFileName}
                  onChange={(e) => setSuggestedFileName(e.target.value)}
                  placeholder="例：hero-coffee.jpg（空欄なら自動で付けます）"
                />
              </div>
              <div className="form-row">
                <label>この教材で使う場所</label>
                <select
                  value={slotKey}
                  onChange={(e) => setSlotKey(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 10 }}
                >
                  <option value="">未割り当て（あとで指定）</option>
                  <SlotOptions materialSlots={materialSlots} wireframeSlots={wireframeSlots} assignedSlotKeys={assignedSlotKeys} />
                </select>
              </div>
            </div>
            {error && <div className="banner-note warn">{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? "登録中..." : "この内容で登録する"}
              </button>
              <button className="btn" onClick={() => setPendingFile(null)}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {project.assets.length === 0 && <div className="empty-hint">まだ実装用素材が登録されていません。</div>}

      {project.assets.length > 0 && (
        <div className="asset-grid">
          {project.assets.map((a) => (
            <div className="card ref-item" key={a.id} style={{ gridTemplateColumns: "180px 1fr" }}>
              <img src={a.url} alt={a.name} className="thumb" style={{ height: 130, objectFit: "cover" }} />
              <div>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 2 }}>{a.purpose || "（用途メモなし）"}</div>
                <div className="target-box" style={{ marginTop: 8 }}>
                  <div>
                    <strong>VS Codeでの相対パス：</strong>
                    <code>images/{a.suggestedFileName}</code>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong>アプリ内プレビュー用URL：</strong>
                    <code style={{ wordBreak: "break-all" }}>{a.url}</code>
                    <span style={{ color: "var(--ink-soft)" }}>
                      （教材プレビュー専用。ご自身のコードにはこのURLではなく、上の相対パスを書いてください）
                    </span>
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <label>この教材で使う場所</label>
                  <select
                    value={a.slotKey ?? ""}
                    onChange={(e) => handleSlotChange(a, e.target.value)}
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 10 }}
                  >
                    <option value="">未割り当て</option>
                    <SlotOptions materialSlots={materialSlots} wireframeSlots={wireframeSlots} assignedSlotKeys={null} />
                  </select>
                </div>
                <button className="btn btn-sm btn-danger" style={{ marginTop: 8 }} onClick={() => handleDelete(a)}>
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
