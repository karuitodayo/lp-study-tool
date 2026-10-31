import type { ReactNode } from "react";

// 相談欄の回答表示専用の、最小限のMarkdown表示（見出し・箇条書き・区切り線・コードブロック・
// 太字/斜体/インラインコード・改行）。相談機能や保存処理には関わらない、表示だけの変換。

type Block =
  | { type: "code"; code: string }
  | { type: "heading"; level: number; text: string }
  | { type: "hr" }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isHr = (l: string) => /^(-{3,}|\*{3,}|_{3,})\s*$/.test(l.trim());
  const isHeading = (l: string) => /^(#{1,4})\s+(.*)$/.exec(l);
  const isUl = (l: string) => /^\s*[-*]\s+(.*)$/.exec(l);
  const isOl = (l: string) => /^\s*\d+\.\s+(.*)$/.exec(l);

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 閉じの```を読み飛ばす
      blocks.push({ type: "code", code: codeLines.join("\n") });
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (isHr(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const ul = isUl(line);
    if (ul) {
      const items: string[] = [ul[1]];
      i++;
      let next;
      while (i < lines.length && (next = isUl(lines[i]))) {
        items.push(next[1]);
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const ol = isOl(line);
    if (ol) {
      const items: string[] = [ol[1]];
      i++;
      let next;
      while (i < lines.length && (next = isOl(lines[i]))) {
        items.push(next[1]);
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // 段落：空行・次のブロック開始まで連続行をまとめる
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !isHeading(lines[i]) &&
      !isHr(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join("\n") });
  }

  return blocks;
}

// **太字**、*斜体*、`コード`、改行をReactノードに変換する
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const codeParts = text.split(/(`[^`]+`)/g);

  codeParts.forEach((part, ci) => {
    if (/^`[^`]+`$/.test(part)) {
      nodes.push(
        <code key={`${keyPrefix}-c${ci}`} className="md-inline-code">
          {part.slice(1, -1)}
        </code>
      );
      return;
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bpart, bi) => {
      if (/^\*\*[^*]+\*\*$/.test(bpart)) {
        nodes.push(<strong key={`${keyPrefix}-b${ci}-${bi}`}>{bpart.slice(2, -2)}</strong>);
        return;
      }
      const italicParts = bpart.split(/(\*[^*]+\*)/g);
      italicParts.forEach((ipart, ii) => {
        if (/^\*[^*]+\*$/.test(ipart)) {
          nodes.push(<em key={`${keyPrefix}-i${ci}-${bi}-${ii}`}>{ipart.slice(1, -1)}</em>);
          return;
        }
        const lines = ipart.split("\n");
        lines.forEach((ln, li) => {
          if (li > 0) nodes.push(<br key={`${keyPrefix}-br${ci}-${bi}-${ii}-${li}`} />);
          if (ln) nodes.push(ln);
        });
      });
    });
  });

  return nodes;
}

export default function MarkdownText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="md-body">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "code":
            return (
              <pre key={key} className="md-code-block">
                <code>{block.code}</code>
              </pre>
            );
          case "heading": {
            const level = Math.min(block.level, 4);
            return (
              <div key={key} className={`md-heading md-h${level}`} role="heading" aria-level={level}>
                {renderInline(block.text, key)}
              </div>
            );
          }
          case "hr":
            return <hr key={key} className="md-hr" />;
          case "ul":
            return (
              <ul key={key} className="md-list">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`}>{renderInline(item, `${key}-${ii}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="md-list">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`}>{renderInline(item, `${key}-${ii}`)}</li>
                ))}
              </ol>
            );
          case "p":
          default:
            return (
              <p key={key} className="md-p">
                {renderInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
