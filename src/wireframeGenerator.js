// 「②ワイヤーフレーム」のテンプレート生成。
// AI未接続のため、LPでよく使われる定番の構成（セクション順）をそのまま並べているだけで、
// 画像や設計内容を解析して個別に組み立てたものではない。
// 実績・お客様の声などは創作せず、必ずプレースホルダーにする。

function orBlank(value, placeholder) {
  const v = value?.trim();
  return v ? v : placeholder;
}

// テンプレート生成（brief/finish_image由来）は画像分析に基づかないため、boundingBox・observedTextは
// 常にnull（ページ全体のワイヤー表示では、boundingBoxが無いセクションとして自動的に縦積みされ、
// observedTextが無いセクションとして「実際の文章は未確認」の扱いになる）。
function section(id, type, title, bodyText, role, reason, layout, hasButton, ctaText, hasImage = false) {
  return {
    id,
    type,
    title,
    bodyText,
    role,
    reason,
    layout,
    hasButton,
    ctaText: ctaText ?? null,
    ctaItems: [],
    columns: null,
    boundingBox: null,
    hasImage,
    observedText: null,
  };
}

export function generateWireframeSections(project) {
  const brief = project.brief ?? {};
  const product = orBlank(brief.product, "〔商品・サービス名〕");
  const problem = orBlank(brief.problem, "〔ターゲットが抱える課題〕");
  const purpose = orBlank(brief.purpose, "〔このLPの目的〕");
  const cta = orBlank(brief.cta, "〔促したい行動〕");

  return [
    section(
      "hero",
      "hero",
      product,
      `${purpose}。ページを開いて最初に見える範囲です。`,
      "何のページか・誰のためのものかを一瞬で伝える役割です。",
      "最初に目に入る場所なので、離脱を防ぐために一番上に置きます。",
      "center",
      true,
      cta,
      false
    ),
    section(
      "problem",
      "problem",
      "こんなお悩みありませんか？",
      `${problem}`,
      "ターゲットの悩みに共感してもらい、「自分のことだ」と感じてもらう役割です。",
      "いきなり商品を紹介するより先に悩みへ共感することで、続きを読んでもらいやすくなります。",
      "list",
      false,
      null,
      false
    ),
    section(
      "solution",
      "solution",
      `${product} について`,
      `${problem} を解決するための提案内容を説明します。`,
      "課題に対する解決策として商品・サービスを紹介する役割です。",
      "悩みに共感した直後に解決策を提示することで、スムーズに興味へつなげます。",
      "image-left",
      false,
      null,
      true
    ),
    section(
      "features",
      "features",
      "選ばれる理由・特徴",
      "商品・サービスの強みや特徴を複数並べます（箇条書きで3〜4点が目安）。",
      "他との違いや強みを伝え、信頼につなげる役割です。",
      "解決策を理解したうえで「なぜこれが良いのか」を具体的に示す位置に置きます。",
      "grid",
      false,
      null,
      true
    ),
    section(
      "voice",
      "voice",
      "お客様の声・実績",
      "〔実際の実績・お客様の声をここに入れてください。架空の内容は入れないでください〕",
      "第三者の声によって信頼性を補強する役割です。",
      "特徴を理解したあとに安心材料を示すことで、申し込みへの心理的ハードルを下げます。",
      "list",
      false,
      null,
      false
    ),
    section(
      "faq",
      "faq",
      "よくある質問",
      "申し込み前に気になりやすい質問と回答を並べます。",
      "申し込み直前の不安や疑問を解消する役割です。",
      "CTAの直前に不安を解消しておくことで、離脱を防ぎます。",
      "list",
      false,
      null,
      false
    ),
    section(
      "cta",
      "cta",
      "お申し込みはこちら",
      `${purpose}`,
      "具体的な行動を促す役割です。",
      "ページ全体の内容を踏まえたうえで、最後にもう一度明確な行動を提示します。",
      "center",
      true,
      cta,
      false
    ),
    section(
      "footer",
      "footer",
      "フッター",
      "会社情報・お問い合わせ先・利用規約へのリンクなどをまとめます。",
      "運営者情報や各種リンクをまとめ、信頼性の補足と回遊の入口を提供する役割です。",
      "ページの最後に、本文の流れを妨げない形で設置します。",
      "list",
      false,
      null,
      false
    ),
  ];
}

// layoutの値を、見出し未設定時の補足説明に使う日本語表現に変換する。
const LAYOUT_LABELS = {
  center: "中央寄せ",
  "image-left": "画像が左・文字が右",
  "image-right": "画像が右・文字が左",
  grid: "グリッド状に複数並ぶ",
  list: "縦並びのリスト",
  nav: "ヘッダー（ロゴ＋横並びメニュー）",
};

