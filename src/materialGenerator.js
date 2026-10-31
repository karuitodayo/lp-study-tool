import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { projectImagesDir } from "./store.js";
import { projectWireframeCandidatesDir } from "./routes/wireframeCandidates.js";
import { guessImageMime } from "./imageMime.js";
import { runClaudeCli, ClaudeCliError, REPO_ROOT } from "./claudeCliRunner.js";

const TIMEOUT_MS = 1_800_000; // 30分。15分でもタイムアウトする実測があったため余裕を持たせる（6手順の詳細な指定＋既存要素の調整手順は、通常の生成より時間がかかる）。

export const MaterialGenError = ClaudeCliError;

let rulesCache;
function loadTextbookRules() {
  if (rulesCache !== undefined) return rulesCache;
  try {
    rulesCache = fs.readFileSync(path.join(REPO_ROOT, "LP-TEXTBOOK-RULES.md"), "utf-8");
  } catch {
    rulesCache = "";
  }
  return rulesCache;
}

const SYSTEM_PROMPT = `あなたは「LP制作教科書」ツールの教材作成アシスタントです。登録済みの完成イメージ画像・確定済みの画像分析・設計・ワイヤーフレームをもとに、利用者がHTML/CSSを自分の手で書き進めるための「プロジェクト専用教材」を、指定のJSON形式だけで出力してください。

厳守事項：
- 出力は指定のJSONオブジェクト1つだけにしてください。前置き・後書き・Markdownのコードフェンス（\`\`\`）は一切付けないでください。
- セクションの分割・順番・見出し・本文・ボタンの有無は、画像分析そのものではなく、利用者が確認・編集した「②ワイヤーフレーム」の内容を優先してください（ワイヤーフレームが編集されていれば、その内容が利用者の最終的な意図です）。ワイヤーフレームが無い場合のみ画像分析・設計から組み立ててください。
- 教材はこのツールが利用者の代わりにコードを書くためのものではなく、利用者が自分で書き進めるための教材です。コードは「お手本」として示すものであり、実際のファイル操作は行いません（あなたはファイル編集・コマンド実行の権限を持っていません）。
- 画像から読み取れること（配置・配色・大まかな文字サイズ）は使ってよいですが、正確なpx数値・正確なフォント名・元のソースコードは分からないので、断定せず「推定」であることが分かる説明にしてください。
- 1つの手順につき、目に見える変更の目的を1つに絞ってください（例：「外枠を作る」「写真を横に並べる」など）。手順は、前の手順までの状態に、今回の分だけを追加・変更する形にしてください。
- 各手順のpreviewHtml・previewCssは、その手順まで進めた状態の「累積の」HTML・CSS全体にしてください（差分ではなく、毎回フルの内容）。fileBlocksのbeforeLinesは、その手順を適用する直前の累積コード（行の配列）、newLinesは今回追加・変更する行だけにしてください。copyCodeはnewLinesのtextを結合したもの（行番号・差分記号・説明文を含めない）にしてください。
- 登録済みの実装用素材（写真）がある場合、該当箇所のHTML内でその1行だけを "__PHOTO_SLOT__" という文字列にしてください（例: {"text": "__PHOTO_SLOT__", "mark": null}）。このツールが自動的に、登録済み素材があれば<img>タグに、なければ仮枠に置き換えます。該当するphotoSlotsにkey（素材名と一致させる）・label・suggestedFileNameを指定してください。差し込まれる<img>タグに特定のCSSクラス（例：width/heightを指定した専用クラス）を当てる想定で書いた場合は、そのクラス名をphotoSlotsのimgClassNameに指定してください。親要素の子セレクタ（例：.hero__image img { ... }）でスタイルを当てる設計にした場合はimgClassNameを省略してください（<img>自体にクラスは不要です）。
- structureDiagramは実際の画像ではなく、親要素・子要素・並び方を示す模式図です。boxes/arrows/notesの座標はすべて0〜1の割合で指定してください。
- diagramRectは、今回の手順が完成イメージ画像のどの範囲に当たるかを0〜1の割合（x,y,w,h）で指定してください。画像分析の各区画のboundingBoxを参考にしてください。
- 最初の手順は、HTMLの土台（<!DOCTYPE html>からの骨組み、styleシートへの<link>）とフォルダ構成の説明から始めてください。
- 完成イメージ画像と、採用済みの「別案のワイヤーフレーム画像」が両方添付されている場合、役割を混同しないでください：完成イメージ画像＝配色・雰囲気（色・文字の調子・写真の雰囲気）の参考、別案のワイヤーフレーム画像＝セクションの配置・構成（何がどの順でどう並ぶか）の基準です。配置・構成は別案の画像を優先し、配色・雰囲気は完成イメージ画像を優先してください。
- frontend-designスキルが利用可能な場合は、HTML/CSSのコード例を考える際にその考え方（配色・タイポグラフィ・余白を意図的に選ぶこと、ありがちな量産感のあるデザインを避けること）を、完成イメージ画像・ワイヤーフレームの内容に沿って活用してください。ただし完成イメージ画像の再現が最優先で、画像の内容と矛盾する独自の装飾を追加しないでください。
- レスポンシブ対応：スマホ幅を基準にしつつ、広い画面幅でも大きく崩れないよう、最低限のレスポンシブ対応（%や remのような相対単位、必要な場合は1つ程度の簡単なmedia query）を含め、F.調整と確認で「どこを変えると何が変わるか」を説明してください。
- セクション同士の余白（間隔）は、根拠のない一律の数値（なんとなく40pxにする、など）ではなく、画像分析・ワイヤーフレームの各区画のboundingBox（y, h）から実際の間隔の比率を読み取って決めてください。また、あるセクションとその次のセクションの間の余白は、前のセクションのpadding-bottom/margin-bottomか、次のセクションのpadding-top/margin-topの、どちらか一方だけで確保してください。両方に余白を足すと、意図した2倍の間隔が空いてしまいます（マージンの二重取り）。
- 波形などの背景装飾は、別途素材ファイルがある前提にせず、CSS（border-radius・gradient等）または教材コード内に直接書くインラインSVGで表現してください。装飾を追加する場合は、重なり順（CSSの記述順やz-index）・位置・大きさ・色をどこで調整できるかを、その手順のF.調整と確認（adjustPoints）で具体的に説明してください。装飾を親要素から意図的にはみ出させる設計（top/bottom/left/rightに負の値や100%を超える値を指定する等）にする場合は、はみ出す分を吸収できるだけの余白（padding）または最低限の高さ（min-height）を、その親要素に確保してください。親要素にoverflow: hiddenを指定する場合は、確保した余白の範囲内に装飾が収まることを確認し、装飾自身を誤って切り取らないようにしてください。親要素の縦の大きさの目安は、画像分析・ワイヤーフレームで記録された「装飾の区画」と「その前面に重なる要素（商品写真等）の区画」のboundingBoxの高さ（h）の差分を参考にしてください。`;

