// 第1段階用の「サンプル教材」データ。
// 実画像をAIで解析した結果ではなく、見せ方を確認するための固定サンプルです。
// 第2段階でAI分析結果から同じ形のデータを生成できるよう、構造をそろえています。

const BASE_HTML = `<section id="product">
  <p class="product-eyebrow">PRODUCT</p>
  <div class="product-flex">
    <div class="product-left">
      <div class="product-photo ph1">MAN TO MAN</div>
      <div class="product-photo ph2">CAREER</div>
    </div>
    <div class="product-right">
      <div class="product-photo ph3">MEDIA</div>
      <div class="product-photo ph4">B2B</div>
    </div>
  </div>
</section>`;

const BASE_CSS = `/*======== 前略（他のセクションのスタイル） ========*/

.product-eyebrow {
  font-size: 13px;
  letter-spacing: 2px;
  color: #6b5bd6;
  font-weight: bold;
}

.product-photo {
  height: 220px;
  border-radius: 0 0 60px 0;
  display: flex;
  align-items: flex-end;
  padding: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: bold;
}

.ph1 { background-color: #8c8c8c; }
.ph2 { background-color: #cf8a4a; }
.ph3 { background-color: #3b3f45; }
.ph4 { background-color: #b08968; }`;

// line: 表示するコード1行
// mark: その行の中で特に注目してほしい値（スクショの枠強調に相当）
function line(text, mark) {
  return { text, mark: mark ?? null };
}

