import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  listProjects,
  readProject,
  writeProject,
  deleteProject,
  projectExists,
  newProject,
  projectImagesDir,
  writeMaterialBackup,
} from "../store.js";
import { generateDesignSummary } from "../designGenerator.js";
import { generateWireframeSections, generateWireframeFromAnalysis } from "../wireframeGenerator.js";
import { analyzeImageWithGemini, isGeminiConfigured, getGeminiModel, GeminiError } from "../geminiAnalyzer.js";
import { guessImageMime } from "../imageMime.js";
import { generateMaterial, reviseMaterialStep, recomputeBeforeLines, MaterialGenError } from "../materialGenerator.js";

export const projectsRouter = Router();

// プロジェクトごとの画像分析の二重送信防止（同時に1件まで）。サーバー再起動で自動的にクリアされる。
const analysisInFlight = new Set();
// プロジェクトごとの教材生成の二重送信防止（同時に1件まで）。
const materialInFlight = new Set();

const GEMINI_ERROR_MESSAGES = {
  no_key: "Gemini APIキーが未設定、または無効です。server/.envのGEMINI_API_KEYをご確認ください。",
  rate_limit: "Gemini APIの利用上限（無料枠）に達しています。しばらくしてからお試しください。",
  network: "Gemini APIへの通信に失敗しました。ネットワーク接続をご確認ください。",
  invalid_response: "Gemini APIの応答を読み取れませんでした。もう一度お試しください。",
  failed: "画像分析に失敗しました。もう一度お試しください。",
};

const MATERIAL_ERROR_MESSAGES = {
  cli_not_found: "Claude Code CLIが見つかりません。インストールされているか、PATHの設定をご確認ください。",
  not_logged_in: "Claude Codeにログインしていません。ターミナルで `claude` を起動し、ログイン状態をご確認ください。",
  usage_limit: "利用上限に達しています。しばらく時間を置いてから、もう一度お試しください。",
  timeout: "応答がタイムアウトしました。もう一度お試しください。",
  invalid_response: "教材データを正しく読み取れませんでした。もう一度お試しください。",
  failed: "教材の生成に失敗しました。もう一度お試しください。",
};

// 新しいchapterを適用する際の共通処理：手順IDの並びが変わっていれば進捗（何手順目まで進んだか）を
// リセットし、文脈コード（beforeLines/afterLines）をpreviewHtml/previewCssから再計算し直す。
// PUT /:id/material（直接保存・1手順だけの改訂の適用）と、
// POST /:id/material/adopt-regeneration（再生成の採用）の両方から使う共通ロジック。
function applyNewChapter(project, newChapter) {
  const oldIds = (project.material.chapter?.steps ?? []).map((s) => s.id).join("|");
  const newIds = (newChapter?.steps ?? []).map((s) => s.id).join("|");
  if (oldIds !== newIds) {
    project.progress = { currentStepIndex: 0, maxReachedStepIndex: 0 };
  }
  return { ...newChapter, steps: recomputeBeforeLines(newChapter.steps ?? []) };
}

projectsRouter.get("/", (req, res) => {
  const projects = listProjects().map(({ id, name, createdAt, updatedAt, progress, material, images }) => ({
    id,
    name,
    createdAt,
    updatedAt,
    progress,
    materialStepCount: material?.chapter?.steps.length ?? null,
    finishImageUrl: images?.finish?.url ?? null,
  }));
  res.json({ projects });
});

projectsRouter.post("/", (req, res) => {
  const { name, brief } = req.body ?? {};
  const project = newProject({ id: randomUUID(), name, brief });
  writeProject(project);
  res.status(201).json({ project });
});

projectsRouter.get("/:id", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  res.json({ project: readProject(id) });
});

// 条件(brief)・進捗(progress)・設計(design)・ワイヤーフレーム(wireframe)の部分更新。画像はimages.jsで扱う。
projectsRouter.put("/:id", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const { name, brief, progress, design, wireframe } = req.body ?? {};

  if (typeof name === "string" && name.trim()) {
    project.name = name.trim();
  }
  if (brief && typeof brief === "object") {
    project.brief = { ...project.brief, ...brief };
  }
  if (progress && typeof progress === "object") {
    project.progress = { ...project.progress, ...progress };
  }
  if (design && typeof design === "object") {
    // 確定後に本文を直接編集した場合は確定を解除し、古い内容のまま確定済み表示にならないようにする
    const { summary, ...rest } = design;
    project.design = { ...project.design, ...rest };
    if (summary !== undefined) project.design.summary = summary;
  }
  if (wireframe && typeof wireframe === "object") {
    project.wireframe = { ...project.wireframe, ...wireframe };
  }

  writeProject(project);
  res.json({ project });
});