function describeAssets(assets) {
  if (!assets.length) return "（登録済みの実装用素材はありません）";
  return assets
    .map((a) => `- name: "${a.name}" / 用途: ${a.purpose || "未記入"} / suggestedFileName: "${a.suggestedFileName}"`)
    .join("\n");
}

function describeAnalysis(analysis) {
  if (!analysis?.confirmed) return "（確定済みの画像分析がありません）";
  const sections = (analysis.sections ?? [])
    .map(
      (s) => `${s.order}. 【${s.label}】役割:${s.roleHint} 配置パターン:${s.layout}
  範囲(boundingBox): x=${s.boundingBox.x}, y=${s.boundingBox.y}, w=${s.boundingBox.w}, h=${s.boundingBox.h}
  見えた文字: ${s.observedText.replace(/\n/g, " / ") || "なし"}
  気づいた点: ${s.notes}
  配色: ${s.colorNotes}
  文字: ${s.typographyNotes}
  余白: ${s.spacingNotes}
  HTML方針: ${s.htmlApproach}
  CSS方針: ${s.cssApproach}`
    )
    .join("\n");
  return `概要: ${analysis.imageDescription}
全体配色: ${analysis.colorPalette}
全体の文字傾向: ${analysis.typographySystem}
全体の余白傾向: ${analysis.spacingSystem}
全体のHTML/CSS方針: ${analysis.buildApproach}

区画一覧:
${sections}`;
}

function describeDesign(design) {
  if (!design?.confirmed || !design.summary) return "（確定済みの設計がありません）";
  const s = design.summary;
  return `誰の課題: ${s.whoProblem}
提案: ${s.proposal}
行動(CTA): ${s.action}`;
}

