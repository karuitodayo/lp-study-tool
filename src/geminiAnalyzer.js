import { randomUUID } from "node:crypto";

const DEFAULT_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 180_000; // 複数セクションの構造化出力は実画像だと1分を超えることがあるため余裕を持たせる

const KNOWN_LAYOUTS = ["center", "image-left", "image-right", "grid", "list", "nav"];

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

// 利用上限・キー未設定・通信失敗・応答不正を区別するためのエラー種別。
export class GeminiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "no_key" | "rate_limit" | "network" | "invalid_response" | "failed"
  }
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    imageDescription: { type: "STRING" },
    excludedNote: { type: "STRING" },
    colorPalette: { type: "STRING" },
    typographySystem: { type: "STRING" },
    spacingSystem: { type: "STRING" },
    buildApproach: { type: "STRING" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          order: { type: "INTEGER" },
          label: { type: "STRING" },
          roleHint: { type: "STRING" },
          boundingBox: {
            type: "OBJECT",
            properties: {
              x: { type: "NUMBER" },
              y: { type: "NUMBER" },
              w: { type: "NUMBER" },
              h: { type: "NUMBER" },
            },
            required: ["x", "y", "w", "h"],
          },
          layout: { type: "STRING", enum: KNOWN_LAYOUTS },
          elements: {
            type: "OBJECT",
            properties: {
              headingCount: { type: "INTEGER" },
              hasImage: { type: "BOOLEAN" },
              hasButton: { type: "BOOLEAN" },
              columns: { type: "INTEGER", nullable: true },
            },
            required: ["headingCount", "hasImage", "hasButton"],
          },
          observedText: { type: "STRING" },
          notes: { type: "STRING" },
          colorNotes: { type: "STRING" },
          typographyNotes: { type: "STRING" },
          spacingNotes: { type: "STRING" },
          htmlApproach: { type: "STRING" },
          cssApproach: { type: "STRING" },
        },
        required: [
          "order",
          "label",
          "roleHint",
          "boundingBox",
          "layout",
          "elements",
          "observedText",
          "notes",
          "colorNotes",
          "typographyNotes",
          "spacingNotes",
          "htmlApproach",
          "cssApproach",
        ],
      },
    },
  },
  required: ["imageDescription", "colorPalette", "typographySystem", "spacingSystem", "buildApproach", "sections"],
};

const PROMPT = `あなたはLP（ランディングページ）の完成イメージ画像を分析するアシスタントです。
添付された画像を、上から下へ意味のあるセクション単位に分け、指定のJSON形式で出力してください。

厳守事項：
- 画像から実際に目で見て確認できることだけを書いてください。見えていないことを断定しないでください。
- 元のHTML/CSSのソースコードは分かりません。正確なフォント名・正確な余白の数値（px等）・正確な色コードは分からないので、断定せず「推定」「おおよそ」であることが分かる書き方にしてください（例：「本文は14px前後のゴシック体と推定」）。
- 静止画からは分からないレスポンシブ対応（スマホでの見え方）やアニメーション・ホバー時の動きについては、書かない、または「画像からは判断できない」と明示してください。推測で断定しないでください。
- layoutは次のいずれかから最も近いものを選んでください：center（中央寄せ）, image-left（画像が左・文字が右）, image-right（画像が右・文字が左）, grid（グリッド状に複数並ぶ）, list（縦並びのリスト）, nav（ヘッダー：ロゴ＋横並びメニュー）。
- boundingBoxは画像全体を幅1・高さ1とした0〜1の割合で、そのセクションが画像内で占める範囲を示してください（x,yは左上の位置、w,hは幅と高さ）。
- orderは画像の上から下への表示順（1始まり）にしてください。
- observedTextには、画像内に実際に見えている文字をそのまま書いてください（コピーとして転用するためではなく、参考記録用です）。
- htmlApproach・cssApproachには、このセクションをHTML/CSSで組み立てる際の構造案（使う要素・クラス名の案・レイアウト手法の方向性など）を書いてください。断定的な完成コードではなく方針として書いてください。
- imageDescription（画像全体の概要）、excludedNote（分析対象に含めなかった範囲があれば）、colorPalette（配色の傾向）、typographySystem（文字の大きさ・書体の傾向）、spacingSystem（余白の取り方の傾向）、buildApproach（全体のHTML/CSS組み立て方針）も記入してください。
- 指定されたJSON形式以外の文章（前置き・後書き・Markdown装飾）は出力しないでください。`;

