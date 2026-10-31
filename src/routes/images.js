import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { projectImagesDir, projectExists, readProject, writeProject } from "../store.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = projectImagesDir(req.params.id);
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

export const imagesRouter = Router({ mergeParams: true });

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.message === "UNSUPPORTED_TYPE") {
        return res.status(400).json({
          error:
            "対応していない画像形式です。JPEG・PNG・WebP・GIFのいずれかで、もう一度選び直してください。",
        });
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "画像の容量が大きすぎます（上限8MB）。圧縮するか別の画像でお試しください。",
        });
      }
      return res.status(400).json({
        error: "画像のアップロードに失敗しました。もう一度お試しください。",
      });
    }
    next();
  });
}

imagesRouter.post("/", (req, res) => {
  if (!projectExists(req.params.id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  handleUpload(req, res, () => {
    if (!req.file) {
      return res.status(400).json({ error: "画像ファイルが見つかりませんでした。" });
    }
    const project = readProject(req.params.id);
    const kind = req.body.kind === "finish" ? "finish" : "reference";
    const memo = typeof req.body.memo === "string" ? req.body.memo : "";

    const imageRecord = {
      id: randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      url: `/uploads/${req.params.id}/images/${req.file.filename}`,
    };

    if (kind === "finish") {
      // 既存の完成イメージがあれば古いファイルを削除してから入れ替える
      if (project.images.finish) {
        const oldPath = path.join(projectImagesDir(req.params.id), project.images.finish.filename);
        if (fs.existsSync(oldPath)) fs.rmSync(oldPath);
      }
      project.images.finish = imageRecord;
    } else {
      imageRecord.memo = memo;
      imageRecord.region = null; // { x, y, w, h } 0〜1の相対値。未指定時はnull
      project.images.references.push(imageRecord);
    }

    writeProject(project);
    res.status(201).json({ project });
  });
});

imagesRouter.put("/:imageId", (req, res) => {
  const { id, imageId } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const { memo, region } = req.body ?? {};

  const target = project.images.references.find((img) => img.id === imageId);
  if (!target) {
    return res.status(404).json({ error: "画像が見つかりません。" });
  }
  if (typeof memo === "string") target.memo = memo;
  if (region === null) {
    target.region = null;
  } else if (region && typeof region === "object") {
    const { x, y, w, h } = region;
    const valid = [x, y, w, h].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1
    );
    if (!valid) {
      return res.status(400).json({ error: "範囲の指定が不正です（0〜1の数値で指定してください）。" });
    }
    target.region = { x, y, w, h };
  }

  writeProject(project);
  res.json({ project });
});

imagesRouter.delete("/:imageId", (req, res) => {
  const { id, imageId } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const dir = projectImagesDir(id);

  if (project.images.finish?.id === imageId) {
    const p = path.join(dir, project.images.finish.filename);
    if (fs.existsSync(p)) fs.rmSync(p);
    project.images.finish = null;
    writeProject(project);
    return res.json({ project });
  }

  const idx = project.images.references.findIndex((img) => img.id === imageId);
  if (idx === -1) {
    return res.status(404).json({ error: "画像が見つかりません。" });
  }
  const [removed] = project.images.references.splice(idx, 1);
  const p = path.join(dir, removed.filename);
  if (fs.existsSync(p)) fs.rmSync(p);

  writeProject(project);
  res.json({ project });
});
