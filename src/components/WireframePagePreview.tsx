import { useEffect, useState } from "react";
import type { ProjectAsset, WireframeSection } from "../types";

type Props = {
  sections: WireframeSection[];
  finishImageUrl: string | null;
  assets: ProjectAsset[];
};

// スマホの画面幅を想定した固定キャンバス幅。実機のCSSピクセル幅の目安として使う
// （縦横比はスマホのまま、PCで見やすいよう実寸をひとまわり大きくしている）。
const CANVAS_WIDTH = 480;
// boundingBox（画像分析の区画範囲）を持たないセクション（手動追加分）の既定の高さ。
const FALLBACK_SECTION_HEIGHT = 160;

type Positioned = { section: WireframeSection; y: number; h: number };

// 各セクションのy・高さ（px）を計算する。
// boundingBoxがあれば、完成画像と同じ比率（canvasHeight基準）の位置・高さにする。
// boundingBoxが無いセクション（手動追加分）は、直前までの最大y位置の続きに固定高さで積む。
function layoutSections(sections: WireframeSection[], canvasHeight: number | null): Positioned[] {
  let cursorY = 0;
  return sections.map((section) => {
    if (section.boundingBox && canvasHeight) {
      const y = section.boundingBox.y * canvasHeight;
      const h = Math.max(section.boundingBox.h * canvasHeight, 1);
      cursorY = Math.max(cursorY, y + h);
      return { section, y, h };
    }
    const y = cursorY;
    const h = FALLBACK_SECTION_HEIGHT;
    cursorY += h;
    return { section, y, h };
  });
}

// ページに表示する文章を決める。
// 画像分析が読み取った文章（observedText）があれば、それを改行ごとの行の配列として最優先で使う
// （管理用の見出し・説明文とは別物。推測で穴埋めしない）。
// 画像分析に基づかない手動追加セクション（boundingBoxが無い）は、そもそも「自由に書く」ためのものなので
// 見出し・本文（title/bodyText）をそのまま表示文章として使う。
// 画像分析はあるのに文字を読み取れなかった場合は、行を返さず「未確認」として扱う。
type DisplayText = { lines: string[]; unconfirmed: boolean };

function resolveDisplayText(section: WireframeSection): DisplayText {
  if (section.observedText && section.observedText.trim()) {
    return { lines: section.observedText.split("\n").map((l) => l.trim()).filter(Boolean), unconfirmed: false };
  }
  if (!section.boundingBox) {
    const lines = [section.title, section.bodyText].map((t) => t.trim()).filter(Boolean);
    return { lines, unconfirmed: false };
  }
  return { lines: [], unconfirmed: true };
}

// 写真の置き場所を示すグレーの仮枠（実際の写真は使わず、置く範囲だけを示す）。
function PhotoPlaceholder({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#dedad0",
        border: "1px dashed #a8a39a",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#8c877d",
        fontSize: 13,
        minHeight: 28,
        ...style,
      }}
    >
      写真
    </div>
  );
}

