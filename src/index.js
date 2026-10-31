import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectsRouter } from "./routes/projects.js";
import { imagesRouter } from "./routes/images.js";
import { assetsRouter } from "./routes/assets.js";
import { wireframeCandidatesRouter } from "./routes/wireframeCandidates.js";
import { consultRouter } from "./routes/consult.js";
import { getSampleChapter } from "./sampleMaterial.js";
import { DATA_ROOT, clearStaleMaterialGenerationStatuses } from "./store.js";

// 前回起動時に教材生成が「生成中」のまま終了していた場合に備え、起動時に必ずクリアする。
clearStaleMaterialGenerationStatuses();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = express();

// ローカルPCからのみ利用する前提のため、開発中のViteサーバー(5173)からのみ許可する。
app.use(
  cors({
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
  })
);
app.use(express.json({ limit: "2mb" }));

app.use("/sample", express.static(path.join(__dirname, "..", "public", "sample")));
app.use("/uploads", express.static(DATA_ROOT));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/sample-material", (req, res) => {
  res.json({ chapter: getSampleChapter() });
});

app.use("/api/projects/:id/images", imagesRouter);
app.use("/api/projects/:id/assets", assetsRouter);
app.use("/api/projects/:id/wireframe/candidates", wireframeCandidatesRouter);
app.use("/api/projects/:id/consult", consultRouter);
app.use("/api/projects", projectsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "サーバーでエラーが発生しました。" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[server] http://127.0.0.1:${PORT} で起動しました（PCからのみアクセス可能）`);
});