const STEP_DEFS = [
  {
    id: "section",
    order: 1,
    title: "1. セクション全体の外枠を作る",
    goal:
      "お手本画像の「PRODUCT」セクションぜんたいを囲む外枠を作ります。ここが完成すると、背景色と上下の余白がつき、セクションの区切りがはっきりします。",
    file: "style.css",
    operationType: "追加",
    insertLocation:
      "style.css の末尾（他のセクションのスタイルの後ろ）に追記します。",
    explanation:
      "section要素（id=\"product\"）に対して、背景色・外側の余白（margin）・内側の余白（padding）を指定します。backgroundは要素の内側全体に色を敷き、marginは要素の外側（他の要素との間）の余白、paddingは要素の内側（枠と中身の間）の余白という違いがあります。",
    diagramRect: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 },
    diagramLabel: "#product（セクション全体）",
    structureDiagram: {
      boxes: [
        { id: "margin", label: "①margin", x: 0.03, y: 0.06, w: 0.94, h: 0.88 },
        { id: "section", label: "②#product", x: 0.1, y: 0.22, w: 0.8, h: 0.56, emphasis: true },
        { id: "padding", label: "③padding", x: 0.17, y: 0.38, w: 0.66, h: 0.3 },
      ],
      notes: [
        { x: 0.5, y: 0.14, text: "margin: 80px 0 80px 0" },
        { x: 0.5, y: 0.54, text: "padding: 10px 40px 0px 40px" },
      ],
    },
    checkFirst:
      "セクションに色や余白がついていない場合は、まずstyle.cssに #product のルールが追加されているか、セレクター名のタイプミス（# の付け忘れなど）がないかを確認してください。",
    newRuleLines: [
      line("#product {"),
      line("  background-color: #fafafa;", "#fafafa"),
      line("  margin: 80px 0 80px 0;", "80px 0 80px 0"),
      line("  padding: 10px 40px 0px 40px;", "10px 40px 0px 40px"),
      line("}"),
    ],
    adjustPoints: [
      {
        label: "背景色",
        prop: "background-color",
        value: "#fafafa",
        note: "薄いグレー。真っ白(#fff)との違いを見比べてみてください。",
      },
      {
        label: "外側の余白",
        prop: "margin",
        value: "80px 0 80px 0",
        note: "上下80px・左右0px。上から時計回り（上 右 下 左）の順で指定しています。",
      },
      {
        label: "内側の余白",
        prop: "padding",
        value: "10px 40px 0px 40px",
        note: "中の文字や写真が端に寄りすぎないための余白です。左右40pxが効いています。",
      },
    ],
  },
  {
    id: "flex",
    order: 2,
    title: "2. 写真をグループ化して横並びにする",
    goal:
      "4枚の写真ブロックをまとめている .product-flex に、横並び（flex）の指定をします。ここが完成すると、左右2つのカラムが横に並びます。",
    file: "style.css",
    operationType: "追加",
    insertLocation:
      "手順1で追加した #product の直後に追記します。",
    explanation:
      "display: flex を指定すると、その要素の直下の子要素（ここでは .product-left と .product-right）が横並びになります。margin-topは、ひとつ上の要素（eyebrowのテキスト）との間の余白です。",
    diagramRect: { x: 0.05, y: 0.132, w: 0.9, h: 0.823 },
    diagramLabel: "#product .product-flex（左右カラムの入れ物）",
    structureDiagram: {
      boxes: [
        { id: "flex", label: "①.product-flex", x: 0.06, y: 0.16, w: 0.88, h: 0.76, emphasis: true },
        { id: "left", label: "②.product-left", x: 0.1, y: 0.26, w: 0.37, h: 0.58 },
        { id: "right", label: "③.product-right", x: 0.53, y: 0.26, w: 0.37, h: 0.58 },
      ],
      arrows: [{ from: { x: 0.3, y: 0.55 }, to: { x: 0.53, y: 0.55 }, label: "flexで横に並ぶ" }],
      notes: [{ x: 0.5, y: 0.09, text: "margin-top: 40px" }],
    },
    checkFirst:
      "横並びにならない場合は、.product-flex に display: flex が書けているか、タイプミスで別のクラス名になっていないかを確認してください。",
    newRuleLines: [
      line("#product .product-flex {"),
      line("  margin-top: 40px;", "40px"),
      line("  display: flex;", "flex"),
      line("}"),
    ],
    adjustPoints: [
      {
        label: "表示方法",
        prop: "display",
        value: "flex",
        note: "子要素を横並びにする指定です。外すと縦積みに戻るので、試しに消して比較してみてください。",
      },
      {
        label: "上の余白",
        prop: "margin-top",
        value: "40px",
        note: "「PRODUCT」の文字とカラムの間の余白です。",
      },
    ],
  },
  {
    id: "left",
    order: 3,
    title: "3. 左カラムの幅を決める",
    goal:
      ".product-left の幅と右側の余白を指定し、画面の左半分におさまるようにします。",
    file: "style.css",
    operationType: "追加",
    insertLocation:
      "手順2で追加した .product-flex の直後に追記します。",
    explanation:
      "width: 50% は、親要素（.product-flex）の幅に対する割合です。margin-rightで右カラムとの間にすき間を作っています。",
    diagramRect: { x: 0.05, y: 0.132, w: 0.425, h: 0.705 },
    diagramLabel: ".product-left（左のカラム）",
    structureDiagram: {
      boxes: [
        { id: "flex", label: ".product-flex", x: 0.06, y: 0.16, w: 0.88, h: 0.76 },
        { id: "left", label: "①.product-left", x: 0.1, y: 0.26, w: 0.37, h: 0.58, emphasis: true },
        { id: "right", label: "②.product-right", x: 0.53, y: 0.26, w: 0.37, h: 0.58 },
      ],
      arrows: [{ from: { x: 0.47, y: 0.55 }, to: { x: 0.53, y: 0.55 }, label: "margin-right:20px" }],
      notes: [{ x: 0.285, y: 0.91, text: "width: 50%" }],
    },
    checkFirst:
      "左カラムの幅が想定と違う場合は、.product-left の width が 50% になっているか、親の .product-flex に display:flex が設定されたままかを確認してください。",
    newRuleLines: [
      line(".product-left {"),
      line("  width: 50%;", "50%"),
      line("  margin-right: 20px;", "20px"),
      line("}"),
    ],
    adjustPoints: [
      {
        label: "幅",
        prop: "width",
        value: "50%",
        note: "親要素のちょうど半分。左右で合計100%にならないとレイアウトが崩れるので注意してください。",
      },
      {
        label: "右の余白",
        prop: "margin-right",
        value: "20px",
        note: "右カラムとのすき間です。",
      },
    ],
  },
  {
    id: "right",
    order: 4,
    title: "4. 右カラムの幅と位置をずらす",
    goal:
      ".product-right の幅を決め、margin-topで上下の位置を左カラムよりも下にずらして、お手本画像のような段差のあるレイアウトにします。",
    file: "style.css",
    operationType: "追加",
    insertLocation:
      "手順3で追加した .product-left の直後に追記します。",
    explanation:
      "margin-topをここだけ追加することで、左右のカラムの開始位置に差をつけています。写真のサイズ自体は変えず、余白だけで段差を表現しているのがポイントです。",
    diagramRect: { x: 0.525, y: 0.25, w: 0.425, h: 0.705 },
    diagramLabel: ".product-right（右のカラム）",
    structureDiagram: {
      boxes: [
        { id: "flex", label: ".product-flex", x: 0.06, y: 0.14, w: 0.88, h: 0.8 },
        { id: "left", label: "①.product-left", x: 0.1, y: 0.22, w: 0.37, h: 0.42 },
        { id: "right", label: "②.product-right", x: 0.53, y: 0.4, w: 0.37, h: 0.42, emphasis: true },
      ],
      arrows: [{ from: { x: 0.715, y: 0.22 }, to: { x: 0.715, y: 0.4 }, label: "margin-top:80px" }],
      notes: [{ x: 0.715, y: 0.9, text: "width: 50%" }],
    },
    checkFirst:
      "段差がつかない場合は、.product-right の margin-top の値と、.product-flex に display:flex が設定されたままかを確認してください。",
    newRuleLines: [
      line(".product-right {"),
      line("  width: 50%;", "50%"),
      line("  margin-left: 20px;", "20px"),
      line("  margin-top: 80px;", "80px"),
      line("}"),
    ],
    adjustPoints: [
      {
        label: "幅",
        prop: "width",
        value: "50%",
        note: "左カラムと同じ考え方です。",
      },
      {
        label: "左の余白",
        prop: "margin-left",
        value: "20px",
        note: "左カラムとのすき間（左カラム側のmargin-rightと合わせて40pxのすき間になります）。",
      },
      {
        label: "上の余白",
        prop: "margin-top",
        value: "80px",
        note: "この数値を0にすると段差がなくなります。数値を変えて見比べると効果がわかりやすいです。",
      },
    ],
  },
];