function describeSectionButton(s) {
  if (!s.hasButton) return "なし";
  if (s.ctaItems && s.ctaItems.length > 0) {
    return `複数あり（${s.ctaItems.join("／")}）`;
  }
  return `あり（${s.ctaText ?? ""}）`;
}

// CSSにアニメーション・トランジションらしき記述が含まれるかどうかの簡易判定。
// 構文解析まではせず、キーワードの有無だけで判定する（過検出があっても、
// 「演出として引き継ぐ候補」を見つける目的には十分なため）。
const ANIMATION_HINT_PATTERN = /@keyframes|animation-name|animation\s*:|animation-duration|transition\s*:/;

// 再生成前の教材から、演出（アニメーション）に関わるCSSをそのまま抜き出し、
// 新しい教材作成の依頼文に添える形に整える。数値（秒数・px数など）を文章で言い換えず、
// 元のCSSを逐語的に渡すことで、再生成後も同じ数値が維持されやすくする。
function describeCarriedAnimations(previousChapter) {
  if (!previousChapter) return null;
  const notes = previousChapter.steps
    .map((step) => {
      const cssBlock = step.fileBlocks.find((fb) => fb.file === "style.css");
      if (!cssBlock?.copyCode || !ANIMATION_HINT_PATTERN.test(cssBlock.copyCode)) return null;
      return `- 「${step.title}」の手順に追加されていたCSS:\n${cssBlock.copyCode}`;
    })
    .filter(Boolean);
  if (notes.length === 0) return null;
  return `【以前の教材にあった演出（アニメーション）の引き継ぎ】
以前の教材には、以下の演出（アニメーション）が指定されていました。利用者がこの内容を引き継ぐことを希望しています。
手順の構成やクラス名が変わってもかまいませんが、意味的に対応する要素（同じ役割の写真・見出し等）に対して、
速度・移動量（transformの値）・開始タイミングの数値はできる限り元のまま維持し、同等の演出を加えてください。
${notes.join("\n\n")}`;
}

function describeWireframe(wireframe) {
  const sections = wireframe?.sections ?? [];
  if (sections.length === 0) return "（保存済みのワイヤーフレームがありません）";
  return sections
    .map(
      (s, i) => `${i + 1}. 【${s.title}】配置パターン:${s.layout} ボタン:${describeSectionButton(s)}
  役割: ${s.role}
  この位置に置く理由: ${s.reason}
  本文: ${s.bodyText}`
    )
    .join("\n");
}

const SCHEMA_GUIDE = `出力するJSONの形式（これ以外のキーは含めないでください）：
{
  "steps": [
    {
      "id": "短い英数字スラッグ（例: setup, header-box）",
      "order": 1,
      "title": "1. 手順名（短く）",
      "goal": "この手順で何を作るか・完成するとどうなるかの説明文",
      "explanation": "親要素・子要素・並び方・余白の関係と、なぜこう書くのかの説明文（日本語、専門用語はかみ砕く）",
      "diagramRect": { "x":0, "y":0, "w":1, "h":0.1 },
      "diagramLabel": "完成イメージ画像の対象部分を示す短いラベル",
      "structureDiagram": {
        "boxes": [ { "id":"a", "label":"①親要素", "x":0.1,"y":0.1,"w":0.8,"h":0.3, "emphasis": true } ],
        "arrows": [ { "from": {"x":0.2,"y":0.2}, "to": {"x":0.6,"y":0.2}, "label":"並ぶ方向" } ],
        "notes": [ { "x":0.5, "y":0.05, "text":"補足テキスト" } ]
      },
      "fileBlocks": [
        {
          "file": "index.html または style.css",
          "operationType": "追加",
          "insertLocation": "どのファイルの、どこに追記・置換するかの具体的な説明",
          "beforeLines": ["この手順を適用する直前の累積コード（1行ごとの配列）"],
          "newLines": [ { "text": "追加するコードの1行", "mark": "この行の中で注目してほしい値（なければnull）" } ],
          "copyCode": "newLinesのtextを改行で結合した文字列"
        }
      ],
      "photoSlots": [ { "key": "資産のnameと一致させる", "label": "用途の説明", "suggestedFileName": "ファイル名.png", "imgClassName": "imgタグに付けるCSSクラス名（親の子セレクタで対応する場合は省略可）" } ],
      "adjustPoints": [ { "label": "項目名", "prop": "CSSプロパティ名", "value": "現在の値", "note": "変えるとどうなるかの説明" } ],
      "checkFirst": "表示が思った通りにならないときに最初に確認する場所",
      "previewHtml": "この手順まで進めた状態の、HTML全体（<section>以下。<!DOCTYPE>等は不要）",
      "previewCss": "この手順まで進めた状態の、CSS全体"
    }
  ]
}`;

