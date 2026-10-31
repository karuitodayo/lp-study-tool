import type { ConsultMessage, MaterialChapter, MaterialStep, Project, ProjectSummary, Region } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = "通信エラーが発生しました。";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // JSONでない場合はデフォルトメッセージのまま
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => request<{ projects: ProjectSummary[] }>("/api/projects"),

  createProject: (name: string, brief?: Partial<Project["brief"]>) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, brief }),
    }),

  getProject: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),

  updateProject: (
    id: string,
    patch: {
      name?: string;
      brief?: Partial<Project["brief"]>;
      progress?: Partial<Project["progress"]>;
      design?: Partial<Project["design"]>;
      wireframe?: Partial<Project["wireframe"]>;
    }
  ) =>
    request<{ project: Project }>(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  generateDesignSummary: (id: string) =>
    request<{ project: Project }>(`/api/projects/${id}/design/generate`, { method: "POST" }),

  generateWireframe: (id: string, source: "brief" | "finish_image" | "analysis") =>
    request<{ project: Project }>(`/api/projects/${id}/wireframe/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }),

  saveAnalysis: (id: string, patch: Partial<Project["analysis"]>) =>
    request<{ project: Project }>(`/api/projects/${id}/analysis`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  saveMaterial: (id: string, patch: Partial<Project["material"]>) =>
    request<{ project: Project }>(`/api/projects/${id}/material`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  uploadImage: (id: string, file: File, kind: "finish" | "reference", memo?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    if (memo) form.append("memo", memo);
    return request<{ project: Project }>(`/api/projects/${id}/images`, {
      method: "POST",
      body: form,
    });
  },

  updateImage: (
    id: string,
    imageId: string,
    patch: { memo?: string; region?: Region | null }
  ) =>
    request<{ project: Project }>(`/api/projects/${id}/images/${imageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteImage: (id: string, imageId: string) =>
    request<{ project: Project }>(`/api/projects/${id}/images/${imageId}`, {
      method: "DELETE",
    }),

  uploadAsset: (
    id: string,
    file: File,
    meta: { name: string; purpose?: string; suggestedFileName?: string; slotKey?: string | null }
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("name", meta.name);
    if (meta.purpose) form.append("purpose", meta.purpose);
    if (meta.suggestedFileName) form.append("suggestedFileName", meta.suggestedFileName);
    if (meta.slotKey) form.append("slotKey", meta.slotKey);
    return request<{ project: Project }>(`/api/projects/${id}/assets`, {
      method: "POST",
      body: form,
    });
  },

  updateAsset: (
    id: string,
    assetId: string,
    patch: { name?: string; purpose?: string; suggestedFileName?: string; slotKey?: string | null }
  ) =>
    request<{ project: Project }>(`/api/projects/${id}/assets/${assetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteAsset: (id: string, assetId: string) =>
    request<{ project: Project }>(`/api/projects/${id}/assets/${assetId}`, {
      method: "DELETE",
    }),

  uploadWireframeCandidate: (id: string, file: File, note?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (note) form.append("note", note);
    return request<{ project: Project }>(`/api/projects/${id}/wireframe/candidates`, {
      method: "POST",
      body: form,
    });
  },

  updateWireframeCandidate: (id: string, candidateId: string, patch: { note?: string; selected?: boolean }) =>
    request<{ project: Project }>(`/api/projects/${id}/wireframe/candidates/${candidateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteWireframeCandidate: (id: string, candidateId: string) =>
    request<{ project: Project }>(`/api/projects/${id}/wireframe/candidates/${candidateId}`, {
      method: "DELETE",
    }),

  getSampleMaterial: () => request<{ chapter: MaterialChapter }>("/api/sample-material"),

  getGeminiStatus: () => request<{ configured: boolean; model: string }>("/api/projects/_gemini/status"),

  // Gemini APIによる画像分析。結果はまだ保存されない（呼び出し側がsaveAnalysisで保存するかを判断する）。
  // 成否にかかわらずエラー内容を見て案内を出し分けたいため、汎用のrequest()は使わずここで直接fetchする。
  generateAnalysisFromImage: async (
    id: string
  ): Promise<{ ok: boolean; error?: string; proposal?: Partial<Project["analysis"]> }> => {
    const res = await fetch(`/api/projects/${id}/analysis/generate`, { method: "POST" });
    let data: { error?: string; proposal?: Partial<Project["analysis"]> } = {};
    try {
      data = await res.json();
    } catch {
      // JSONでない場合は下のデフォルト値のまま
    }
    return { ok: res.ok, error: data.error, proposal: data.proposal };
  },

  // 教材生成（Claude Code CLI経由）。
  // 既存の教材がある場合（＝作り直し）は、ここでは保存されない。サーバー側が提案を
  // project.material.pendingRegenerationとして保持するので、返ってくるprojectにそれが含まれる。
  // 比較・採用はadoptMaterialRegeneration、破棄はdiscardMaterialRegenerationで行う。
  // 教材がまだない場合（初回作成）は比較の対象がないため、呼び出し側がこれまで通りsaveMaterialで保存する。
  generateMaterial: async (
    id: string,
    options?: { scopeNote?: string; carryOverAnimations?: boolean }
  ): Promise<{ ok: boolean; error?: string; proposal?: Project["material"]; project?: Project }> => {
    const res = await fetch(`/api/projects/${id}/material/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeNote: options?.scopeNote,
        carryOverAnimations: options?.carryOverAnimations ?? false,
      }),
    });
    let data: { error?: string; proposal?: Project["material"]; project?: Project } = {};
    try {
      data = await res.json();
    } catch {
      // JSONでない場合は下のデフォルト値のまま
    }
    return { ok: res.ok, error: data.error, proposal: data.proposal, project: data.project };
  },

  // 「教材を作り直す」の提案を採用する：置き換えられる現在の教材はサーバー側で
  // バックアップとして保存されてから上書きされる。
  adoptMaterialRegeneration: async (id: string): Promise<{ ok: boolean; error?: string; project?: Project }> => {
    const res = await fetch(`/api/projects/${id}/material/adopt-regeneration`, { method: "POST" });
    let data: { error?: string; project?: Project } = {};
    try {
      data = await res.json();
    } catch {
      // JSONでない場合は下のデフォルト値のまま
    }
    return { ok: res.ok, error: data.error, project: data.project };
  },

  // 「教材を作り直す」の提案を破棄する：現在の教材には一切触れない。
  discardMaterialRegeneration: async (id: string): Promise<{ ok: boolean; error?: string; project?: Project }> => {
    const res = await fetch(`/api/projects/${id}/material/discard-regeneration`, { method: "POST" });
    let data: { error?: string; project?: Project } = {};
    try {
      data = await res.json();
    } catch {
      // JSONでない場合は下のデフォルト値のまま
    }
    return { ok: res.ok, error: data.error, project: data.project };
  },

  // 教材1手順の修正案（Claude Code CLI経由）。相談しただけでは保存されない。
  reviseMaterialStep: async (
    id: string,
    stepId: string,
    instruction: string
  ): Promise<{ ok: boolean; error?: string; stepIndex?: number; step?: MaterialStep }> => {
    const res = await fetch(`/api/projects/${id}/material/revise-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId, instruction }),
    });
    let data: { error?: string; stepIndex?: number; step?: MaterialStep } = {};
    try {
      data = await res.json();
    } catch {
      // JSONでない場合は下のデフォルト値のまま
    }
    return { ok: res.ok, error: data.error, stepIndex: data.stepIndex, step: data.step };
  },

  getConsultMessages: (id: string) =>
    request<{ messages: ConsultMessage[] }>(`/api/projects/${id}/consult`),

  // 相談の送信。成否にかかわらず更新後の履歴(messages)を受け取りたいため、
  // 汎用のrequest()ではなくここで直接fetchしてレスポンス本文を読む。
  postConsult: async (
    id: string,
    question: string
  ): Promise<{ ok: boolean; error?: string; messages: ConsultMessage[] }> => {
    const res = await fetch(`/api/projects/${id}/consult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    let data: { error?: string; messages?: ConsultMessage[] } = {};
    try {
      data = await res.json();
    } catch {
      // JSONでない場合は下のデフォルト値のまま
    }
    return {
      ok: res.ok,
      error: data.error,
      messages: data.messages ?? [],
    };
  },
};