function buildCssBlock(stepLines) {
  return stepLines.map((l) => l.text).join("\n");
}

export function getSampleChapter() {
  let cumulativeAdded = "";
  const steps = STEP_DEFS.map((def, index) => {
    const ruleBlock = buildCssBlock(def.newRuleLines);
    const cssBefore = index === 0 ? BASE_CSS : `${BASE_CSS}\n\n${cumulativeAdded}`;
    cumulativeAdded = cumulativeAdded ? `${cumulativeAdded}\n\n${ruleBlock}` : ruleBlock;
    const previewCss = `${BASE_CSS}\n\n${cumulativeAdded}`;

    return {
      id: def.id,
      order: def.order,
      title: def.title,
      goal: def.goal,
      explanation: def.explanation,
      diagramRect: def.diagramRect,
      diagramLabel: def.diagramLabel,
      structureDiagram: def.structureDiagram,
      fileBlocks: [
        {
          file: def.file,
          operationType: def.operationType,
          insertLocation: def.insertLocation,
          beforeLines: cssBefore.split("\n"),
          newLines: def.newRuleLines,
          copyCode: ruleBlock,
        },
      ],
      photoSlots: [],
      adjustPoints: def.adjustPoints,
      checkFirst: def.checkFirst,
      previewHtml: BASE_HTML,
      previewCss,
    };
  });

  return {
    id: "sample-product-section",
    title: "プロダクト紹介セクション（表示形式の見本）",
    isSample: true,
    sampleImageUrl: "/sample/sample-model.svg",
    sampleImageNote:
      "この画像は実在のLPではなく、見せ方確認用に作成した模式図です。",
    noteBanner:
      "このプロジェクト専用の教材はまだありません。これは手順の見せ方（図解・差分コード・段階別プレビュー）を確認するための共通サンプルです。Claude Codeに「画像分析・ワイヤーフレームをもとに教材を作ってください」のように依頼すると、このプロジェクト専用の教材に切り替わります。",
    noteBannerTone: "warn",
    steps,
  };
}