export async function generateMaterial({ project, scopeNote, carryOverAnimations = false }) {
  const finish = project.images?.finish;
  if (!finish) {
    throw new MaterialGenError("failed", "完成イメージ画像が登録されていません。");
  }

  // 「以前の演出を引き継ぐ」が選ばれた場合のみ、既存教材（上書き前のchapter）から演出のCSSを抜き出して添える。
  // 選ばれていない場合・既存教材が無い場合・演出が見つからない場合は従来どおり何も追加しない
  // （＝既存の教材生成の挙動に影響を与えない）。
  const carriedAnimationNote = carryOverAnimations ? describeCarriedAnimations(project.material?.chapter ?? null) : null;

  const content = [
    {
      type: "text",
      text: `【教材作成ルールの要点（LP-TEXTBOOK-RULES.mdより）】
${loadTextbookRules() || "（ルールファイルを読み込めませんでした）"}

【プロジェクト情報】
プロジェクト名: ${project.name}
制作条件メモ: ${project.brief?.notes || "（なし）"}
①設計:
${describeDesign(project.design)}

画像分析（確定分）:
${describeAnalysis(project.analysis)}

②ワイヤーフレーム（利用者が確認・編集した配置案。順番・役割・理由・見出し・本文はこちらを優先してください）:
${describeWireframe(project.wireframe)}

登録済みの実装用素材:
${describeAssets(project.assets ?? [])}

${carriedAnimationNote ? carriedAnimationNote + "\n" : ""}
【今回作る範囲】
${scopeNote}

${SCHEMA_GUIDE}

添付の完成イメージ画像を実際に見て、上記の範囲について、ファイルの準備（HTMLの土台作り）から完成まで、上から順に一手順ずつ進められる教材のJSONを作成してください。`,
    },
  ];

  const imgPath = path.join(projectImagesDir(project.id), finish.filename);
  try {
    const buf = fs.readFileSync(imgPath);
    content.push({
      type: "image",
      source: { type: "base64", media_type: guessImageMime(finish.filename), data: buf.toString("base64") },
    });
    content.push({ type: "text", text: "（上の画像が完成イメージ画像です＝配色・雰囲気の参考。）" });
  } catch {
    throw new MaterialGenError("failed", "完成イメージ画像を読み込めませんでした。");
  }

  const selectedCandidate = (project.wireframe?.candidates ?? []).find((c) => c.selected);
  if (selectedCandidate) {
    try {
      const candidatePath = path.join(projectWireframeCandidatesDir(project.id), selectedCandidate.filename);
      const buf = fs.readFileSync(candidatePath);
      content.push({
        type: "image",
        source: { type: "base64", media_type: guessImageMime(selectedCandidate.filename), data: buf.toString("base64") },
      });
      content.push({
        type: "text",
        text: `（上の画像が採用済みの別案のワイヤーフレーム画像です＝セクションの配置・構成の基準。補足メモ: ${
          selectedCandidate.note || "（なし）"
        }）`,
      });
    } catch {
      // 読み込めなくても、完成イメージ画像だけで生成を続ける
    }
  }

  const text = await runClaudeCli({
    message: { type: "user", message: { role: "user", content } },
    systemPrompt: SYSTEM_PROMPT,
    tools: "Skill",
    timeoutMs: TIMEOUT_MS,
  });

  const raw = parseJsonLoose(text);
  return normalizeChapter(raw, project, finish);
}

