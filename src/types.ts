export type Region = { x: number; y: number; w: number; h: number };

export type ImageRecord = {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  url: string;
  memo?: string;
  region?: Region | null;
};

export type ProjectBrief = {
  purpose: string;
  target: string;
  problem: string;
  product: string;
  cta: string;
  deadline: string;
  materials: string;
  notes: string;
};

export type ProjectProgress = {
  currentStepIndex: number;
  maxReachedStepIndex: number;
};

export type DesignSummary = {
  generatedAt: string;
  isSample: boolean;
  whoProblem: string;
  proposal: string;
  action: string;
  missing: string[];
  referenceNote: string;
  note: string;
};

export type ProjectDesign = {
  requestText: string;
  summary: DesignSummary | null;
  confirmed: boolean;
  confirmedAt: string | null;
};

export type WireframeLayout = "center" | "image-left" | "image-right" | "grid" | "list" | "nav";

export type WireframeSection = {
  id: string;
  type: string;
  // title・bodyTextは「①設計の内容から組み立てた、管理用の見出し・説明文」。
  // 編集フォーム（セクションカード）の表示・入力用で、ページ全体のワイヤー表示には使わない
  // （画像内の実際の文字とは別物で、そのまま出すと「ページに実際に表示される文章」と混同するため）。
  title: string;
  bodyText: string;
  role: string;
  reason: string;
  layout: WireframeLayout;
  // ボタン（主に1つ）があるかどうか。ヘッダーのメニューアイコンのような「ボタンではない要素」は含めない
  // （含めると、メニューアイコンの位置にCTA文言が表示される誤解を招くため）。
  hasButton: boolean;
  ctaText: string | null;
  // 画面下部の案内のように、ボタンが複数並ぶセクション用。1件もあればページ表示ではこちらを優先する。
  ctaItems: string[];
  // グリッド状にボタン・カード等を並べるときの列数の目安（画像分析のelements.columnsを引き継ぐ）。
  columns: number | null;
  // ページ全体のワイヤー（下書き）表示用に追加した項目。
  // boundingBoxは画像分析の区画の範囲（0〜1の割合）をそのまま引き継いだもので、
  // 完成画像と同じ比率でセクションの高さ・位置を再現するために使う。
  // 手動で追加したセクションにはboundingBoxが無い（null）ため、その場合は他の
  // セクションの残り高さに応じて自動的に積む。
  boundingBox: Region | null;
  // 写真を置くかどうか（グレーの仮枠で表示）。画像分析のelements.hasImageを引き継ぐ。
  hasImage: boolean;
  // 画像分析が実際に読み取った文字（observedText）をそのまま引き継いだもの。
  // ページ全体のワイヤーには、管理用のtitle/bodyTextではなく、これを実際の文章として表示する。
  // 読み取れていない場合はnull（推測で埋めず、編集フォーム側でも「未読み取り」と分かるようにする）。
  observedText: string | null;
};

// 外部で作った（他サイトを参考にした等の）ワイヤーフレーム案の画像。
// 完成イメージ画像＝色・雰囲気の参考、こちらの採用案＝配置・構成の基準、として役割を分ける。
export type WireframeCandidate = {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  url: string;
  note: string;
  selected: boolean;
};

export type ProjectWireframe = {
  generatedAt: string | null;
  isSample: boolean;
  basedOn: "brief" | "finish_image" | "analysis" | null;
  sections: WireframeSection[];
  candidates: WireframeCandidate[];
};

export type AnalysisSectionElements = {
  headingCount: number;
  hasImage: boolean;
  hasButton: boolean;
  columns: number | null;
};

export type AnalysisSection = {
  id: string;
  order: number;
  label: string;
  roleHint: string;
  boundingBox: { x: number; y: number; w: number; h: number };
  layout: WireframeLayout;
  elements: AnalysisSectionElements;
  observedText: string;
  notes: string;
  colorNotes: string;
  typographyNotes: string;
  spacingNotes: string;
  htmlApproach: string;
  cssApproach: string;
};

export type ProjectAnalysis = {
  sourceImageId: string | null;
  sourceKind: "finish" | "reference" | null;
  analyzedAt: string | null;
  analyzedBy: string | null;
  imageDescription: string;
  excludedNote: string;
  colorPalette: string;
  typographySystem: string;
  spacingSystem: string;
  buildApproach: string;
  sections: AnalysisSection[];
  confirmed: boolean;
  confirmedAt: string | null;
};

