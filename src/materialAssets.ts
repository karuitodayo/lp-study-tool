import type { CodeLine, MaterialChapter, MaterialStep, ProjectAsset } from "./types";

export const PHOTO_SLOT_MARKER = "__PHOTO_SLOT__";

// マーカー行は手順の中のインデント位置に合わせて字下げされていることがあるため、
// 前後の空白を許容して判定する（判定自体は空白を無視、置換後の行には元の字下げを引き継ぐ）。
const MARKER_PATTERN = /^(\s*)__PHOTO_SLOT__\s*$/;

function placeholderLines(label: string, suggestedFileName: string, imgClassName: string | undefined): CodeLine[] {
  // 仮枠はプレビュー用の見た目の目印なので、教材CSSのクラス（imgClassName）とは別に
  // 常にhero__photo-placeholderを使う（imgタグではなくdivのため、CSS側のimg用クラスとは衝突しない）。
  return [
    { text: '<div class="hero__photo-placeholder">', mark: null },
    { text: `  <span>写真素材（仮）：${label}（${suggestedFileName}）</span>`, mark: null },
    { text: "</div>", mark: null },
  ];
}

function realImageLines(asset: ProjectAsset, label: string, imgClassName: string | undefined): CodeLine[] {
  // クラスは、教材のCSSが実際に定義しているクラス（photoSlot.imgClassName）をそのまま使う。
  // 指定がない場合は、親要素の子セレクタ（例: .hero__image img）で既にスタイルが当たる設計を想定し、
  // クラスなしにする（存在しないクラス名を当てはめて見た目が崩れることを避ける）。
  const classAttr = imgClassName ? ` class="${imgClassName}"` : "";
  return [
    {
      text: `<img src="images/${asset.suggestedFileName}" alt="${asset.purpose || label}"${classAttr}>`,
      mark: `images/${asset.suggestedFileName}`,
    },
  ];
}

// プレビュー（隔離iframeのsrcDoc）専用。D.コード／コピー用はVS Code用の相対パス（images/...）のままにするが、
// それをそのままプレビューのsrcDocに使うと、相対パスがアプリの画面URL基準で解決されて実在せず壊れてしまう。
// プレビューではアプリが配信している実ファイルのURL（asset.url、/uploads/...の絶対パス）を使い、実際に表示させる。
function previewImageLines(asset: ProjectAsset, label: string, imgClassName: string | undefined): CodeLine[] {
  const classAttr = imgClassName ? ` class="${imgClassName}"` : "";
  return [{ text: `<img src="${asset.url}" alt="${asset.purpose || label}"${classAttr}>`, mark: null }];
}

function resolveLineArray(
  lines: CodeLine[],
  asset: ProjectAsset | null,
  label: string,
  suggestedFileName: string,
  imgClassName: string | undefined,
  forPreview: boolean
): CodeLine[] {
  return lines.flatMap((l) => {
    const match = l.text.match(MARKER_PATTERN);
    if (!match) return [l];
    const indent = match[1];
    const resolved = asset
      ? forPreview
        ? previewImageLines(asset, label, imgClassName)
        : realImageLines(asset, label, imgClassName)
      : placeholderLines(label, suggestedFileName, imgClassName);
    return resolved.map((r) => ({ ...r, text: indent + r.text }));
  });
}

function resolveTextLines(
  lines: string[],
  asset: ProjectAsset | null,
  label: string,
  suggestedFileName: string,
  imgClassName: string | undefined,
  forPreview: boolean
): string[] {
  return resolveLineArray(
    lines.map((text) => ({ text, mark: null })),
    asset,
    label,
    suggestedFileName,
    imgClassName,
    forPreview
  ).map((l) => l.text);
}

function resolveHtmlString(
  html: string,
  asset: ProjectAsset | null,
  label: string,
  suggestedFileName: string,
  imgClassName: string | undefined,
  forPreview: boolean
): string {
  return resolveTextLines(html.split("\n"), asset, label, suggestedFileName, imgClassName, forPreview).join("\n");
}

// newLines（この手順で今回追加した行だけ）を、この手順自身のphotoSlotsだけで解決する。
// newLinesには過去の手順のマーカーが混ざることはないため、自分のslotsだけで十分。
function resolveNewLines(step: MaterialStep, assets: ProjectAsset[]): MaterialStep {
  if (step.photoSlots.length === 0) return step;

  const fileBlocks = step.fileBlocks.map((fb) => {
    let newLines = fb.newLines;
    for (const slot of step.photoSlots) {
      const asset = assets.find((a) => a.slotKey === slot.key) ?? null;
      // D.コード／コピー用はVS Code向けの相対パス（images/...）を使うため、forPreview=false。
      newLines = resolveLineArray(newLines, asset, slot.label, slot.suggestedFileName, slot.imgClassName, false);
    }
    return { ...fb, newLines, copyCode: newLines.map((l) => l.text).join("\n") };
  });

  return { ...step, fileBlocks };
}