const REVISE_SYSTEM_PROMPT = `あなたは「LP制作教科書」ツールの教材作成アシスタントです。既存の教材の、指定された1手順だけを、利用者の修正依頼に沿って改訂してください。

厳守事項：
- 出力は改訂後の手順1つ分のJSONオブジェクトだけにしてください（前置き・後書き・Markdownのコードフェンスは付けない）。キー構成は元の手順と同じにしてください（id, order, title, goal, explanation, diagramRect, diagramLabel, structureDiagram, fileBlocks, photoSlots, adjustPoints, checkFirst, previewHtml, previewCss）。
- idとorderは元の値のまま変えないでください。
- fileBlocksのbeforeLinesは「この手順の直前までの累積コード」を表すため、指定された「この手順の直前までの累積コード」と一致させてください（前の手順の内容を変更しないでください）。
- previewHtml・previewCssは、この手順までの累積の内容にしてください（差分ではなくフル）。
- 利用者の依頼にないことまで、ついでに書き換えないでください。依頼内容だけを反映してください。
- 依頼が曖昧、または画像から判断できない内容を含む場合は、previewHtml/previewCss等は変更せず、goalやexplanationの説明文の中で「〜についてはご指定ください」のように、わからないことをわからないと明示してください。
- 依頼内容にアニメーション・動きの追加が含まれる場合は、CSSのtransition／animation＋@keyframesで実装し、adjustPointsに「速度（transition-duration／animation-duration）」「移動量（transformの値、例：translateYの px数）」「開始タイミング（transition-delay／animation-delay、または何をきっかけに始まるか。例：ページ読み込み時／ホバー時）」の3点を、それぞれどこを変えると何が変わるかが分かる形で含めてください。`;

export async function reviseMaterialStep({ project, chapter, stepIndex, instruction }) {
  const step = chapter.steps[stepIndex];
  if (!step) {
    throw new MaterialGenError("failed", "対象の手順が見つかりません。");
  }
  const prevStep = chapter.steps[stepIndex - 1];
  const beforeState = prevStep
    ? `前の手順（${prevStep.title}）までの累積previewHtml:\n${prevStep.previewHtml}\n\n累積previewCss:\n${prevStep.previewCss}`
    : "（この手順が最初の手順です。累積コードはまだありません。）";

  const content = [
    {
      type: "text",
      text: `【改訂対象の手順（現在の内容）】
${JSON.stringify(step, null, 2)}

【この手順の直前までの累積状態】
${beforeState}

【利用者からの修正依頼】
${instruction}

${SCHEMA_GUIDE.replace('"steps": [', "").replace(/\]\s*}\s*$/, "")}
上記は手順1件分のJSON形式の参考です。改訂後の手順1件分のJSONオブジェクトだけを出力してください。`,
    },
  ];

  const finish = project.images?.finish;
  if (finish) {
    try {
      const buf = fs.readFileSync(path.join(projectImagesDir(project.id), finish.filename));
      content.push({
        type: "image",
        source: { type: "base64", media_type: guessImageMime(finish.filename), data: buf.toString("base64") },
      });
    } catch {
      // 画像が読めなくても、テキスト情報だけで改訂を試みる
    }
  }

  const text = await runClaudeCli({
    message: { type: "user", message: { role: "user", content } },
    systemPrompt: REVISE_SYSTEM_PROMPT,
    tools: "Skill",
    timeoutMs: TIMEOUT_MS,
  });

  const raw = parseJsonLoose(text);
  const normalized = normalizeStep(raw, stepIndex);
  return recomputeStepBeforeLines(normalized, chapter, stepIndex);
}

function normalizeStep(s, fallbackIndex) {
  return {
    id: typeof s.id === "string" && s.id ? s.id : `step-${fallbackIndex + 1}`,
    order: Number.isFinite(s.order) ? s.order : fallbackIndex + 1,
    title: typeof s.title === "string" ? s.title : `手順${fallbackIndex + 1}`,
    goal: typeof s.goal === "string" ? s.goal : "",
    explanation: typeof s.explanation === "string" ? s.explanation : "",
    diagramRect: normalizeRect(s.diagramRect),
    diagramLabel: typeof s.diagramLabel === "string" ? s.diagramLabel : "",
    diagramCaveat: typeof s.diagramCaveat === "string" ? s.diagramCaveat : undefined,
    structureDiagram: normalizeStructureDiagram(s.structureDiagram),
    fileBlocks: Array.isArray(s.fileBlocks) ? s.fileBlocks.map(normalizeFileBlock) : [],
    photoSlots: Array.isArray(s.photoSlots)
      ? s.photoSlots
          .filter((p) => p && typeof p.key === "string")
          .map((p) => ({
            key: p.key,
            label: typeof p.label === "string" ? p.label : p.key,
            suggestedFileName: typeof p.suggestedFileName === "string" ? p.suggestedFileName : `${p.key}.png`,
            ...(typeof p.imgClassName === "string" && p.imgClassName ? { imgClassName: p.imgClassName } : {}),
          }))
      : [],
    adjustPoints: Array.isArray(s.adjustPoints)
      ? s.adjustPoints
          .filter((a) => a && typeof a.prop === "string")
          .map((a) => ({
            label: typeof a.label === "string" ? a.label : a.prop,
            prop: a.prop,
            value: typeof a.value === "string" ? a.value : "",
            note: typeof a.note === "string" ? a.note : "",
          }))
      : [],
    checkFirst: typeof s.checkFirst === "string" ? s.checkFirst : "",
    previewHtml: typeof s.previewHtml === "string" ? s.previewHtml : "",
    previewCss: typeof s.previewCss === "string" ? s.previewCss : "",
  };
}

