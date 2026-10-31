import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { projectDir, projectExists, readProject, writeProject } from "../store.js";

// SVGは装飾素材（波形・アイコン等）用。自分のPC内の個人用ツールで、利用者自身がアップロードする
// 前提のため、他者からの投稿を受け付けるWebサービスと異なりXSSの主体がいない（本人のみが使う）。
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export function projectAssetsDir(id) {
  return path.join(projectDir(id), "assets");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = projectAssetsDir(req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || guessExt(file.mimetype);
    cb(null, `${randomUUID()}${ext}`);
  },
});

function guessExt(mime) {
  switch (mime) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".jpg";
  }
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_TYPE"));
      return;
    }
    cb(null, true);
  },
});

// ファイル名として安全な形に整える（拡張子は維持）。VS Codeでの保存名の提案に使う。
function sanitizeFileName(name, fallbackExt) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return `image${fallbackExt}`;
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(trimmed);
  const base = (hasExt ? trimmed.replace(/\.[a-zA-Z0-9]{2,5}$/, "") : trimmed)
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
  return `${base}${hasExt ? trimmed.match(/\.[a-zA-Z0-9]{2,5}$/)[0].toLowerCase() : fallbackExt}`;
}

export const assetsRouter = Router({ mergeParams: true });

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.message === "UNSUPPORTED_TYPE") {
        return res.status(400).json({
          error: "対応していない画像形式です。JPEG・PNG・WebP・GIF・SVGのいずれかで、もう一度選び直してください。",
        });
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "画像の容量が大きすぎます（上限8MB）。圧縮するか別の画像でお試しください。",
        });
      }
      return res.status(400).json({ error: "画像のアップロードに失敗しました。もう一度お試しください。" });
    }
    next();
  });
}

// 実装用の写真・画像素材を登録する（完成イメージ・参考画像とは別の保管場所）。
assetsRouter.post("/", (req, res) => {
  if (!projectExists(req.params.id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  handleUpload(req, res, () => {
    if (!req.file) {
      return res.status(400).json({ error: "画像ファイルが見つかりませんでした。" });
    }
    const project = readProject(req.params.id);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const purpose = typeof req.body.purpose === "string" ? req.body.purpose.trim() : "";
    const slotKey = typeof req.body.slotKey === "string" && req.body.slotKey ? req.body.slotKey : null;
    const ext = path.extname(req.file.filename);
    const suggestedFileName = sanitizeFileName(req.body.suggestedFileName || name, ext);

    const record = {
      id: randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      url: `/uploads/${req.params.id}/assets/${req.file.filename}`,
      name: name || req.file.originalname,
      purpose,
      suggestedFileName,
      slotKey,
    };
    project.assets.push(record);
    writeProject(project);
    res.status(201).json({ project });
  });
});

assetsRouter.put("/:assetId", (req, res) => {
  const { id, assetId } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const target = project.assets.find((a) => a.id === assetId);
  if (!target) {
    return res.status(404).json({ error: "素材が見つかりません。" });
  }
  const { name, purpose, suggestedFileName, slotKey } = req.body ?? {};
  if (typeof name === "string") target.name = name;
  if (typeof purpose === "string") target.purpose = purpose;
  if (typeof suggestedFileName === "string" && suggestedFileName.trim()) {
    const ext = path.extname(target.filename);
    target.suggestedFileName = sanitizeFileName(suggestedFileName, ext);
  }
  if (slotKey === null || typeof slotKey === "string") {
    // 同じ使用箇所(slotKey)を割り当てられる素材は1つだけにする
    if (slotKey) {
      project.assets.forEach((a) => {
        if (a.id !== assetId && a.slotKey === slotKey) a.slotKey = null;
      });
    }
    target.slotKey = slotKey || null;
  }

  writeProject(project);
  res.json({ project });
});

assetsRouter.delete("/:assetId", (req, res) => {
  const { id, assetId } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const idx = project.assets.findIndex((a) => a.id === assetId);
  if (idx === -1) {
    return res.status(404).json({ error: "素材が見つかりません。" });
  }
  const [removed] = project.assets.splice(idx, 1);
  const p = path.join(projectAssetsDir(id), removed.filename);
  if (fs.existsSync(p)) fs.rmSync(p);

  writeProject(project);
  res.json({ project });
});
