import { Router } from "express";
import { randomUUID } from "node:crypto";
import { projectExists, readProject, writeProject } from "../store.js";
import { runConsultation, ConsultError } from "../consultRunner.js";

export const consultRouter = Router({ mergeParams: true });

const MAX_QUESTION_LENGTH = 4000;
const MAX_STORED_MESSAGES = 200;

// プロジェクトごとの二重送信防止（同時に1件まで）。サーバー再起動で自動的にクリアされる。
const inFlight = new Set();

const ERROR_MESSAGES = {
  cli_not_found:
    "Claude Code CLIが見つかりません。インストールされているか、PATHの設定をご確認ください。",
  not_logged_in: "Claude Codeにログインしていません。ターミナルで `claude` を起動し、ログイン状態をご確認ください。",
  usage_limit: "利用上限に達しています。しばらく時間を置いてから、もう一度お試しください。",
  timeout: "応答がタイムアウトしました（2分）。もう一度お試しください。",
  failed: "相談処理に失敗しました。もう一度お試しください。",
};

consultRouter.get("/", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  res.json({ messages: project.consult?.messages ?? [] });
});

consultRouter.post("/", async (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    return res.status(400).json({ error: "質問を入力してください。" });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `質問が長すぎます（上限${MAX_QUESTION_LENGTH}文字）。` });
  }

  if (inFlight.has(id)) {
    return res.status(409).json({ error: "このプロジェクトは前の相談を処理中です。しばらくお待ちください。" });
  }
  inFlight.add(id);

  try {
    const project = readProject(id);
    const history = project.consult?.messages ?? [];

    const userMessage = { id: randomUUID(), role: "user", text: question, createdAt: new Date().toISOString() };

    let answerMessage;
    try {
      const answerText = await runConsultation(project, history, question);
      answerMessage = {
        id: randomUUID(),
        role: "assistant",
        text: answerText,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      const kind = err instanceof ConsultError ? err.kind : "failed";
      const message = ERROR_MESSAGES[kind] ?? ERROR_MESSAGES.failed;
      // 失敗した相談も履歴に残す（利用者が何を聞いて失敗したか追えるようにする）。会話の中身は書き換えない。
      answerMessage = {
        id: randomUUID(),
        role: "error",
        text: message,
        createdAt: new Date().toISOString(),
      };
      const messages = [...history, userMessage, answerMessage].slice(-MAX_STORED_MESSAGES);
      project.consult = { messages };
      writeProject(project);
      return res.status(502).json({ error: message, messages });
    }

    const messages = [...history, userMessage, answerMessage].slice(-MAX_STORED_MESSAGES);
    project.consult = { messages };
    writeProject(project);
    res.status(201).json({ messages });
  } finally {
    inFlight.delete(id);
  }
});