function parseJsonLoose(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // 下のthrowへ
      }
    }
    throw new MaterialGenError("invalid_response", "教材データをJSONとして読み取れませんでした。");
  }
}

function normalizeChapter(raw, project, finish) {
  const stepsRaw = Array.isArray(raw?.steps) ? raw.steps : [];
  if (stepsRaw.length === 0) {
    throw new MaterialGenError("invalid_response", "教材データに手順が含まれていませんでした。");
  }

  const steps = stepsRaw.map((s, i) => normalizeStep(s, i));
  steps.sort((a, b) => a.order - b.order);

  return {
    id: `material-${randomUUID()}`,
    title: `${project.name} の実装教材`,
    isSample: false,
    sampleImageUrl: finish.url,
    sampleImageNote: "これは登録済みの完成イメージ画像です。",
    noteBanner: "これはこのプロジェクト専用の教材です（Claude Codeが画像分析・設計をもとに作成）。内容を確認し、必要に応じて相談欄から修正を依頼してください。",
    noteBannerTone: "info",
    steps: recomputeBeforeLines(steps),
  };
}

// 手順1（ファイルの土台作り）のindex.html側newLinesから、<body>行と</body>以降（= 外枠）を取り出す。
// 取り出せない場合（想定外の書式のとき）はnullを返し、呼び出し側は補正をスキップする。
function extractHtmlShell(firstStep) {
  const htmlFb = firstStep?.fileBlocks?.find((fb) => fb.file === "index.html");
  if (!htmlFb) return null;
  const lines = htmlFb.newLines.map((l) => l.text);
  const bodyIdx = lines.findIndex((l) => /<body[\s>]/.test(l));
  const bodyCloseIdx = lines.findIndex((l) => /<\/body>/.test(l));
  if (bodyIdx === -1 || bodyCloseIdx === -1 || bodyCloseIdx <= bodyIdx) return null;
  return { head: lines.slice(0, bodyIdx + 1), tail: lines.slice(bodyCloseIdx) };
}

function indentedBodyLines(previewHtml) {
  if (!previewHtml) return [];
  return previewHtml.split("\n").map((l) => (l ? `  ${l}` : l));
}