// previewHtml/previewCss（この手順までの累積コード）を解決する。
// 累積コードなので、この手順自身のphotoSlotsだけでなく、それ以前の手順で追加された
// photoSlots由来のマーカーも残っている（例：手順4のpreviewHtmlに手順2のロゴ用マーカーが含まれる）。
// cumulativeSlots（この手順までに登場した全photoSlots）で解決することで、取りこぼしを防ぐ。
//
// previewHtml（iframe表示用）とcodeHtml（次の手順のD.コードのbefore文脈用）の2種類を返す。
// 前者は実際に画面に表示するためasset.urlを、後者はVS Codeへコピーするコードと同じ相対パス
// （images/...）を使う必要があり、同じ文字列を共用すると後続手順のコード文脈に実URLが
// 混入してしまうため、分けて計算している。
function resolvePreview(step: MaterialStep, cumulativeSlots: MaterialStep["photoSlots"], assets: ProjectAsset[]) {
  let previewHtml = step.previewHtml;
  let codeHtml = step.previewHtml;
  let previewCss = step.previewCss;
  for (const slot of cumulativeSlots) {
    const asset = assets.find((a) => a.slotKey === slot.key) ?? null;
    previewHtml = resolveHtmlString(previewHtml, asset, slot.label, slot.suggestedFileName, slot.imgClassName, true);
    codeHtml = resolveHtmlString(codeHtml, asset, slot.label, slot.suggestedFileName, slot.imgClassName, false);
  }
  return { previewHtml, previewCss, codeHtml };
}

// 単独の手順だけを解決したいとき（例：相談の変更案プレビュー）向けのエントリポイント。
// この手順自身のphotoSlotsだけで、newLines・previewHtml・previewCssを解決する
// （過去の手順の累積を考慮しないため、直前の手順のphotoSlotsに由来するマーカーが
// previewHtmlに残っている場合は未解決のままになる。完全な解決にはresolveChapterを使うこと）。
export function resolveStep(step: MaterialStep, assets: ProjectAsset[]): MaterialStep {
  const withNewLines = resolveNewLines(step, assets);
  const { previewHtml, previewCss } = resolvePreview(step, step.photoSlots, assets);
  return { ...withNewLines, previewHtml, previewCss };
}

// index.html新規作成手順（手順1）のnewLinesから、<body>行までと</body>以降（外枠）を取り出す。
function extractShell(lines: string[]): { head: string[]; tail: string[] } | null {
  const bodyIdx = lines.findIndex((l) => /<body[\s>]/.test(l));
  const bodyCloseIdx = lines.findIndex((l) => /<\/body>/.test(l));
  if (bodyIdx === -1 || bodyCloseIdx === -1 || bodyCloseIdx <= bodyIdx) return null;
  return { head: lines.slice(0, bodyIdx + 1), tail: lines.slice(bodyCloseIdx) };
}

function indentedBodyLines(previewHtml: string): string[] {
  if (!previewHtml) return [];
  return previewHtml.split("\n").map((l) => (l ? `  ${l}` : l));
}

// 「前の手順までの累積コード（prevLines）」と「この手順まで進めた累積コード（currLines）」を見比べて、
// 変わっていない前半（＝追加分より前の文脈）と後半（＝追加分より後ろの文脈）に切り分ける。
// 追加分がファイルの末尾でなく途中に入る手順（例：<div class="page">の中にヘッダーを足す）でも、
// 実際の挿入位置どおりに表示できるようにするための計算。
function splitByCommonEdges(prevLines: string[], currLines: string[]): { before: string[]; after: string[] } {
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

// 手順を順番に解決しながら、各手順のbeforeLines/afterLines（文脈コード）を、
// 直前の手順までの「解決済み」previewHtml/previewCssから機械的に再構築する。
// AI生成のbeforeLinesをそのまま使わないのは、常にファイル全体の文脈を一貫して表示するため。
export function resolveChapter(chapter: MaterialChapter, assets: ProjectAsset[]): MaterialChapter {
  const steps: MaterialStep[] = [];
  let shell: { head: string[]; tail: string[] } | null = null;
  // prevCodeHtmlは次の手順のD.コード文脈（beforeLines）の再構築専用。実際にコピーするコードと
  // 同じ相対パス（images/...）で持つ必要があるため、iframe表示用のprevHtml（実URL）とは別に保持する。
  let prevCodeHtml = "";
  let prevCss = "";
  let cumulativeSlots: MaterialStep["photoSlots"] = [];

  chapter.steps.forEach((step, i) => {
    cumulativeSlots = [...cumulativeSlots, ...step.photoSlots];
    const withNewLines = resolveNewLines(step, assets);
    const { previewHtml, previewCss, codeHtml } = resolvePreview(step, cumulativeSlots, assets);
    const resolved = { ...withNewLines, previewHtml, previewCss };

    if (i === 0) {
      const htmlFb = resolved.fileBlocks.find((fb) => fb.file === "index.html");
      if (htmlFb) {
        shell = extractShell(htmlFb.newLines.map((l) => l.text));
      }
      steps.push(resolved);
    } else {
      const fileBlocks = resolved.fileBlocks.map((fb) => {
        if (fb.file === "style.css") {
          // CSSは通常ファイルの末尾へ追記するので、ふつうはafterが空になる。
          const { before, after } = splitByCommonEdges(prevCss.split("\n"), resolved.previewCss.split("\n"));
          return { ...fb, beforeLines: before, afterLines: after };
        }
        if (fb.file === "index.html" && shell) {
          // 外枠（<!DOCTYPE>〜<body>、</body></html>）は常に前後に固定し、
          // その内側は前後の累積コードの差分から挿入位置を割り出す。
          const { before, after } = splitByCommonEdges(
            indentedBodyLines(prevCodeHtml),
            indentedBodyLines(codeHtml)
          );
          return {
            ...fb,
            beforeLines: [...shell.head, ...before],
            afterLines: [...after, ...shell.tail],
          };
        }
        return fb;
      });
      steps.push({ ...resolved, fileBlocks });
    }

    prevCodeHtml = codeHtml;
    prevCss = resolved.previewCss;
  });

  return { ...chapter, steps };
}
