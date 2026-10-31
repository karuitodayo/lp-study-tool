import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { projectDir, projectExists, readProject, writeProject } from "../store.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export function projectWireframeCandidatesDir(id) {
  return path.join(projectDir(id), "wireframe-candidates");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = projectWireframeCandidatesDir(req.params.id);
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

export const wireframeCandidatesRouter = Router({ mergeParams: true });

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.message === "UNSUPPORTED_TYPE") {
        return res.status(400).json({
          error: "対応していない画像形式です。JPEG・PNG・WebP・GIFのいずれかで、もう一度選び直してください。",
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

// 外部で見つけた・作った別案のワイヤーフレーム画像を登録する（完成イメージ・参考画像・実装用素材とは別の保管場所）。
// 完成イメージ画像＝色・雰囲気の参考、こちらの採用案＝配置・構成の基準、として教材生成時に役割を分けて使う。
wireframeCandidatesRouter.post("/", (req, res) => {
  if (!projectExists(req.params.id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  handleUpload(req, res, () => {
    if (!req.file) {
      return res.status(400).json({ error: "画像ファイルが見つかりませんでした。" });
    }
    const project = readProject(req.params.id);
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";

    const record = {
      id: randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      url: `/uploads/${req.params.id}/wireframe-candidates/${req.file.filename}`,
      note,
      selected: false,
    };
    project.wireframe.candidates.push(record);
    writeProject(project);
    res.status(201).json({ project });
  });
});

wireframeCandidatesRouter.put("/:candidateId", (req, res) => {
  const { id, candidateId } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const target = project.wireframe.candidates.find((c) => c.id === candidateId);
  if (!target) {
    return res.status(404).json({ error: "別案の画像が見つかりません。" });
  }
  const { note, selected } = req.body ?? {};
  if (typeof note === "string") target.note = note;
  if (typeof selected === "boolean") {
    // 教材生成の基準にする案は1件だけにする。
    if (selected) {
      project.wireframe.candidates.forEach((c) => {
        c.selected = c.id === candidateId;
      });
    } else {
      target.selected = false;
    }
  }

  writeProject(project);
  res.json({ project });
});

wireframeCandidatesRouter.delete("/:candidateId", (req, res) => {
  const { id, candidateId } = req.params;
  if (!projectExists(id)) {
    return res.status(404).json({ error: "プロジェクトが見つかりません。" });
  }
  const project = readProject(id);
  const idx = project.wireframe.candidates.findIndex((c) => c.id === candidateId);
  if (idx === -1) {
    return res.status(404).json({ error: "別案の画像が見つかりません。" });
  }
  const [removed] = project.wireframe.candidates.splice(idx, 1);
  const p = path.join(projectWireframeCandidatesDir(id), removed.filename);
  if (fs.existsSync(p)) fs.rmSync(p);

  writeProject(project);
  res.json({ project });
});
