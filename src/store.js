import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_ROOT = path.join(__dirname, "..", "data", "projects");

// 教材生成（materialGenerator.jsのTIMEOUT_MS=30分）が、保存前にタブを閉じる等で
// 「生成中」のまま取り残された場合に備えた安全策。この時間を超えていたら読み込み時点で
// 自動的に「生成中ではない」とみなす（ディスクへの書き込みは行わない。実際のクリアは
// サーバー起動時のclearStaleMaterialGenerationStatuses、または次の保存・失敗時に行われる）。
const STALE_GENERATION_MS = 40 * 60 * 1000; // 40分

function ensureDataRoot() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}

export function projectDir(id) {
  return path.join(DATA_ROOT, id);
}

export function projectImagesDir(id) {
  return path.join(projectDir(id), "images");
}

export function materialBackupsDir(id) {
  return path.join(projectDir(id), "material-backups");
}

// 「教材を作り直す」の提案を採用して現在の教材を上書きする直前に、
// 置き換えられる側（採用前の教材）をファイルとして保存しておく。
// 万が一、新しい内容の方が良くなかった場合に、過去の内容を見比べられるようにするための保険。
// アプリの他の保存処理（project.json本体）とは別の、追記専用のバックアップなので、
// 古いものを削除する処理は持たせていない（個人利用規模のツールのため、容量面は現状問題にしない）。
export function writeMaterialBackup(id, snapshot) {
  const dir = materialBackupsDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(dir, `material-backup-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filePath;
}

export function projectFilePath(id) {
  return path.join(projectDir(id), "project.json");
}

export function listProjects() {
  ensureDataRoot();
  if (!fs.existsSync(DATA_ROOT)) return [];
  return fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((id) => {
      try {
        return readProject(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

// 旧バージョンで作成されたproject.jsonにも不足フィールドを補って返す。
export function normalizeProject(project) {
  project.brief = {
    purpose: "",
    target: "",
    problem: "",
    product: "",
    cta: "",
    deadline: "",
    materials: "",
    notes: "",
    ...project.brief,
  };
  project.design = {
    requestText: "",
    summary: null,
    confirmed: false,
    confirmedAt: null,
    ...project.design,
  };
  project.wireframe = {
    generatedAt: null,
    isSample: false,
    basedOn: null,
    sections: [],
    candidates: [],
    ...project.wireframe,
  };
  // 旧バージョンで保存されたセクションにも、後から追加した項目（ctaItems等）を補って返す。
  project.wireframe.sections = (project.wireframe.sections ?? []).map((s) => ({
    ctaText: null,
    ctaItems: [],
    columns: null,
    boundingBox: null,
    hasImage: false,
    observedText: null,
    ...s,
  }));
  project.analysis = {
    sourceImageId: null,
    sourceKind: null,
    analyzedAt: null,
    analyzedBy: null,
    imageDescription: "",
    excludedNote: "",
    colorPalette: "",
    typographySystem: "",
    spacingSystem: "",
    buildApproach: "",
    sections: [],
    confirmed: false,
    confirmedAt: null,
    ...project.analysis,
  };
  project.material = {
    generatedAt: null,
    generatedBy: null,
    scopeNote: "",
    basedOnAnalysisConfirmedAt: null,
    basedOnWireframeGeneratedAt: null,
    chapter: null,
    generationStatus: null,
    pendingRegeneration: null,
    ...project.material,
  };
  if (
    project.material.generationStatus?.state === "generating" &&
    Date.now() - new Date(project.material.generationStatus.startedAt).getTime() > STALE_GENERATION_MS
  ) {
    project.material.generationStatus = null;
  }
  project.assets = project.assets ?? [];
  project.consult = {
    messages: [],
    ...project.consult,
  };
  return project;
}

export function readProject(id) {
  const filePath = projectFilePath(id);
  const raw = fs.readFileSync(filePath, "utf-8");
  return normalizeProject(JSON.parse(raw));
}

export function projectExists(id) {
  return fs.existsSync(projectFilePath(id));
}

export function writeProject(project) {
  ensureDataRoot();
  fs.mkdirSync(projectDir(project.id), { recursive: true });
  fs.mkdirSync(projectImagesDir(project.id), { recursive: true });
  project.updatedAt = new Date().toISOString();
  fs.writeFileSync(projectFilePath(project.id), JSON.stringify(project, null, 2), "utf-8");
  return project;
}

// サーバー起動時に呼ぶ。前回の起動中に教材生成が「生成中」のまま終了した場合
// （プロセス強制終了・クラッシュ等）、CLIの処理そのものも失われているため、
// 「生成中」の状態だけが永久に残ってしまう。起動直後は確実に何も実行中ではないため、
// 残っていればここで必ずクリアする。
// readProject()はSTALE_GENERATION_MSを超えた古い「生成中」をメモリ上では既にnull扱いにするため、
// その戻り値だけを見て判定すると「古いものはディスクに書き込まれないまま」になってしまう。
// ここでは生のファイル内容を見て判定し、ディスク上の実データも確実にクリーンな状態にする。
export function clearStaleMaterialGenerationStatuses() {
  ensureDataRoot();
  if (!fs.existsSync(DATA_ROOT)) return;
  const ids = fs.readdirSync(DATA_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const id of ids) {
    try {
      const raw = JSON.parse(fs.readFileSync(projectFilePath(id), "utf-8"));
      if (raw.material?.generationStatus) {
        const project = readProject(id);
        project.material.generationStatus = null;
        writeProject(project);
      }
    } catch {
      // 読み込めないプロジェクトはスキップ（他の起動処理に影響させない）
    }
  }
}

export function deleteProject(id) {
  const dir = projectDir(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function newProject({ id, name, brief }) {
  const now = new Date().toISOString();
  return {
    id,
    name: name && name.trim() ? name.trim() : "名称未設定プロジェクト",
    createdAt: now,
    updatedAt: now,
    brief: {
      purpose: brief?.purpose ?? "",
      target: brief?.target ?? "",
      problem: brief?.problem ?? "",
      product: brief?.product ?? "",
      cta: brief?.cta ?? "",
      deadline: brief?.deadline ?? "",
      materials: brief?.materials ?? "",
      notes: brief?.notes ?? "",
    },
    design: {
      requestText: "",
      summary: null,
      confirmed: false,
      confirmedAt: null,
    },
    wireframe: {
      generatedAt: null,
      isSample: false,
      basedOn: null,
      sections: [],
    },
    analysis: {
      sourceImageId: null,
      sourceKind: null,
      analyzedAt: null,
      analyzedBy: null,
      imageDescription: "",
      excludedNote: "",
      colorPalette: "",
      typographySystem: "",
      spacingSystem: "",
      buildApproach: "",
      sections: [],
      confirmed: false,
      confirmedAt: null,
    },
    material: {
      generatedAt: null,
      generatedBy: null,
      scopeNote: "",
      basedOnAnalysisConfirmedAt: null,
      basedOnWireframeGeneratedAt: null,
      chapter: null,
      generationStatus: null,
      pendingRegeneration: null,
    },
    assets: [],
    consult: {
      messages: [],
    },
    images: {
      finish: null,
      references: [],
    },
    progress: {
      currentStepIndex: 0,
      maxReachedStepIndex: 0,
    },
  };
}