// 波形などの背景装飾を示す、薄いグレーの柔らかい図形（写真仮枠・ボタンと見分けがつくよう、
// 角のそろった四角形にはしない）。位置・大きさはboundingBoxのまま、形はあくまで簡易表現。
function DecorationShape({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: "#ececea",
        borderRadius: "38% 62% 55% 45% / 45% 40% 60% 55%",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

// セクションの画像枠（wireframe:セクションID）に実装用素材が割り当てられていれば、
// その画像を表示する。未割り当てなら従来どおりグレーの仮枠。
function SectionPhoto({ section, assets, style }: { section: WireframeSection; assets: ProjectAsset[]; style?: React.CSSProperties }) {
  const asset = assets.find((a) => a.slotKey === `wireframe:${section.id}`);
  if (!asset) return <PhotoPlaceholder style={style} />;
  return <img src={asset.url} alt={asset.name} style={{ objectFit: "cover", borderRadius: 10, display: "block", ...style }} />;
}

// 1つだけ並ぶ丸めのボタン（インライン幅）。
function ButtonMock({ text }: { text: string | null }) {
  return (
    <div
      style={{
        display: "inline-block",
        border: "1.4px solid var(--ink)",
        borderRadius: 999,
        padding: "5px 14px",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--ink)",
        background: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {text || "（ボタン文言未設定）"}
    </div>
  );
}

// グリッド内で幅いっぱいに広がる角丸ボタン（画面下部の案内など、複数ボタンが並ぶ区画用）。
function BlockButtonMock({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1.2px solid var(--ink)",
        borderRadius: 10,
        padding: "8px 6px",
        fontSize: 13,
        fontWeight: 700,
        color: "var(--ink)",
        background: "#fff",
        textAlign: "center",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

// 複数ボタンが並ぶ区画（例：診療案内／WEB予約を横並び、診療時間・アクセスを全幅）。
// columns（画像分析のelements.columns）が2以上なら、先頭のcolumns個を横並びグリッドにし、
// 残りを1行ずつ全幅で下に並べる。columnsが無ければ全ボタンを横並びにする。
function ButtonGrid({ items, columns }: { items: string[]; columns: number | null }) {
  const cols = columns && columns > 1 ? Math.min(columns, items.length) : items.length;
  const gridItems = items.slice(0, cols);
  const restItems = items.slice(cols);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
        {gridItems.map((t, i) => (
          <BlockButtonMock key={i} text={t} />
        ))}
      </div>
      {restItems.map((t, i) => (
        <BlockButtonMock key={`rest-${i}`} text={t} />
      ))}
    </div>
  );
}

function UnconfirmedNote() {
  return (
    <div style={{ fontSize: 14, color: "#9c5a00", fontStyle: "italic" }}>
      （画像から文字を確認できませんでした。編集欄から入力できます）
    </div>
  );
}

// ヘッダー（layout: nav）は、ロゴ＋名称を左、ハンバーガーメニューを右に横並びする専用レイアウト。
// メニューアイコンはボタン（CTA）の概念とは別物として、常に固定の2本線アイコンで表示する。
function HeaderSectionBody({ section, assets }: { section: WireframeSection; assets: ProjectAsset[] }) {
  const { lines, unconfirmed } = resolveDisplayText(section);
  const [mainLine, ...subLines] = lines;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%", padding: "0 14px", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {section.hasImage && (
          <SectionPhoto section={section} assets={assets} style={{ width: 36, height: 36, flexShrink: 0, fontSize: 10 }} />
        )}
        <div style={{ minWidth: 0 }}>
          {unconfirmed ? (
            <UnconfirmedNote />
          ) : (
            <>
              {mainLine && (
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {mainLine}
                </div>
              )}
              {subLines.map((l, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--ink-soft)", letterSpacing: 0.4, whiteSpace: "nowrap" }}>
                  {l}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }} title="メニューアイコン（ボタンではありません）">
        <span style={{ width: 24, height: 2, background: "var(--ink)", display: "block" }} />
        <span style={{ width: 24, height: 2, background: "var(--ink)", display: "block" }} />
      </div>
    </div>
  );
}

// 中央揃えの小さいテキストのみのセクション（フッタークレジットなど）。
function FooterSectionBody({ section }: { section: WireframeSection }) {
  const { lines, unconfirmed } = resolveDisplayText(section);
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 14px" }}>
      {unconfirmed ? (
        <UnconfirmedNote />
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink-soft)", textAlign: "center" }}>
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ヘッダー・フッター以外の通常セクション。写真仮枠・文章・ボタンを、配置パターンに応じて並べる。
// 文章は、1行だけなら見出しとして、複数行なら「先頭行＝小さい補助ラベル／最終行＝本文／
// その間＝強調見出し」という簡易な大小の割り振りで表示する（完成画像のカテゴリラベル→
// 大見出し→リード文、という一般的なLPの文章構成に近い見え方になる）。
function TextBlock({ section }: { section: WireframeSection }) {
  const { lines, unconfirmed } = resolveDisplayText(section);
  if (unconfirmed) return <UnconfirmedNote />;
  if (lines.length === 0) return null;

  if (lines.length === 1) {
    return <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", lineHeight: 1.35 }}>{lines[0]}</div>;
  }

  const [label, ...rest] = lines;
  const body = rest[rest.length - 1];
  const heading = rest.slice(0, -1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{label}</div>
      {heading.map((l, i) => (
        <div key={i} style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>
          {l}
        </div>
      ))}
      {body && <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>{body}</div>}
    </div>
  );
}

function ButtonBlock({ section }: { section: WireframeSection }) {
  if (!section.hasButton) return null;
  if (section.ctaItems.length > 0) return <ButtonGrid items={section.ctaItems} columns={section.columns} />;
  return <ButtonMock text={section.ctaText} />;
}

// 観察テキストの末尾に付いている矢印記号・罫線を取り除く（ボタンの文言と比較するため）。
function stripTrailingArrow(text: string): string {
  return text.replace(/[\s\-─—–>→➔➜]+$/u, "").trim();
}

// 見出し・本文になる文章が、実質的に1つのボタンの文言そのものと同じ区画かどうか。
// （例：「商品を見る」だけの区画で、観察テキストとボタン文言が同じ内容のとき）
// 同じなら、文章とボタンの二重表示になるため、文章側を表示しない。
function isButtonOnlySection(section: WireframeSection): boolean {
  if (!section.hasButton || section.ctaItems.length > 0 || !section.ctaText) return false;
  const { lines, unconfirmed } = resolveDisplayText(section);
  if (unconfirmed || lines.length !== 1) return false;
  return stripTrailingArrow(lines[0]) === section.ctaText.trim();
}

function StandardSectionBody({ section, assets }: { section: WireframeSection; assets: ProjectAsset[] }) {
  // 複数ボタンの区画（例：診療案内／WEB予約／診療時間・アクセス）は、観察テキストそのものが
  // 各ボタンの文言なので、文章としてもう一度表示すると同じ内容が二重に出てしまう。
  // ボタン1つだけの区画で、観察テキストがそのボタンの文言と同じ場合も同様。
  // そのため、どちらの場合も文章（TextBlock）は表示せず、ボタン表示（ButtonBlock）だけにする。
  const suppressTextForButton = (section.hasButton && section.ctaItems.length > 0) || isButtonOnlySection(section);

  if (section.layout === "image-left" || section.layout === "image-right") {
    const photo = section.hasImage ? (
      <SectionPhoto section={section} assets={assets} style={{ width: 92, height: "100%", flexShrink: 0 }} />
    ) : null;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: section.layout === "image-left" ? "row" : "row-reverse",
          gap: 10,
          padding: "10px 14px",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {photo}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, width: "100%" }}>
            {!suppressTextForButton && <TextBlock section={section} />}
            <ButtonBlock section={section} />
          </div>
        </div>
      </div>
    );
  }

  // center / list / grid / その他：縦積み。実際のLPでよくある「見出し→本文→写真→ボタン」の順にする
  // （写真を先にボタンより上に置くことで、完成画像のだいたいの流れに近づける）。
  return (
    <div style={{ padding: "10px 14px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
      {!suppressTextForButton && <TextBlock section={section} />}
      {section.hasImage && <SectionPhoto section={section} assets={assets} style={{ flex: 1, minHeight: 24 }} />}
      <ButtonBlock section={section} />
    </div>
  );
}

export default function WireframePagePreview({ sections, finishImageUrl, assets }: Props) {
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!finishImageUrl) {
      setAspect(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0) setAspect(img.naturalHeight / img.naturalWidth);
    };
    img.src = finishImageUrl;
    return () => {
      cancelled = true;
    };
  }, [finishImageUrl]);

  if (sections.length === 0) {
    return <div className="empty-hint">セクションを生成または追加すると、ここにページ全体の下書きが表示されます。</div>;
  }

  const canvasHeight = aspect ? CANVAS_WIDTH * aspect : null;
  const positioned = layoutSections(sections, canvasHeight);
  const totalHeight = Math.max(canvasHeight ?? 0, ...positioned.map((p) => p.y + p.h));

  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 8 }}>
        色・写真・装飾を省き、文字や各要素の配置・大きさ・余白を確認するための下書きです。見出し・本文は画像から読み取った実際の文章、写真はグレーの仮枠、ボタンは文言入りで表示します。
        {aspect
          ? "完成イメージ画像と同じ縦横比のスマホ幅で、大きさ・余白・配置の目安を確認できます。"
          : "完成イメージ画像が未登録、または各セクションの範囲（画像分析のboundingBox）が無いため、高さは目安です。"}
      </p>
      <div
        style={{
          width: CANVAS_WIDTH,
          maxWidth: "100%",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ position: "relative", height: totalHeight }}>
          {positioned.map(({ section, y, h }, i) => (
            <div
              key={section.id}
              style={{
                position: "absolute",
                top: y,
                left: 0,
                width: "100%",
                height: h,
                borderBottom: i < positioned.length - 1 ? "1px dashed var(--line)" : "none",
              }}
              title={`${section.title}（${section.role}）`}
            >
              {section.type === "decoration" ? (
                <DecorationShape style={{ margin: "6% 4%" }} />
              ) : section.layout === "nav" ? (
                <HeaderSectionBody section={section} assets={assets} />
              ) : section.type === "footer" ? (
                <FooterSectionBody section={section} />
              ) : (
                <StandardSectionBody section={section} assets={assets} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
