import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ConsultMessage, Project } from "../types";
import MarkdownText from "./MarkdownText";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";

type Props = { project: Project };

// この件数より多いときは、直近だけ表示して過去分を折りたたむ（長い相談履歴を一覧しやすくするため）。
const HISTORY_VISIBLE_COUNT = 6;

export default function ConsultPanel({ project }: Props) {
  const [messages, setMessages] = useState<ConsultMessage[]>(project.consult.messages);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const questionResize = useAutoResizeTextarea(question);

  // プロジェクトを切り替えたら、そのプロジェクトの履歴を読み込み直す（他プロジェクトの会話と混ざらないように）。
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoadError(null);
    setShowAllHistory(false);
    api
      .getConsultMessages(project.id)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "履歴の読み込みに失敗しました。");
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const handleSend = async () => {
    const text = question.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.postConsult(project.id, text);
      if (res.messages.length > 0) {
        setMessages(res.messages);
      }
      if (res.ok) {
        setQuestion("");
      } else {
        setError(res.error ?? "相談の送信に失敗しました。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "相談の送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  const noFinishImage = !project.images.finish;
  const hasHiddenHistory = !showAllHistory && messages.length > HISTORY_VISIBLE_COUNT;
  const visibleMessages = hasHiddenHistory ? messages.slice(-HISTORY_VISIBLE_COUNT) : messages;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
      <div className="card">
        <h2 className="section-title">相談欄</h2>
        <p className="explain-text">
          このプロジェクトの制作について、画面を移動せずにClaude Codeへ相談できます。設定変更や教材データの更新はここでは行われず、回答は提案として示されます。
        </p>
        <div className="banner-note warn">
          回答にはPC内のClaude Code CLI（お使いのサブスクリプション枠）を使います。APIキーの追加課金は発生しません。回答は参考情報であり、事実・数値・効果の最終確認は利用者が行ってください。
        </div>
        {noFinishImage && (
          <div className="banner-note warn">
            完成イメージ画像が未登録です。画像の見た目に関する質問には、登録後に改めて相談してください。
          </div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        {loadError && <div className="banner-note warn">{loadError}</div>}

        <div className="chat-list">
          {messages.length === 0 && !loadError && (
            <p style={{ fontSize: 15, color: "var(--ink-soft)" }}>
              まだ相談はありません。例：「このプロジェクトの配色を説明して」
            </p>
          )}
          {hasHiddenHistory && (
            <button className="chat-history-toggle" onClick={() => setShowAllHistory(true)}>
              過去の会話を表示する（他に{messages.length - HISTORY_VISIBLE_COUNT}件）
            </button>
          )}
          {showAllHistory && messages.length > HISTORY_VISIBLE_COUNT && (
            <button className="chat-history-toggle" onClick={() => setShowAllHistory(false)}>
              過去の会話を折りたたむ
            </button>
          )}
          {visibleMessages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "error" ? "banner-note warn" : `chat-msg ${m.role === "user" ? "chat-msg-user" : "chat-msg-assistant"}`
              }
            >
              <strong className="chat-meta">
                {m.role === "user" ? "あなた" : m.role === "error" ? "エラー" : "回答"} ・{" "}
                {new Date(m.createdAt).toLocaleString("ja-JP")}
              </strong>
              {m.role === "assistant" ? (
                <MarkdownText text={m.text} />
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>
              )}
            </div>
          ))}
          {sending && (
            <div className="chat-msg chat-msg-assistant chat-msg-pending">
              回答を作成中です…（最大2分程度かかることがあります）
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="banner-note warn">{error}</div>}

        <textarea
          ref={questionResize.ref}
          onInput={questionResize.onInput}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例：このプロジェクトの配色を説明して"
          style={{ width: "100%", minHeight: 80, resize: "none" }}
          disabled={sending}
        />
        <div>
          <button className="btn btn-primary" onClick={handleSend} disabled={sending || !question.trim()}>
            {sending ? "送信中..." : "送信する"}
          </button>
        </div>
      </div>
    </div>
  );
}