// 画像分析結果の保存・更新（Claude Codeが画像を直接読み取って分析した内容。自動のAI APIではない）。
// セクション一覧を丸ごと置き換える想定（確認・修正後の保存、新規保存の両方に使う）。
projectsRouter.put("/:id/analysis", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const body = req.body ?? {};

  if (body.sections && !Array.isArray(body.sections)) {
    return res.status(400).json({ error: "sectionsは配列で指定してください。" });
  }

  project.analysis = { ...project.analysis, ...body };
  writeProject(project);
  res.json({ project });
});

// Gemini APIの設定状況（キーの有無・使用モデル）。キーの値そのものは返さない。
projectsRouter.get("/_gemini/status", (req, res) => {
  res.json({ configured: isGeminiConfigured(), model: getGeminiModel() });
});

// 画像分析（Gemini API）：登録済みの完成イメージ画像をGemini APIへ送信して分析する。
// 結果はここでは保存せず、既存の分析データ形式に整えて返すだけ（保存は呼び出し側がPUT /:id/analysisで行う）。
// これにより、画面側で「上書きしてよいか」を確認してから保存する形を保てる。
projectsRouter.post("/:id/analysis/generate", async (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  if (!isGeminiConfigured()) {
    return res.status(400).json({ error: GEMINI_ERROR_MESSAGES.no_key, kind: "no_key" });
  }

  const project = readProject(id);
  const finish = project.images.finish;
  if (!finish) {
    return res.status(400).json({
      error: "完成イメージ画像が登録されていません。先に「画像登録」タブで登録してください。",
    });
  }

  if (analysisInFlight.has(id)) {
    return res.status(409).json({ error: "このプロジェクトは前の画像分析を処理中です。しばらくお待ちください。" });
  }
  analysisInFlight.add(id);

  try {
    const imgPath = path.join(projectImagesDir(id), finish.filename);
    let imageBuffer;
    try {
      imageBuffer = fs.readFileSync(imgPath);
    } catch {
      return res.status(500).json({ error: "完成イメージ画像を読み込めませんでした。" });
    }

    let result;
    try {
      result = await analyzeImageWithGemini({ imageBuffer, mimeType: guessImageMime(finish.filename) });
    } catch (err) {
      const kind = err instanceof GeminiError ? err.kind : "failed";
      const message = GEMINI_ERROR_MESSAGES[kind] ?? GEMINI_ERROR_MESSAGES.failed;
      const status = kind === "rate_limit" ? 429 : kind === "no_key" ? 400 : kind === "failed" ? 500 : 502;
      return res.status(status).json({ error: message, kind });
    }

    // 保存前の提案として返す（既存のanalysisはまだ書き換えない）。既存のPUT /:id/analysisの形式に合わせてある。
    res.json({
      proposal: {
        sourceImageId: finish.id,
        sourceKind: "finish",
        analyzedAt: new Date().toISOString(),
        analyzedBy: `gemini-api:${getGeminiModel()}`,
        confirmed: false,
        confirmedAt: null,
        ...result,
      },
    });
  } finally {
    analysisInFlight.delete(id);
  }
});

// 実装教材の保存・更新（Claude Codeが画像分析・ワイヤーフレーム・プロジェクト情報をもとに作成した、
// このプロジェクト専用の教材。自動生成ボタンではなく、依頼のたびにClaude Codeが内容を作成して保存する）。
projectsRouter.put("/:id/material", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const body = req.body ?? {};

  // 手順の構成（IDの並び）が変わった場合、以前の進捗（何手順目まで進んだか）を
  // 新しい手順に誤って引き継がないよう、進捗だけリセットする。学習済みの採用内容そのものは消さない。
  if (body.chapter !== undefined) {
    body.chapter = applyNewChapter(project, body.chapter);
  }

  project.material = { ...project.material, ...body };
  // 教材の保存（生成後の保存・改訂の適用いずれも）が実際に行われた時点で、
  // 「生成中」の表示はもう不要になる。/material/generateが失敗した場合はそちらのfinallyでクリアするため、
  // ここでは「保存まで到達した＝一連の処理が完了した」場合だけクリアすればよい。
  project.material.generationStatus = null;
  writeProject(project);
  res.json({ project });
});

