// 「教材を作り直す」で生成した新しい教材と、現在の教材を比較するためのロジック。
// サーバーを呼ばず、クライアント側の文字列処理だけで完結する（本格的なHTML/CSSパーサーではなく、
// 正規表現による簡易な抽出にとどめている。目的は「どこが変わったか、何を確認すればよいか」を
// 大まかに示すことで、厳密なコード解析ではない）。
import type { MaterialChapter, MaterialStep } from "./types";

// ---- 手順どうしの対応づけ ----

// 先頭の「2. 」のような番号を取り除く（番号が変わっても、タイトルの中身で比較できるようにする）。
function normalizeTitle(s: string): string {
  return s.replace(/^\s*\d+[.．、\s]*/, "").trim();
}

// 日本語は単語の区切りがないため、文字2つの組（バイグラム）の集合でおおまかな類似度を測る。
function charBigrams(s: string): Set<string> {
  const chars = Array.from(s);
  const set = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1]);
  if (chars.length <= 1 && chars.length > 0) set.add(chars[0]);
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// 手順どうしの「似ている度合い」。タイトル・役割（goal）の文章の近さに、
// 手順番号が一致しているかの加点を少しだけ足す（番号はズレることがあるため主役にはしない）。
function stepSimilarity(a: MaterialStep, b: MaterialStep): number {
  const titleSim = jaccard(charBigrams(normalizeTitle(a.title)), charBigrams(normalizeTitle(b.title)));
  const goalSim = jaccard(charBigrams(a.goal), charBigrams(b.goal));
  const orderBonus = a.order === b.order ? 1 : 0;
  return titleSim * 0.5 + goalSim * 0.3 + orderBonus * 0.2;
}

// この値より類似度が低い組み合わせは「対応している」とは見なさない（無理に一致させない）。
const MATCH_THRESHOLD = 0.2;

export type StepMatch =
  | { kind: "matched"; oldStep: MaterialStep; newStep: MaterialStep; fileDiffs: FileBlockDiff[]; hasChange: boolean }
  | { kind: "unmatchedOld"; oldStep: MaterialStep }
  | { kind: "unmatchedNew"; newStep: MaterialStep };

function stepOrderKey(m: StepMatch): number {
  if (m.kind === "matched") return m.newStep.order;
  if (m.kind === "unmatchedNew") return m.newStep.order;
  // 対応先が見つからない旧手順は、元の番号の少し後ろに差し込んで表示する（目安の位置）。
  return m.oldStep.order + 0.5;
}

// 新旧の手順を、類似度が高い組み合わせから貪欲に対応づける（1つの手順は一度しか使わない）。
// しきい値に届かない組み合わせは対応づけず、「対応不明」として個別に扱う。
function matchSteps(oldSteps: MaterialStep[], newSteps: MaterialStep[]): StepMatch[] {
  const candidates: { oi: number; ni: number; score: number }[] = [];
  oldSteps.forEach((o, oi) => {
    newSteps.forEach((n, ni) => {
      candidates.push({ oi, ni, score: stepSimilarity(o, n) });
    });
  });
  candidates.sort((a, b) => b.score - a.score);

  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  const matched: { oi: number; ni: number }[] = [];
  for (const c of candidates) {
    if (usedOld.has(c.oi) || usedNew.has(c.ni)) continue;
    if (c.score < MATCH_THRESHOLD) continue;
    usedOld.add(c.oi);
    usedNew.add(c.ni);
    matched.push({ oi: c.oi, ni: c.ni });
  }

  const results: StepMatch[] = [];
  matched.forEach(({ oi, ni }) => {
    const oldStep = oldSteps[oi];
    const newStep = newSteps[ni];
    const fileDiffs = diffFileBlocks(oldStep, newStep);
    results.push({
      kind: "matched",
      oldStep,
      newStep,
      fileDiffs,
      hasChange: fileDiffs.some((f) => f.hasChange),
    });
  });
  oldSteps.forEach((o, oi) => {
    if (!usedOld.has(oi)) results.push({ kind: "unmatchedOld", oldStep: o });
  });
  newSteps.forEach((n, ni) => {
    if (!usedNew.has(ni)) results.push({ kind: "unmatchedNew", newStep: n });
  });

  results.sort((a, b) => stepOrderKey(a) - stepOrderKey(b));
  return results;
}

// ---- クラス名・タグ・セレクタの抽出 ----

function extractHtmlClassNames(code: string): Set<string> {
  const set = new Set<string>();
  const re = /class="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => set.add(c));
  }
  return set;
}

function extractTagNames(code: string): Set<string> {
  const set = new Set<string>();
  const re = /<([a-zA-Z][a-zA-Z0-9]*)[\s/>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    set.add(m[1].toLowerCase());
  }
  return set;
}

// style.cssのcopyCodeから「セレクタ {」のセレクタ部分だけを抜き出す（@media / @keyframesの
// 行自体も、ひとまず1つの「ルール」として扱う。厳密なCSSパーサーではない簡易抽出）。
function extractCssSelectors(code: string): Set<string> {
  const set = new Set<string>();
  const re = /(^|\})\s*([^{}\n]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const sel = m[2].trim().replace(/\s+/g, " ");
    if (sel) set.add(sel);
  }
  return set;
}

