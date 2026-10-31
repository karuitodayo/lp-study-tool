import { useState } from "react";
import { api } from "../api";

type Props = {
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export default function ProjectCreateForm({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [target, setTarget] = useState("");
  const [problem, setProblem] = useState("");
  const [product, setProduct] = useState("");
  const [cta, setCta] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { project } = await api.createProject(name, {
        purpose,
        target,
        problem,
        product,
        cta,
        deadline,
        notes,
      });
      onCreated(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20 }}>新規プロジェクト</h1>
      <p className="explain-text">
        わかっている範囲だけ入力してください。未定の項目は空欄のままで進められます。
      </p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>プロジェクト名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：〇〇サービス LP"
          />
        </div>
        <div className="form-row">
          <label>目的（何のためのLPか）</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：資料請求を増やす" />
        </div>
        <div className="form-row">
          <label>ターゲット</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="例：30代の人事担当者" />
        </div>
        <div className="form-row">
          <label>ターゲットが抱える課題</label>
          <input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="例：採用にかかる工数が多い" />
        </div>
        <div className="form-row">
          <label>商品・サービス</label>
          <input value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div className="form-row">
          <label>促したい行動（CTA）</label>
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="例：無料相談に申し込む" />
        </div>
        <div className="form-row">
          <label>納期</label>
          <input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="未定でも可" />
        </div>
        <div className="form-row">
          <label>メモ（支給素材・禁止表現など）</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="hint">ここは後からいつでも編集できます。</div>
        </div>

        {error && <div className="banner-note warn">{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "作成中..." : "作成してはじめる"}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