// 実装教材の生成（Claude Code CLI経由）：登録済みの完成イメージ画像・確定済みの画像分析・設計をもとに、
// このプロジェクト専用の教材（手順一式）を作成する。ここでは保存せず提案として返すだけで、
// 既存の上書き確認（画面側）のあとPUT /:id/materialで保存する。
projectsRouter.post("/:id/material/generate", async (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);

  if (!project.images.finish) {
    return res.status(400).json({
      error: "完成イメージ画像が登録されていません。先に「画像登録」タブで登録してください。",
    });
  }
  if (!project.analysis.confirmed) {
    return res.status(400).json({
      error: "確定済みの画像分析がありません。先に「画像分析」タブで内容を確認し確定してください。",
    });
  }

  // メモリ上のロック（同一サーバープロセス内での二重送信を素早く防ぐ）に加えて、
  // ディスク上のgenerationStatus（ページ再読み込み・別タブ・サーバー再起動をまたいで残る）も確認する。
  // 片方だけだと、ページを再読み込みした直後にもう一度押せてしまう・逆に正しく終わっているのに
  // 「処理中」のまま見えてしまう、といった不整合が起きる。
  if (materialInFlight.has(id) || project.material.generationStatus?.state === "generating") {
    return res
      .status(409)
      .json({ error: "このプロジェクトは前の教材生成を処理中です。完了すると自動的に新しい教材が表示されます。" });
  }
  // 既に「比較・採用待ち」の提案が残っている場合、ここでさらに生成すると前の提案が
  // 行き場を失って上書きされてしまう（保存できるのは一度に1つの提案だけ）。
  // 先にその提案を採用または破棄してから、もう一度作り直してもらう。
  if (project.material.pendingRegeneration) {
    return res.status(409).json({
      error: "確認待ちの再生成があります。内容を確認し、採用するか破棄するかを選んでから、もう一度お試しください。",
    });
  }
  materialInFlight.add(id);

  const scopeNote =
    typeof req.body?.scopeNote === "string" && req.body.scopeNote.trim()
      ? req.body.scopeNote.trim()
      : "ヘッダーとファーストビュー（完成イメージ画像に写っている範囲全体）";
  const carryOverAnimations = req.body?.carryOverAnimations === true;

  // 「生成中」をディスクに保存する。ここから先（実際にPUT /:id/materialで保存されるまで、
  // または失敗するまで）は、ページ再読み込み後もこのプロジェクトを開けば「生成中」と分かる。
  project.material.generationStatus = { state: "generating", startedAt: new Date().toISOString(), scopeNote };
  writeProject(project);

  try {
    let chapter;
    try {
      chapter = await generateMaterial({ project, scopeNote, carryOverAnimations });
    } catch (err) {
      const kind = err instanceof MaterialGenError ? err.kind : "failed";
      const message = MATERIAL_ERROR_MESSAGES[kind] ?? MATERIAL_ERROR_MESSAGES.failed;
      const status = kind === "usage_limit" ? 429 : kind === "failed" ? 500 : 502;
      // 失敗時はここで「生成中」を解除する（この後PUT /:id/materialによる保存は行われないため）。
      // 生成開始時点から状態が変わっている可能性があるため、改めて読み直してから書き込む。
      const latest = readProject(id);
      latest.material.generationStatus = null;
      writeProject(latest);
      return res.status(status).json({ error: message, kind });
    }
    const proposal = {
      generatedAt: new Date().toISOString(),
      generatedBy: "claude-code",
      scopeNote,
      basedOnAnalysisConfirmedAt: project.analysis.confirmedAt,
      basedOnWireframeGeneratedAt: project.wireframe.generatedAt,
      chapter,
    };

    // 生成開始時点から状態が変わっている可能性があるため、改めて読み直してから書き込む
    // （「生成中」を解除する側と同じ考え方）。
    const latest = readProject(id);
    latest.material.generationStatus = null;
    if (latest.material.chapter) {
      // 既存の教材がある＝「作り直す」（再生成）。比較・採用/破棄の対象として、
      // 保存はせずサーバー側に「提案」として持たせる（ここではまだ現在の教材を書き換えない）。
      latest.material.pendingRegeneration = { proposal, createdAt: new Date().toISOString() };
    } else {
      // 教材がまだない＝初回の作成。比較する相手がないため、画面側がこれまで通り
      // そのままPUT /:id/materialで保存する（MaterialEmptyState.tsxの動作は変更していない）。
      latest.material.pendingRegeneration = null;
    }
    writeProject(latest);

    res.json({ proposal, project: latest });
  } finally {
    materialInFlight.delete(id);
  }
});

