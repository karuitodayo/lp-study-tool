import { useState } from "react";
import type { CodeLine } from "../types";

type Props = {
  fileName: string;
  contextLines: string[];
  addedLines: CodeLine[];
  // 追加分より後ろに続く既存コード（index.htmlの`</body></html>`など）。
  // これがあると、追加分がファイル末尾ではなく本文の途中に入ることが表示で分かる。
  afterContextLines?: string[];
  copyCode: string;
};

function renderWithMark(text: string, mark: string | null) {
  if (!mark) return text;
  const idx = text.indexOf(mark);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{mark}</mark>
      {text.slice(idx + mark.length)}
    </>
  );
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export default function DiffCodeBlock({
  fileName,
  contextLines,
  addedLines,
  afterContextLines = [],
  copyCode,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const handleCopy = async () => {
    setShowManual(false);
    try {
      await withTimeout(navigator.clipboard.writeText(copyCode), 2500);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    } catch {
      // 失敗時は非同期APIではなく同期的な代替手段を試す（ダイアログは使わない）
    }
    if (legacyCopy(copyCode)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setShowManual(true);
    }
  };

  const totalContext = contextLines.length;

  return (
    <div className="code-card">
      <div className="code-card-head">
        <span>{fileName}</span>
        <button className={`code-copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>
          {copied ? "コピーしました" : "追加分をコピー"}
        </button>
      </div>
      <pre className="code-pre">
        {contextLines.map((text, i) => (
          <div className="code-line dim" key={`ctx-${i}`}>
            <span className="ln">{i + 1}</span>
            <span className="code-text">{text || " "}</span>
          </div>
        ))}
        {addedLines.map((l, i) => (
          <div className="code-line added" key={`add-${i}`}>
            <span className="ln">{totalContext + i + 1}</span>
            <span className="code-text">{renderWithMark(l.text, l.mark)}</span>
          </div>
        ))}
        {afterContextLines.map((text, i) => (
          <div className="code-line dim" key={`after-${i}`}>
            <span className="ln">{totalContext + addedLines.length + i + 1}</span>
            <span className="code-text">{text || " "}</span>
          </div>
        ))}
      </pre>
      {showManual && (
        <div style={{ padding: "0 14px 14px" }}>
          <p style={{ color: "#f3c969", fontSize: 12.5, margin: "0 0 6px" }}>
            自動コピーに失敗しました。下のテキストを選択してコピーしてください。
          </p>
          <textarea
            readOnly
            value={copyCode}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: "100%", minHeight: 90, fontFamily: "monospace", fontSize: 12.5 }}
          />
        </div>
      )}
    </div>
  );
}
