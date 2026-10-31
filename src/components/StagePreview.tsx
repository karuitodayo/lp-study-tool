type Props = {
  html: string;
  css: string;
  heightPx?: number;
};

export default function StagePreview({ html, css, heightPx = 440 }: Props) {
  const srcDoc = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; background:#fff; }
  ${css}
</style>
</head>
<body>
${html}
</body>
</html>`;

  return (
    <div className="preview-frame-wrap">
      {/* 利用者のコードや教材サンプルをアプリ本体から隔離して表示するため、sandbox属性で権限を絞っている */}
      <iframe title="表示見本" srcDoc={srcDoc} sandbox="" style={{ height: heightPx }} />
    </div>
  );
}