// 「前の手順までの累積コード（prevLines）」と「この手順まで進めた累積コード（currLines）」を見比べて、
// 変わっていない前半（＝追加分より前の文脈）と後半（＝追加分より後ろの文脈）に切り分ける。
// 追加分がファイルの末尾でなく途中に入る手順（例：<div class="page">の中にヘッダーを足す）でも、
// 実際の挿入位置どおりに表示できるようにするための計算。
// （web/src/materialAssets.ts の splitByCommonEdges と同じロジック。
//   サーバー側は保存データ用、クライアント側は表示のたびの再計算用で、実行環境が分かれているため同じ計算を持つ）
function splitByCommonEdges(prevLines, currLines) {
  const max = Math.min(prevLines.length, currLines.length);
  let prefix = 0;
  while (prefix < max && prevLines[prefix] === currLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    prevLines[prevLines.length - 1 - suffix] === currLines[currLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { before: prevLines.slice(0, prefix), after: prevLines.slice(prevLines.length - suffix) };
}

// 各手順のfileBlocks.beforeLines／afterLinesを、AIが生成した値のままにせず、
// 「直前の手順までの累積コード全体」として機械的に計算し直す。
// AI生成のbeforeLinesは手順ごとに範囲がばらつき、insertLocationの説明（例:「</body>の前」）に
// 出てくるタグが文脈に含まれないことがあったため、previewHtml/previewCss（累積全体として定義されている値）
// を基準に、ファイルの先頭から一貫した文脈を表示できるようにする。
// 文脈は、追加分より前（beforeLines）と後ろ（afterLines）に分けて持つ。
// 1本にまとめると、画面側の表示が「文脈の全部→追加分」の順になり、本文の途中に入るはずの
// 追加分が`</html>`より後ろに見えてしまう。
function recomputeFileBlocksBeforeLines(fileBlocks, step, prevStep, shell) {
  return fileBlocks.map((fb) => {
    if (fb.file === "style.css") {
      // CSSは通常ファイルの末尾へ追記するので、ふつうはafterが空になる。
      const { before, after } = splitByCommonEdges(
        (prevStep.previewCss ?? "").split("\n"),
        (step.previewCss ?? "").split("\n")
      );
      return { ...fb, beforeLines: before, afterLines: after };
    }
    if (fb.file === "index.html" && shell) {
      // 外枠（<!DOCTYPE>〜<body>、</body></html>）は常に前後に固定し、
      // その内側は前後の累積コードの差分から挿入位置を割り出す。
      const { before, after } = splitByCommonEdges(
        indentedBodyLines(prevStep.previewHtml),
        indentedBodyLines(step.previewHtml)
      );
      return {
        ...fb,
        beforeLines: [...shell.head, ...before],
        afterLines: [...after, ...shell.tail],
      };
    }
    return fb;
  });
}

export function recomputeBeforeLines(steps) {
  if (steps.length === 0) return steps;
  const shell = extractHtmlShell(steps[0]);
  return steps.map((step, i) => {
    if (i === 0) return step; // 新規作成手順はbeforeLinesが空のままでよい
    const prevStep = steps[i - 1];
    return { ...step, fileBlocks: recomputeFileBlocksBeforeLines(step.fileBlocks, step, prevStep, shell) };
  });
}

// 改訂（相談で修正）後の1手順だけに同じ補正をかける。stepIndexの前後関係はchapter（改訂前の全体）から取る。
function recomputeStepBeforeLines(step, chapter, stepIndex) {
  if (stepIndex === 0) return step;
  const shell = extractHtmlShell(chapter.steps[0]);
  const prevStep = chapter.steps[stepIndex - 1];
  return { ...step, fileBlocks: recomputeFileBlocksBeforeLines(step.fileBlocks, step, prevStep, shell) };
}

function normalizeRect(r) {
  if (!r) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: clamp01(r.x), y: clamp01(r.y), w: clamp01(r.w), h: clamp01(r.h) };
}

function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function normalizeStructureDiagram(d) {
  if (!d || typeof d !== "object") return { boxes: [] };
  return {
    boxes: Array.isArray(d.boxes)
      ? d.boxes.map((b, i) => ({
          id: typeof b.id === "string" ? b.id : `box-${i}`,
          label: typeof b.label === "string" ? b.label : "",
          x: clamp01(b.x),
          y: clamp01(b.y),
          w: clamp01(b.w),
          h: clamp01(b.h),
          ...(b.emphasis ? { emphasis: true } : {}),
        }))
      : [],
    ...(Array.isArray(d.arrows) && d.arrows.length
      ? {
          arrows: d.arrows.map((a) => ({
            from: { x: clamp01(a.from?.x), y: clamp01(a.from?.y) },
            to: { x: clamp01(a.to?.x), y: clamp01(a.to?.y) },
            ...(typeof a.label === "string" ? { label: a.label } : {}),
          })),
        }
      : {}),
    ...(Array.isArray(d.notes) && d.notes.length
      ? {
          notes: d.notes.map((n) => ({
            x: clamp01(n.x),
            y: clamp01(n.y),
            text: typeof n.text === "string" ? n.text : "",
          })),
        }
      : {}),
  };
}

const OPERATION_TYPES = new Set(["追加", "置換", "削除"]);

function normalizeFileBlock(fb) {
  return {
    file: typeof fb?.file === "string" ? fb.file : "index.html",
    operationType: OPERATION_TYPES.has(fb?.operationType) ? fb.operationType : "追加",
    insertLocation: typeof fb?.insertLocation === "string" ? fb.insertLocation : "",
    beforeLines: Array.isArray(fb?.beforeLines) ? fb.beforeLines.map(String) : [],
    newLines: Array.isArray(fb?.newLines)
      ? fb.newLines.map((l) => ({ text: typeof l.text === "string" ? l.text : "", mark: typeof l.mark === "string" ? l.mark : null }))
      : [],
    copyCode: typeof fb?.copyCode === "string" ? fb.copyCode : "",
  };
}