// 教材の再生成の提案を採用する：置き換えられる現在の教材をバックアップとして保存してから、
// 提案の内容で教材を上書きする。既存のPUT /:id/materialと同じ「手順ID変化時の進捗リセット・
// 文脈コードの再計算」を行う（applyNewChapterを共有）。
projectsRouter.post("/:id/material/adopt-regeneration", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const pending = project.material.pendingRegeneration;
  if (!pending) {
    return res.status(400).json({ error: "確認待ちの再生成がありません。" });
  }

  if (project.material.chapter) {
    writeMaterialBackup(id, {
      generatedAt: project.material.generatedAt,
      generatedBy: project.material.generatedBy,
      scopeNote: project.material.scopeNote,
      basedOnAnalysisConfirmedAt: project.material.basedOnAnalysisConfirmedAt,
      basedOnWireframeGeneratedAt: project.material.basedOnWireframeGeneratedAt,
      chapter: project.material.chapter,
      backedUpAt: new Date().toISOString(),
      reason: "regeneration-adopted",
    });
  }

  const { proposal } = pending;
  const newChapter = applyNewChapter(project, proposal.chapter);
  project.material = {
    ...project.material,
    generatedAt: proposal.generatedAt,
    generatedBy: proposal.generatedBy,
    scopeNote: proposal.scopeNote,
    basedOnAnalysisConfirmedAt: proposal.basedOnAnalysisConfirmedAt,
    basedOnWireframeGeneratedAt: proposal.basedOnWireframeGeneratedAt,
    chapter: newChapter,
    pendingRegeneration: null,
    generationStatus: null,
  };
  writeProject(project);
  res.json({ project });
});

// 教材の再生成の提案を破棄する：現在の教材には一切触れず、提案だけを消す。
projectsRouter.post("/:id/material/discard-regeneration", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  if (!project.material.pendingRegeneration) {
    return res.status(400).json({ error: "確認待ちの再生成がありません。" });
  }
  project.material.pendingRegeneration = null;
  writeProject(project);
  res.json({ project });
});

// 教材1手順の修正提案（Claude Code CLI経由）：相談しただけでは教材を書き換えず、改訂案を返すだけにする。
// 実際の反映は、画面側で「適用する」を押したときにPUT /:id/materialで行う。
projectsRouter.post("/:id/material/revise-step", async (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const chapter = project.material.chapter;
  if (!chapter) {
    return res.status(400).json({ error: "このプロジェクトにはまだ教材がありません。" });
  }
  const stepId = req.body?.stepId;
  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  if (!instruction) {
    return res.status(400).json({ error: "修正依頼の内容を入力してください。" });
  }
  const stepIndex = chapter.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) {
    return res.status(404).json({ error: "対象の手順が見つかりません。" });
  }

  if (materialInFlight.has(id)) {
    return res.status(409).json({ error: "このプロジェクトは前の教材処理を処理中です。しばらくお待ちください。" });
  }
  materialInFlight.add(id);

  try {
    let step;
    try {
      step = await reviseMaterialStep({ project, chapter, stepIndex, instruction });
    } catch (err) {
      const kind = err instanceof MaterialGenError ? err.kind : "failed";
      const message = MATERIAL_ERROR_MESSAGES[kind] ?? MATERIAL_ERROR_MESSAGES.failed;
      const status = kind === "usage_limit" ? 429 : kind === "failed" ? 500 : 502;
      return res.status(status).json({ error: message, kind });
    }
    res.json({ stepIndex, step });
  } finally {
    materialInFlight.delete(id);
  }
});

// ①設計：入力内容をもとに下書きを整理する（AI未接続。定型文への当てはめと不足項目チェックのみ）
projectsRouter.post("/:id/design/generate", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  project.design.summary = generateDesignSummary(project);
  writeProject(project);
  res.json({ project });
});

// ②ワイヤーフレーム：定番テンプレート、または画像分析結果(analysis)から生成する
projectsRouter.post("/:id/wireframe/generate", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const allowed = new Set(["brief", "finish_image", "analysis"]);
  const source = allowed.has(req.body?.source) ? req.body.source : "brief";
  const project = readProject(id);

  if (source === "finish_image" && !project.images.finish) {
    return res.status(400).json({
      error: "完成イメージ画像が登録されていません。先に「画像登録」タブで登録してください。",
    });
  }
  if (source === "analysis" && project.analysis.sections.length === 0) {
    return res.status(400).json({
      error: "画像分析の結果がまだありません。先に画像分析を保存してください。",
    });
  }

  if (source === "analysis") {
    project.wireframe = {
      generatedAt: new Date().toISOString(),
      isSample: false,
      basedOn: "analysis",
      sections: generateWireframeFromAnalysis(project),
    };
  } else {
    project.wireframe = {
      generatedAt: new Date().toISOString(),
      isSample: true,
      basedOn: source,
      sections: generateWireframeSections(project),
    };
  }
  writeProject(project);
  res.json({ project });
});

projectsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  deleteProject(id);
  res.status(204).end();
});