export async function analyzeImageWithGemini({ imageBuffer, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError("no_key", "Gemini APIキーが設定されていません。");
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBuffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new GeminiError("network", "Gemini APIへの通信がタイムアウトしました。");
    }
    throw new GeminiError("network", "Gemini APIへの通信に失敗しました。ネットワーク接続をご確認ください。");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const reason = extractErrorReason(bodyText);

    if (res.status === 429 || reason === "RESOURCE_EXHAUSTED") {
      throw new GeminiError("rate_limit", "Gemini APIの利用上限（無料枠）に達しています。しばらくしてからお試しください。");
    }
    if (res.status === 401 || res.status === 403 || reason === "API_KEY_INVALID") {
      throw new GeminiError("no_key", "Gemini APIキーが無効です。server/.envのGEMINI_API_KEYをご確認ください。");
    }
    if (res.status === 404 || reason === "NOT_FOUND") {
      throw new GeminiError(
        "failed",
        `指定されたモデル（${model}）が見つかりません。server/.envのGEMINI_MODELをご確認ください。`
      );
    }
    throw new GeminiError("network", `Gemini APIがエラーを返しました（status ${res.status}）。`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new GeminiError("invalid_response", "Gemini APIの応答を読み取れませんでした。");
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new GeminiError("invalid_response", "Gemini APIの応答に分析結果が含まれていませんでした。");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("invalid_response", "Gemini APIの応答をJSONとして読み取れませんでした。");
  }

  return normalizeResult(parsed);
}

function normalizeResult(raw) {
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
  const sections = sectionsRaw.map((s, i) => ({
    id: randomUUID(),
    order: Number.isFinite(s.order) ? s.order : i + 1,
    label: typeof s.label === "string" ? s.label : `セクション${i + 1}`,
    roleHint: typeof s.roleHint === "string" ? s.roleHint : "",
    boundingBox: {
      x: clamp01(s.boundingBox?.x),
      y: clamp01(s.boundingBox?.y),
      w: clamp01(s.boundingBox?.w),
      h: clamp01(s.boundingBox?.h),
    },
    layout: KNOWN_LAYOUTS.includes(s.layout) ? s.layout : "center",
    elements: {
      headingCount: Number.isFinite(s.elements?.headingCount) ? s.elements.headingCount : 0,
      hasImage: Boolean(s.elements?.hasImage),
      hasButton: Boolean(s.elements?.hasButton),
      columns: Number.isFinite(s.elements?.columns) ? s.elements.columns : null,
    },
    observedText: typeof s.observedText === "string" ? s.observedText : "",
    notes: typeof s.notes === "string" ? s.notes : "",
    colorNotes: typeof s.colorNotes === "string" ? s.colorNotes : "",
    typographyNotes: typeof s.typographyNotes === "string" ? s.typographyNotes : "",
    spacingNotes: typeof s.spacingNotes === "string" ? s.spacingNotes : "",
    htmlApproach: typeof s.htmlApproach === "string" ? s.htmlApproach : "",
    cssApproach: typeof s.cssApproach === "string" ? s.cssApproach : "",
  }));
  sections.sort((a, b) => a.order - b.order);

  return {
    imageDescription: typeof raw.imageDescription === "string" ? raw.imageDescription : "",
    excludedNote: typeof raw.excludedNote === "string" ? raw.excludedNote : "",
    colorPalette: typeof raw.colorPalette === "string" ? raw.colorPalette : "",
    typographySystem: typeof raw.typographySystem === "string" ? raw.typographySystem : "",
    spacingSystem: typeof raw.spacingSystem === "string" ? raw.spacingSystem : "",
    buildApproach: typeof raw.buildApproach === "string" ? raw.buildApproach : "",
    sections,
  };
}

// Gemini APIのエラー応答（{error:{status, details:[{reason}]}}）から種別を読み取る。
// 形式が変わっている・パースできない場合はnullを返し、呼び出し側はHTTPステータスのみで判定する。
function extractErrorReason(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const detailReason = parsed?.error?.details?.find((d) => d.reason)?.reason;
    return detailReason ?? parsed?.error?.status ?? null;
  } catch {
    return null;
  }
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
