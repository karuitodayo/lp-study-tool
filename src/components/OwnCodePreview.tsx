import { useState } from "react";
import StagePreview from "./StagePreview";

const SAMPLE_HTML = `<section id="product">
  <p class="product-eyebrow">PRODUCT</p>
  <div class="product-flex">
    <div class="product-left">
      <div class="product-photo ph1">MAN TO MAN</div>
    </div>
  </div>
</section>`;

export default function OwnCodePreview() {
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [css, setCss] = useState("");
  const [shown, setShown] = useState(false);

  return (
    <div className="card">
      <h2 className="section-title">自分のコードを試す</h2>
      <p className="explain-text">
        VS Codeなどで書いたHTML/CSSをここに貼り付けると、見た目を確認できます。アプリ本体や保存データとは隔離された状態で表示されます。
      </p>

      <div className="own-code-layout">
        <div>
          <div className="form-row">
            <label>HTML（body の中身）</label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              style={{ minHeight: 320, fontFamily: "monospace" }}
            />
          </div>
          <div className="form-row" style={{ marginTop: 14 }}>
            <label>CSS</label>
            <textarea
              value={css}
              onChange={(e) => setCss(e.target.value)}
              style={{ minHeight: 320, fontFamily: "monospace" }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShown(true)} style={{ marginTop: 14 }}>
            表示を確認する
          </button>
        </div>

        <div className="own-code-preview-rail">
          <h3 className="section-title">表示結果</h3>
          {shown ? (
            <StagePreview html={html} css={css} heightPx={600} />
          ) : (
            <div className="own-code-empty-hint">「表示を確認する」を押すと、ここに結果が表示されます。</div>
          )}
        </div>
      </div>
    </div>
  );
}