function setDiff(oldSet: Set<string>, newSet: Set<string>): { removed: string[]; added: string[] } {
  return {
    removed: [...oldSet].filter((x) => !newSet.has(x)).sort(),
    added: [...newSet].filter((x) => !oldSet.has(x)).sort(),
  };
}

export type NameDiff = {
  removed: string[];
  added: string[];
};

// 当初、削除が1つ・追加も1つだけの場合に「おそらくこの名前からこの名前への変更」という
// 推測を添える案を試したが、実際のデータ（例：style.cssの1手順目で * → .page、
// 無関係なクラス名どうしがたまたま1:1になった例）で、無関係な組み合わせを
// 「リネームの可能性」と誤って示してしまうことが確認できたため、推測はやめ、
// 旧・新のクラス名／セレクタを並べて見せるだけにしている（対応関係の判断は利用者にゆだねる）。
function toNameDiff(d: { removed: string[]; added: string[] }): NameDiff {
  return d;
}

export type FileBlockDiff = {
  file: string;
  // このファイルへの追加が、どちらかの手順にしか存在しない場合（ファイル自体が新規／廃止）
  existsInOld: boolean;
  existsInNew: boolean;
  insertLocationChanged: boolean;
  oldInsertLocation: string | null;
  newInsertLocation: string | null;
  classNames: NameDiff;
  cssSelectors: NameDiff;
  tagNames: { removed: string[]; added: string[] };
  hasChange: boolean;
};

function diffFileBlocks(oldStep: MaterialStep, newStep: MaterialStep): FileBlockDiff[] {
  const files = Array.from(new Set([...oldStep.fileBlocks.map((f) => f.file), ...newStep.fileBlocks.map((f) => f.file)]));
  return files.map((file) => {
    const oldFb = oldStep.fileBlocks.find((f) => f.file === file) ?? null;
    const newFb = newStep.fileBlocks.find((f) => f.file === file) ?? null;
    const oldCode = oldFb?.copyCode ?? "";
    const newCode = newFb?.copyCode ?? "";

    const classNames = toNameDiff(setDiff(extractHtmlClassNames(oldCode), extractHtmlClassNames(newCode)));
    const cssSelectors = toNameDiff(setDiff(extractCssSelectors(oldCode), extractCssSelectors(newCode)));
    const tagNames = setDiff(extractTagNames(oldCode), extractTagNames(newCode));
    const insertLocationChanged = (oldFb?.insertLocation ?? null) !== (newFb?.insertLocation ?? null);

    const hasChange =
      !oldFb ||
      !newFb ||
      classNames.removed.length > 0 ||
      classNames.added.length > 0 ||
      cssSelectors.removed.length > 0 ||
      cssSelectors.added.length > 0 ||
      tagNames.removed.length > 0 ||
      tagNames.added.length > 0 ||
      insertLocationChanged;

    return {
      file,
      existsInOld: Boolean(oldFb),
      existsInNew: Boolean(newFb),
      insertLocationChanged,
      oldInsertLocation: oldFb?.insertLocation ?? null,
      newInsertLocation: newFb?.insertLocation ?? null,
      classNames,
      cssSelectors,
      tagNames,
      hasChange,
    };
  });
}

// ---- 教材全体の骨格（section分割・ページの囲み方など）の比較 ----

export type ChapterStructureDiff = {
  oldStepCount: number;
  newStepCount: number;
  oldSectionCount: number;
  newSectionCount: number;
  oldHasPageWrapper: boolean;
  newHasPageWrapper: boolean;
  hasChange: boolean;
};

function countTagOccurrences(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
}

function hasPageWrapperClass(html: string): boolean {
  return /class="[^"]*\bpage\b[^"]*"/.test(html);
}

function diffChapterStructure(oldChapter: MaterialChapter, newChapter: MaterialChapter): ChapterStructureDiff {
  // 最後の手順のpreviewHtmlは「その教材を最後まで進めた状態の、ページ全体の累積コード」なので、
  // 全体の骨格（sectionの数・ページを囲むdivの有無）を見るのに使える。
  const oldHtml = oldChapter.steps[oldChapter.steps.length - 1]?.previewHtml ?? "";
  const newHtml = newChapter.steps[newChapter.steps.length - 1]?.previewHtml ?? "";

  const oldSectionCount = countTagOccurrences(oldHtml, "section");
  const newSectionCount = countTagOccurrences(newHtml, "section");
  const oldHasPageWrapper = hasPageWrapperClass(oldHtml);
  const newHasPageWrapper = hasPageWrapperClass(newHtml);

  return {
    oldStepCount: oldChapter.steps.length,
    newStepCount: newChapter.steps.length,
    oldSectionCount,
    newSectionCount,
    oldHasPageWrapper,
    newHasPageWrapper,
    hasChange:
      oldChapter.steps.length !== newChapter.steps.length ||
      oldSectionCount !== newSectionCount ||
      oldHasPageWrapper !== newHasPageWrapper,
  };
}

export type MaterialDiffReport = {
  structure: ChapterStructureDiff;
  steps: StepMatch[];
};

export function buildMaterialDiffReport(oldChapter: MaterialChapter, newChapter: MaterialChapter): MaterialDiffReport {
  return {
    structure: diffChapterStructure(oldChapter, newChapter),
    steps: matchSteps(oldChapter.steps, newChapter.steps),
  };
}