// 「①の内容」をセクションの役割ヒントに応じて見出し・本文・ボタンへ割り当てる。
// 画像内の実際の文字（コピー等）をそのまま流用せず、設計で確定した自分の言葉に置き換える。
// hint（roleHint）は画像分析側（Gemini／Claude Code）が自由記述で付けるため、
// ここで把握していない値が来ることがある。その場合もlabel（画像分析で記録した区画名）と
// layoutから意味のある見出し・説明文を組み立て、「（内容未設定）」のような空の表示にはしない。
function contentForHint(hint, brief, label, layout) {
  const product = orBlank(brief.product, "〔商品・サービス名〕");
  const purpose = orBlank(brief.purpose, "〔このLPの目的〕");
  const problem = orBlank(brief.problem, "〔ターゲットが抱える課題〕");
  const cta = orBlank(brief.cta, "〔促したい行動〕");

  switch (hint) {
    case "decoration":
      return {
        title: "装飾",
        bodyText: "波形や図形などの背景装飾です。見出し・本文・写真・ボタンのような情報は含みません。",
        hasButton: false,
        ctaText: null,
      };
    case "nav":
    case "header":
      return { title: "ロゴ＋ナビゲーション", bodyText: "ページ内の主要な行き先をまとめたナビゲーションメニューです。", hasButton: false, ctaText: null };
    case "hero":
      return { title: product, bodyText: `${purpose}。ページを開いて最初に見える範囲です。`, hasButton: true, ctaText: cta };
    case "problem":
      return { title: "こんなお悩みありませんか？", bodyText: problem, hasButton: false, ctaText: null };
    case "concept":
      return {
        title: "コンセプト紹介",
        bodyText: `${product}について、世界観や考え方を伝えます。`,
        hasButton: false,
        ctaText: null,
      };
    case "feature":
      return {
        title: "特徴・こだわり",
        bodyText: `${product}ならではの特徴やこだわりを紹介します。`,
        hasButton: false,
        ctaText: null,
      };
    case "content-grid":
      return {
        title: "特徴・取り組み",
        bodyText: `${product}に関する情報を、画像のようにカード形式で複数並べます。`,
        hasButton: false,
        ctaText: null,
      };
    case "info":
      return {
        title: "アクセス・店舗情報",
        bodyText: "住所・営業時間などの情報と地図を並べます。",
        hasButton: false,
        ctaText: null,
      };
    case "cta":
      return { title: "お申し込みはこちら", bodyText: purpose, hasButton: true, ctaText: cta };
    case "footer":
      return {
        title: "フッター",
        bodyText: "会社情報・SNSリンク・利用規約へのリンクなどをまとめます。",
        hasButton: false,
        ctaText: null,
      };
    default: {
      // 未知のroleHintでも、画像分析が記録したlabel（区画名）とlayoutの説明から見出し・説明文を組み立てる。
      const layoutDesc = LAYOUT_LABELS[layout] ? `（配置：${LAYOUT_LABELS[layout]}）` : "";
      return {
        title: label || "（内容未設定）",
        bodyText: `画像から読み取った区画です${layoutDesc}。見出し・本文は自由に書き換えてください。`,
        hasButton: false,
        ctaText: null,
      };
    }
  }
}

// 「診療案内 →」「診療時間・アクセス ──→」のような観察テキストから、末尾の矢印記号・罫線を取り除き、
// ボタンの文言部分だけを取り出す（矢印はアイコンの観察記録であって、ボタンの文言そのものではないため）。
function stripTrailingArrow(text) {
  return text.replace(/[\s\-─—–>→➔➜]+$/u, "").trim();
}

// ②ワイヤーフレーム：Claude Codeが直接読み取った画像分析（project.analysis）から生成する。
// レイアウト（配置パターン・順序）・実際の文章（observedText）は画像の観察結果をそのまま使い、
// 見出し・本文の「管理用の名称・説明」は①設計のブリーフから別途組み立てる
// （画面に表示する文章と、編集フォーム上の管理名称を混同しないよう別項目として保持する）。
export function generateWireframeFromAnalysis(project) {
  const brief = project.brief ?? {};
  const analysisSections = project.analysis?.sections ?? [];

  return analysisSections.map((a) => {
    const content = contentForHint(a.roleHint, brief, a.label, a.layout);
    const isHeaderNav = a.layout === "nav";
    // ボタンの有無は、画像内で実際に観察された結果だけを使う。役割ヒントの既定値（例：
    // heroには申込ボタンがある、という一般的な想定）は使わない。実際の画像ではヒーローに
    // ボタンがなく、別のナビゲーション区画にボタンがあるケースのように、一般的な想定と
    // 観察結果が食い違うことがあるため（観察結果を上書きしてしまう不具合があった）。
    // ヘッダー（layout: nav）のメニューアイコンは「ボタン」の概念には含めない
    // （含めると、メニューの位置にCTA文言が表示されてしまい紛らわしいため）。
    const hasButton = !isHeaderNav && (a.elements?.hasButton ?? false);

    const observedLines = (a.observedText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const ctaCandidates = observedLines.map(stripTrailingArrow).filter(Boolean);
    // 見出しが無く（headingCount:0）観察テキストが2行以上あるボタン区画は、画面下部の案内のように
    // 複数ボタンが並んでいると判断し、観察された行をそのままボタン文言の候補として使う。
    const useMultiCta = hasButton && (a.elements?.headingCount ?? 0) === 0 && ctaCandidates.length >= 2;
    const ctaItems = useMultiCta ? ctaCandidates : [];
    // ボタンが1つの区画は、画像から実際に観察できたボタン文言（ctaCandidates）を最優先にする。
    // ①設計のCTA欄は「促したい行動の説明文」であり、ボタンの文言そのものとは限らないため、
    // 観察できた文言が無いときだけの最終手段として使う。
    const singleObservedCta = !useMultiCta && ctaCandidates.length === 1 ? ctaCandidates[0] : null;
    const ctaText = hasButton && !useMultiCta ? singleObservedCta ?? content.ctaText ?? orBlank(brief.cta, "〔ボタンの文言〕") : null;

    return {
      id: a.id,
      type: a.roleHint || "other",
      title: content.title,
      bodyText: content.bodyText,
      role: `画像内で実際に確認できた要素です（${a.label}）。`,
      reason: a.notes || "画像内での出現順どおりに配置しています。",
      layout: a.layout,
      hasButton,
      ctaText,
      ctaItems,
      columns: a.elements?.columns ?? null,
      boundingBox: a.boundingBox ?? null,
      hasImage: a.elements?.hasImage ?? false,
      observedText: a.observedText || null,
    };
  });
}
