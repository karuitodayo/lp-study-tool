import { useRef, useState } from "react";
import { api } from "../api";
import type { ImageRecord, Project, Region } from "../types";
import RegionPicker from "./RegionPicker";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

type Props = {
  project: Project;
  onProjectUpdate: (project: Project) => void;
};

export default function ImagesPanel({ project, onProjectUpdate }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"finish" | "reference" | null>(null);
  const finishInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File, kind: "finish" | "reference") => {
    setError(null);
    setUploading(kind);
    try {
      const { project: updated } = await api.uploadImage(project.id, file, kind);
      onProjectUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました。");
    } finally {
      setUploading(null);
    }
  };

  const handleMemoChange = async (imageId: string, memo: string) => {
    const { project: updated } = await api.updateImage(project.id, imageId, { memo });
    onProjectUpdate(updated);
  };

  const handleRegionChange = async (imageId: string, region: Region | null) => {
    const { project: updated } = await api.updateImage(project.id, imageId, { region });
    onProjectUpdate(updated);
  };

  const handleDelete = async (imageId: string) => {
    const { project: updated } = await api.deleteImage(project.id, imageId);
    onProjectUpdate(updated);
  };

  return (
    <div className="image-panels">
      <div className="card">
        <h2 className="section-title">
          完成イメージ画像
          <span className="progress-pill" style={{ marginLeft: "auto" }}>
            {project.images.finish ? "登録済み" : "未登録"}
          </span>
        </h2>
        <p className="explain-text">LP全体の再現基準にする画像です（1枚）。</p>

        {project.images.finish ? (
          <div>
            <img className="thumb" src={project.images.finish.url} alt="完成イメージ" />
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                className="btn btn-sm"
                onClick={() => finishInputRef.current?.click()}
                disabled={uploading === "finish"}
              >
                差し替える
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(project.images.finish!.id)}>
                削除
              </button>
            </div>
          </div>
        ) : (
          <div className="upload-box" onClick={() => finishInputRef.current?.click()} style={{ cursor: "pointer" }}>
            {uploading === "finish" ? "アップロード中..." : "クリックして完成イメージ画像を登録（JPEG/PNG/WebP/GIF・8MBまで）"}
          </div>
        )}
        <input
          ref={finishInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file, "finish");
            e.target.value = "";
          }}
        />
      </div>

      <div className="card">
        <h2 className="section-title">
          参考画像
          {project.images.references.length > 0 && (
            <span className="progress-pill" style={{ marginLeft: "auto" }}>
              {project.images.references.length}枚
            </span>
          )}
        </h2>
        <p className="explain-text">
          複数登録できます。画像ごとに参考にしたい理由をメモし、範囲をドラッグで指定できます。
        </p>

        <div
          className="upload-box"
          onClick={() => refInputRef.current?.click()}
          style={{ cursor: "pointer", marginBottom: 14 }}
        >
          {uploading === "reference" ? "アップロード中..." : "クリックして参考画像を追加"}
        </div>
        <input
          ref={refInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file, "reference");
            e.target.value = "";
          }}
        />

        {project.images.references.length === 0 && (
          <div className="empty-hint">まだ参考画像がありません。</div>
        )}

        <div className="ref-grid">
          {project.images.references.map((img) => (
            <ReferenceImageCard
              key={img.id}
              image={img}
              onRegionChange={(region) => handleRegionChange(img.id, region)}
              onMemoBlur={(memo) => handleMemoChange(img.id, memo)}
              onDelete={() => handleDelete(img.id)}
            />
          ))}
        </div>
      </div>

      {error && <div className="banner-note warn" style={{ gridColumn: "1 / -1" }}>{error}</div>}
    </div>
  );
}

// 参考画像1件分。referencesは増減する配列のため、自動拡張フックを安全に使うには
// 1件＝1コンポーネントに分ける（他画面の一覧編集と同じ理由）。
function ReferenceImageCard({
  image: img,
  onRegionChange,
  onMemoBlur,
  onDelete,
}: {
  image: ImageRecord;
  onRegionChange: (region: Region | null) => void;
  onMemoBlur: (memo: string) => void;
  onDelete: () => void;
}) {
  const memoResize = useAutoResizeTextarea(img.memo ?? "");

  return (
    <div className="ref-item">
      <RegionPicker imageUrl={img.url} region={img.region ?? null} onChange={onRegionChange} />
      <div>
        <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}>参考にしたい場所・理由</label>
        <textarea
          ref={memoResize.ref}
          onInput={memoResize.onInput}
          defaultValue={img.memo ?? ""}
          placeholder="例：配色とボタンの形を参考にしたい"
          onBlur={(e) => onMemoBlur(e.target.value)}
          style={{ width: "100%", minHeight: 50, marginTop: 4, resize: "none" }}
        />
        <button className="btn btn-sm btn-danger" style={{ marginTop: 6 }} onClick={onDelete}>
          この画像を削除
        </button>
      </div>
    </div>
  );
}
