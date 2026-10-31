# AI講座 記事掲載用コード抜粋

LP制作教科書（LP制作教材）ツールのソースコードから、AI連携部分を3か所抜粋したものです。
いずれも実際のファイルから**一文字も変更せず**抜粋しています（長い指示文の省略・説明コメントの追加のみ行っています）。
APIキー・個人情報・保存済みプロジェクトのデータは含まれていません。

---

## ① Claude Codeによる教材生成処理

出典：`server/src/materialGenerator.js`（`generateMaterial`関数）

```js
export async function generateMaterial({ project, scopeNote, carryOverAnimations = false }) {
  const finish = project.images?.finish;
  if (!finish) {
    throw new MaterialGenError("failed", "完成イメージ画像が登録されていません。");
  }

  // プロジェクトの設計・画像分析・ワイヤーフレームの内容を文章にまとめ、
  // 教材をどんなJSON形式で返してほしいかの指示（スキーマ）も一緒に渡す
  const content = [
    { type: "text", text: `...プロジェクト情報・画像分析結果・出力形式の指示...` },
  ];

  // 完成イメージ画像を実際に読み込み、Claude Codeに直接「見せる」
  const imgPath = path.join(projectImagesDir(project.id), finish.filename);
  const buf = fs.readFileSync(imgPath);
  content.push({
    type: "image",
    source: { type: "base64", media_type: guessImageMime(finish.filename), data: buf.toString("base64") },
  });

  // Claude Code CLI（claude -p）を非対話モードで呼び出し、
  // 手順ごとの図解・差分コードを含む教材をJSON形式で生成してもらう
  const text = await runClaudeCli({
    message: { type: "user", message: { role: "user", content } },
    systemPrompt: SYSTEM_PROMPT,
    tools: "Skill",
    timeoutMs: TIMEOUT_MS,
  });

  const raw = parseJsonLoose(text);
  return normalizeChapter(raw, project, finish);
}
```

**説明**：画像をもとにLP制作の教材を作る部分です。完成イメージ画像を実際に読み込んでClaude Codeに渡し、ルールを書いた指示文（システムプロンプト）と一緒に「手順ごとの図解・コード・説明」をJSON形式で生成してもらいます。AIの出力をそのまま信じず、`normalizeChapter`で形式を整えてから使う点がポイントです。

---

## ② Gemini APIによる画像分析処理

出典：`server/src/geminiAnalyzer.js`（`analyzeImageWithGemini`関数）

```js
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
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: imageBuffer.toString("base64") } }],
        }],
        // JSONの形（キー・型）をあらかじめ指定し、決まった構造で結果を返してもらう
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GeminiError("network", "Gemini APIへの通信に失敗しました。");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429) throw new GeminiError("rate_limit", "利用上限に達しています。");
    if (res.status === 401 || res.status === 403) throw new GeminiError("no_key", "APIキーが無効です。");
    throw new GeminiError("network", `Gemini APIがエラーを返しました（status ${res.status}）。`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeResult(JSON.parse(text));
}
```

**説明**：登録した画像をGemini APIに送り、「どこにどんな要素があるか」を自動分析する部分です。`responseSchema`で出力の型をあらかじめ決めておくことで、AIの回答が毎回同じ構造のJSONになるよう工夫しています。利用上限・キー未設定など、エラーの種類ごとに分かりやすいメッセージを返している点も特徴です。

---

## ③ 教材の比較・採用・バックアップ処理

出典：`server/src/routes/projects.js`（`POST /:id/material/adopt-regeneration`）

```js
// 教材の再生成の提案を採用する：置き換えられる現在の教材をバックアップとして保存してから、
// 提案の内容で教材を上書きする。
projectsRouter.post("/:id/material/adopt-regeneration", (req, res) => {
  const { id } = req.params;
  const project = readProject(id);
  const pending = project.material.pendingRegeneration;
  if (!pending) {
    return res.status(400).json({ error: "確認待ちの再生成がありません。" });
  }

  // 上書きする前に、今の教材をまるごとバックアップファイルとして残す
  if (project.material.chapter) {
    writeMaterialBackup(id, {
      generatedAt: project.material.generatedAt,
      chapter: project.material.chapter,
      backedUpAt: new Date().toISOString(),
      reason: "regeneration-adopted",
    });
  }

  // バックアップが済んでから、提案されていた新しい教材に置き換える
  const { proposal } = pending;
  const newChapter = applyNewChapter(project, proposal.chapter);
  project.material = {
    ...project.material,
    chapter: newChapter,
    pendingRegeneration: null,
    generationStatus: null,
  };
  writeProject(project);
  res.json({ project });
});
```

**説明**：教材を作り直したとき、新旧の内容をいきなり置き換えず「採用」ボタンを押すまでは提案として保持し、確定した時点で古い教材を自動でバックアップしてから置き換える仕組みです。誤って上書きしても、サーバー側に残ったバックアップから元の教材に戻せる安全策になっています。
