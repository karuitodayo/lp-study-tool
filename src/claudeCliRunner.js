import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolveClaudeCliPath } from "./claudeCli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src の2階層上（リポジトリルート）。npm workspaces経由だとprocess.cwd()が
// server/ になってしまうため、process.cwd()に依存せず__dirname基準で解決する。
export const REPO_ROOT = path.join(__dirname, "..", "..");

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024; // 想定外の大量出力からサーバーを守る

// Skillツール（frontend-designなど）が実際に呼ばれたかどうかの監査ログ。
// プロジェクトデータとは別に、CLI呼び出し全体（教材生成・相談欄）を横断して追記する。
const SKILL_LOG_PATH = path.join(REPO_ROOT, "server", "data", "skill-invocations.log");

// Claude Code CLI呼び出し結果の種別。利用上限・未ログイン・CLI未検出・タイムアウト・失敗を区別する。
export class ClaudeCliError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "cli_not_found" | "not_logged_in" | "usage_limit" | "timeout" | "failed"
  }
}

// Claude Code CLIを非対話モード（stream-json・最小権限）で1回だけ呼び出し、テキスト応答を返す。
// message: {type:"user", message:{role:"user", content:[...]}} 形式（画像添付可）。
export function runClaudeCli({ message, systemPrompt, tools = "", timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const exePath = resolveClaudeCliPath();
    const command = exePath ?? "claude";
    const useShell = !exePath;

    const args = [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--tools",
      tools,
      // --tools は「使える道具の一覧」を絞るだけで、--permission-mode dontAsk + --permission-prompts none
      // （許可が必要な操作は自動的に拒否される）の下でも許可なく呼べることまでは保証しない。
      // Skillの呼び出しが許可の壁で黙って拒否されないよう、--toolsで渡した道具をそのまま明示的に許可する。
      ...(tools ? ["--allowedTools", tools] : []),
      "--strict-mcp-config",
      "--permission-mode",
      "dontAsk",
      "--permission-prompts",
      "none",
      "--append-system-prompt",
      systemPrompt,
    ];

    // APIキーが環境にあっても、このサブプロセスには渡さない（サブスク/OAuth認証のみを使う）。
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    let child;
    try {
      child = spawn(command, args, {
        cwd: REPO_ROOT,
        env,
        shell: useShell,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      reject(new ClaudeCliError("cli_not_found", "Claude Code CLIを起動できませんでした。"));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let outputBytes = 0;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new ClaudeCliError("timeout", "応答がタイムアウトしました。もう一度お試しください。"));
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new ClaudeCliError(
            "cli_not_found",
            "Claude Code CLIが見つかりません。インストール状況をご確認ください。"
          )
        );
      } else {
        reject(new ClaudeCliError("failed", "処理の起動に失敗しました。"));
      }
    });

    child.stdout.on("data", (d) => {
      outputBytes += d.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill();
          reject(new ClaudeCliError("failed", "想定外に大きな応答のため中断しました。"));
        }
        return;
      }
      stdout += d.toString("utf-8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf-8");
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Skillの呼び出し有無は、本来の処理結果（成功・失敗）に関わらず記録する
      // （失敗した場合に「呼ばれなかったから失敗したのか」を区別できるようにするため）。
      const skillCalls = tools.includes("Skill") ? extractSkillToolUses(stdout) : [];
      try {
        const result = parseResult(stdout, stderr, code);
        logSkillInvocation({ tools, skillCalls, ok: true });
        resolve(result);
      } catch (err) {
        logSkillInvocation({
          tools,
          skillCalls,
          ok: false,
          errorKind: err instanceof ClaudeCliError ? err.kind : "failed",
        });
        reject(err instanceof ClaudeCliError ? err : new ClaudeCliError("failed", err.message));
      }
    });

    const line = JSON.stringify(message) + "\n";
    child.stdin.write(line, "utf-8");
    child.stdin.end();
  });
}

// stream-json出力（--verbose）の中から、Skillツールの呼び出し（tool_useブロック）を抜き出す。
// Claude Code CLIのassistantメッセージは、こちらが送る入力メッセージと同じ形
// （{"type":"assistant","message":{"role":"assistant","content":[...]}}、contentの各要素が
// {"type":"tool_use","name":"Skill","input":{...}}）で1行ずつ流れてくる想定。
// 形式が想定と違っていても（将来のCLIバージョン変更等）例外を投げず、単に検出0件として扱う。
function extractSkillToolUses(stdout) {
  const calls = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const content = obj?.message?.content;
    if (obj?.type !== "assistant" || !Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use" && block.name === "Skill") {
        calls.push(block.input ?? null);
      }
    }
  }
  return calls;
}

// Skillツールが実際に呼ばれたかどうかの監査ログを1行追記する。
// あくまで確認用の記録であり、書き込みに失敗しても本来の処理（教材生成・相談欄の応答）は止めない。
function logSkillInvocation({ tools, skillCalls, ok, errorKind }) {
  try {
    fs.mkdirSync(path.dirname(SKILL_LOG_PATH), { recursive: true });
    const entry = {
      at: new Date().toISOString(),
      tools,
      skillInvoked: skillCalls.length > 0,
      skillCalls,
      ok,
      ...(errorKind ? { errorKind } : {}),
    };
    fs.appendFileSync(SKILL_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // ログの書き込み失敗は無視する（監査用の付随機能のため）
  }
}

function parseResult(stdout, stderr, exitCode) {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let resultLine = null;
  let sawRateLimitBlocked = false;

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type === "result") {
      resultLine = obj;
    }
    if (obj.type === "rate_limit_event" && obj.rate_limit_info?.status && obj.rate_limit_info.status !== "allowed") {
      sawRateLimitBlocked = true;
    }
  }

  const stderrSnippet = stderr.slice(0, 500);

  if (sawRateLimitBlocked) {
    throw new ClaudeCliError("usage_limit", "利用上限に達しています。しばらくしてからお試しください。");
  }

  if (/not logged in|please run \/login|authentication/i.test(stderrSnippet)) {
    throw new ClaudeCliError("not_logged_in", "Claude Codeにログインしていません。ログイン状態をご確認ください。");
  }

  if (!resultLine) {
    if (exitCode !== 0) {
      throw new ClaudeCliError("failed", "処理が失敗しました。もう一度お試しください。");
    }
    throw new ClaudeCliError("failed", "応答を読み取れませんでした。もう一度お試しください。");
  }

  if (resultLine.is_error) {
    const text = String(resultLine.result ?? "");
    if (/usage limit|rate limit|quota/i.test(text)) {
      throw new ClaudeCliError("usage_limit", "利用上限に達しています。しばらくしてからお試しください。");
    }
    if (/login|authentic|unauthorized/i.test(text)) {
      throw new ClaudeCliError("not_logged_in", "Claude Codeにログインしていません。ログイン状態をご確認ください。");
    }
    throw new ClaudeCliError("failed", "処理でエラーが発生しました。もう一度お試しください。");
  }

  return String(resultLine.result ?? "").trim();
}
