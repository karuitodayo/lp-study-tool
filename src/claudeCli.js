import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Claude Code CLI（claude.exe）の実体パスを解決する。
// サブスク（OAuth）ログインをそのまま使うため、npmのシェルラッパー(claude.cmd/.ps1)経由にせず、
// 実体のexeを直接spawnできるパスを特定する（shell:falseでの起動を可能にするため）。
let cachedPath;

export function resolveClaudeCliPath() {
  if (cachedPath !== undefined) return cachedPath;

  // 1. 利用者が明示的に指定した場合はそれを使う
  const fromEnv = process.env.CLAUDE_CLI_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    cachedPath = fromEnv;
    return cachedPath;
  }

  // 2. npmのグローバルインストール先から実体exeを探す
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const candidate = path.join(npmRoot, "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (fs.existsSync(candidate)) {
      cachedPath = candidate;
      return cachedPath;
    }
  } catch {
    // npmが見つからない場合は次の手段へ
  }

  // 3. 見つからない場合はPATH上の"claude"をシェル経由で呼ぶ（最終手段）
  cachedPath = null;
  return cachedPath;
}
