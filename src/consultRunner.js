import fs from "node:fs";
import path from "node:path";
import { projectImagesDir } from "./store.js";
import { guessImageMime } from "./imageMime.js";
import { runClaudeCli, ClaudeCliError, REPO_ROOT } from "./claudeCliRunner.js";

const TIMEOUT_MS = 120_000; // 2分。無応答のまま張り付かせない。

export const ConsultError = ClaudeCliError;

// 相談アシスタントとしての役割・できないことを固定する（教材作成ルールの考え方に合わせる）。
const SYSTEM_PROMPT = `あなたは「LP制作教科書」ツール内の相談欄アシスタントです。
このプロジェクトのLP制作に関する相談にのみ答えてください。他のプロジェクトや、このツール自体の開発作業の話題には答えないでください。

厳守事項：
- ファイルの編集・作成・削除、コマンドの実行は一切できません（ツールを持っていません）。コードやデータを書き換えたという体の回答をしないでください。
- 事実・数値・効果・実績・口コミを創作しないでください。わからないことは「わからない」「未確認」と明示してください。
- 添付画像がある場合のみ、実際にその画像を見て回答してください。画像が添付されていない質問については、画像を見たかのような回答をしないでください。
- 完成イメージ画像・利用者の指定・確定済みの設計内容を優先してください。それと異なる案を出す場合は「提案」であることを明示してください。
- 設定の変更や教材データの更新は今回の相談では行いません（提案のみ）。
- 日本語で、具体的にどのファイル・どの部分の話かが分かるように答えてください。専門用語は分かりやすく説明してください。`;

let rulesCache;
function loadTextbookRules() {
  if (rulesCache !== undefined) return rulesCache;
  try {
    const p = path.join(REPO_ROOT, "LP-TEXTBOOK-RULES.md");
    rulesCache = fs.readFileSync(p, "utf-8");
  } catch {
    rulesCache = "";
  }
  return rulesCache;
}

function summarizeAnalysis(analysis) {
  if (!analysis || !analysis.confirmed) return "（未確定、または未実施）";
  const sectionList = (analysis.sections ?? [])
    .map((s) => `${s.order}.${s.label}（${s.layout}・${s.roleHint || "役割未記載"}）`)
    .join(" → ");
  const parts = [
    analysis.imageDescription && `概要: ${analysis.imageDescription}`,
    analysis.colorPalette && `配色: ${analysis.colorPalette}`,
    analysis.typographySystem && `文字: ${analysis.typographySystem}`,
    analysis.spacingSystem && `余白: ${analysis.spacingSystem}`,
    analysis.buildApproach && `実装方針: ${analysis.buildApproach}`,
    `区画（${analysis.sections?.length ?? 0}件）: ${sectionList || "なし"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "（確定済みだが内容が空）";
}

function summarizeWireframe(wireframe) {
  if (!wireframe || !wireframe.generatedAt) return "（未生成）";
  const sections = (wireframe.sections ?? [])
    .map((s, i) => `${i + 1}.${s.title || s.type}(${s.layout})`)
    .join(" → ");
  return `生成方法: ${wireframe.basedOn ?? "不明"} / 構成: ${sections || "なし"}`;
}

function summarizeDesign(design) {
  if (!design) return "（未入力）";
  if (!design.confirmed || !design.summary) return "（未確定）";
  const s = design.summary;
  return `誰の課題: ${s.whoProblem} / 提案: ${s.proposal} / 行動: ${s.action}`;
}

function summarizeMaterial(material) {
  if (!material || !material.chapter) return "（未作成）";
  const steps = material.chapter.steps
    .map((s) => `${s.order}.${s.title}`)
    .join(" → ");
  return `手順一覧: ${steps || "なし"}`;
}

function buildContextText(project, history, question) {
  const rules = loadTextbookRules();
  const historyText = history.length
    ? history
        .slice(-10)
        .map((m) => `${m.role === "user" ? "利用者" : "アシスタント"}: ${m.text}`)
        .join("\n")
    : "（このプロジェクトでの相談はまだありません）";

  return `【教材作成ルールの要点（LP-TEXTBOOK-RULES.mdより）】
${rules ? rules : "（ルールファイルを読み込めませんでした）"}

【プロジェクト情報】
プロジェクト名: ${project.name}
①設計: ${summarizeDesign(project.design)}
画像分析（確定分）: ${summarizeAnalysis(project.analysis)}
②ワイヤーフレーム: ${summarizeWireframe(project.wireframe)}
④実装教材: ${summarizeMaterial(project.material)}
完成イメージ画像: ${project.images?.finish ? "登録あり（添付画像を参照）" : "未登録"}

【このプロジェクトの直近の相談履歴】
${historyText}

【今回の質問】
${question}`;
}

function buildUserMessage(project, history, question) {
  const content = [{ type: "text", text: buildContextText(project, history, question) }];

  const finish = project.images?.finish;
  if (finish) {
    const imgPath = path.join(projectImagesDir(project.id), finish.filename);
    try {
      const buf = fs.readFileSync(imgPath);
      const mediaType = guessImageMime(finish.filename);
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
      });
      content.push({
        type: "text",
        text: "（上の画像が、このプロジェクトの完成イメージ画像です。実際に見て回答してください。）",
      });
    } catch {
      content.push({
        type: "text",
        text: "（完成イメージ画像の読み込みに失敗したため、添付していません。画像の内容については回答しないでください。）",
      });
    }
  } else {
    content.push({
      type: "text",
      text: "（このプロジェクトには完成イメージ画像がまだ登録されていません。画像の内容については回答しないでください。）",
    });
  }

  return {
    type: "user",
    message: { role: "user", content },
  };
}

export function runConsultation(project, history, question) {
  return runClaudeCli({
    message: buildUserMessage(project, history, question),
    systemPrompt: SYSTEM_PROMPT,
    tools: "Skill",
    timeoutMs: TIMEOUT_MS,
  }).then((text) => text || "（応答が空でした）");
}
