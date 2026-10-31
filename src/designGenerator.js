// 「①設計」の整理機能。
// AI未接続のため、入力内容をそのまま定型文に当てはめているだけで、
// 内容の分析・提案は行っていない（＝事実の整形であり、創作や推測は含まない）。

const FIELD_LABELS = {
  purpose: "目的（何のためのLPか）",
  target: "ターゲット",
  problem: "ターゲットが抱える課題",
  product: "商品・サービスの内容",
  cta: "促したい行動（CTA）",
};

// 入力の抜け漏れチェック。これはAIではなく単純な空欄判定。
export function buildMissingList(brief) {
  return Object.entries(FIELD_LABELS)
    .filter(([key]) => !brief?.[key]?.trim())
    .map(([, label]) => label);
}

function orBlank(value, placeholder) {
  const v = value?.trim();
  return v ? v : placeholder;
}

export function generateDesignSummary(project) {
  const brief = project.brief ?? {};
  const who = orBlank(brief.target, "〔ターゲット未入力〕");
  const problem = orBlank(brief.problem, "〔課題未入力〕");
  const product = orBlank(brief.product, "〔商品・サービス未入力〕");
  const purpose = orBlank(brief.purpose, "〔目的未入力〕");
  const cta = orBlank(brief.cta, "〔CTA未入力〕");

  const referenceCount = project.images?.references?.length ?? 0;
  const referenceNote =
    referenceCount > 0
      ? `参考画像が${referenceCount}枚登録されています（各画像のメモも参考にしてください）。`
      : "参考画像はまだ登録されていません。";

  return {
    generatedAt: new Date().toISOString(),
    isSample: true,
    whoProblem: `${who} が、${problem} という課題を抱えている、という想定です。`,
    proposal: `その課題に対して「${product}」を提案し、「${purpose}」を目指します。`,
    action: `最終的に「${cta}」という行動を取ってもらうことをゴールにします。`,
    missing: buildMissingList(brief),
    referenceNote,
    note:
      "これはAI未接続時の下書きです。入力内容をそのまま定型文に当てはめただけで、課題の分析や提案内容の検討は行っていません。実際の整理・提案はAI連携後に対応します。",
  };
}