export type ConsultMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brief: ProjectBrief;
  design: ProjectDesign;
  wireframe: ProjectWireframe;
  analysis: ProjectAnalysis;
  material: ProjectMaterial;
  assets: ProjectAsset[];
  consult: { messages: ConsultMessage[] };
  images: {
    finish: ImageRecord | null;
    references: ImageRecord[];
  };
  progress: ProjectProgress;
};

export type ProjectSummary = Pick<Project, "id" | "name" | "createdAt" | "updatedAt" | "progress"> & {
  materialStepCount: number | null;
  finishImageUrl: string | null;
};

export type CodeLine = { text: string; mark: string | null };

export type OperationType = "追加" | "置換" | "削除";

// 親要素・子要素・並び方・余白を箱と矢印で示す構造図（お手本画像そのものではなく模式図）
export type StructureBox = { id: string; label: string; x: number; y: number; w: number; h: number; emphasis?: boolean };
export type StructureArrow = { from: { x: number; y: number }; to: { x: number; y: number }; label?: string };
export type StructureNote = { x: number; y: number; text: string };
export type StructureDiagram = {
  boxes: StructureBox[];
  arrows?: StructureArrow[];
  notes?: StructureNote[];
};

// 1つの手順の中で変更するファイル1つ分（新しい手順は複数ファイルにまたがることがある）
export type MaterialFileBlock = {
  file: string;
  operationType: OperationType;
  insertLocation: string;
  beforeLines: string[];
  // 追加分より「後ろ」に来る既存コード（index.htmlの`</body></html>`など）。
  // C「どこに書くか」が示す挿入位置（本文の途中）と、D「コード」の表示順を一致させるために、
  // beforeLines（追加分より前）と分けて持つ。CSSは常に末尾追記なので空のままになる。
  afterLines?: string[];
  newLines: CodeLine[];
  copyCode: string;
};

// 教材内で「実装用素材」を参照する箇所。素材が未割り当てのときは仮枠として表示する。
export type MaterialPhotoSlot = {
  key: string;
  label: string;
  suggestedFileName: string;
  // 差し込む<img>タグに付けるクラス名（教材のCSSが.header__logo-markのように
  // img要素自体を対象にしたクラスを定義している場合に指定される。任意）。
  imgClassName?: string;
};

export type MaterialStep = {
  id: string;
  order: number;
  title: string;
  goal: string;
  explanation: string;
  diagramRect: { x: number; y: number; w: number; h: number };
  diagramLabel: string;
  diagramCaveat?: string;
  structureDiagram: StructureDiagram;
  fileBlocks: MaterialFileBlock[];
  photoSlots: MaterialPhotoSlot[];
  adjustPoints: { label: string; prop: string; value: string; note: string }[];
  checkFirst: string;
  previewHtml: string;
  previewCss: string;
};

export type MaterialChapter = {
  id: string;
  title: string;
  isSample: boolean;
  sampleImageUrl: string;
  sampleImageNote: string;
  noteBanner: string;
  noteBannerTone: "info" | "warn";
  steps: MaterialStep[];
};

export type ProjectAsset = {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  url: string;
  name: string;
  purpose: string;
  suggestedFileName: string;
  slotKey: string | null;
};

// 教材の生成処理が今まさに進行中かどうかをサーバー側に永続化したもの。
// ページ再読み込みやタブの行き来でクライアントのローカルstateが失われても、
// このフィールドを見れば「生成中」であることを復元できる。
export type MaterialGenerationStatus = {
  state: "generating";
  startedAt: string;
  scopeNote: string;
};

// 「教材を作り直す」で新しく生成されたが、まだ採用（保存）されていない提案。
// 生成直後の内容そのもの（既存のchapterと同じ形）に、いつ出来たかを添えて保持する。
// サーバー側に保存することで、ページ再読み込み後も「比較待ち」の状態を復元できる。
export type MaterialRegenerationProposal = {
  generatedAt: string | null;
  generatedBy: string | null;
  scopeNote: string;
  basedOnAnalysisConfirmedAt: string | null;
  basedOnWireframeGeneratedAt: string | null;
  chapter: MaterialChapter;
};

export type PendingMaterialRegeneration = {
  proposal: MaterialRegenerationProposal;
  createdAt: string;
};

export type ProjectMaterial = {
  generatedAt: string | null;
  generatedBy: string | null;
  scopeNote: string;
  basedOnAnalysisConfirmedAt: string | null;
  basedOnWireframeGeneratedAt: string | null;
  chapter: MaterialChapter | null;
  generationStatus: MaterialGenerationStatus | null;
  pendingRegeneration: PendingMaterialRegeneration | null;
};
