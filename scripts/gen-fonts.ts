/**
 * 从 Sarasa Mono J 源字体里只抽出站点实际用到的 CJK 字符，输出极小的
 * woff2 自托管，保证 Mac / Windows 渲染完全一致。
 *
 * 流程：
 *   1. 扫 src/**\/*.{ts,tsx,json} 抽出所有非 ASCII 字符
 *   2. 调 pyftsubset 从 Sarasa-Regular.ttc 的 Mono J 子字体 subset
 *   3. 输出到 public/fonts/cjk-mono.woff2
 *
 * 源 ttc (~80MB) 通过 .gitignore 排除；CI 上没源字体也没 pyftsubset，
 * 脚本会静默 skip，构建用 commit 进 git 的 woff2 产物。
 *
 * 本地依赖：python venv + fontTools + brotli
 *   python3 -m venv /tmp/fontvenv
 *   /tmp/fontvenv/bin/pip install fonttools brotli
 * （或自行安装到别处，用 PYFTSUBSET 环境变量指向 pyftsubset 可执行文件）
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "scripts/font-sources/Sarasa-Regular.ttc");
const OUTPUT = join(ROOT, "public/fonts/cjk-mono.woff2");
const CHARS_FILE = join(tmpdir(), "kissa-cjk-chars.txt");
const PYFTSUBSET = process.env.PYFTSUBSET ?? "/tmp/fontvenv/bin/pyftsubset";
// Sarasa-Regular.ttc 中 Sarasa Mono J Regular 的 font index
// （Sarasa Gothic / UI / Mono CL/SC/TC/HC/J/K 顺序，Mono J 落在 16）
const SARASA_MONO_J_INDEX = 16;

function listFiles(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (exts.some((e) => p.endsWith(e))) out.push(p);
    }
  }
  walk(dir);
  return out;
}

function collectChars(): string {
  const files = listFiles(join(ROOT, "src"), [".tsx", ".ts", ".json"]);
  const chars = new Set<string>();
  for (const f of files) {
    const text = readFileSync(f, "utf-8");
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && cp > 127) chars.add(ch);
    }
  }
  return Array.from(chars).sort().join("");
}

if (!existsSync(SOURCE)) {
  console.log(`[gen-fonts] source ttc not found (${SOURCE}); skipping`);
  process.exit(0);
}

if (!existsSync(PYFTSUBSET)) {
  console.log(
    `[gen-fonts] pyftsubset not found (${PYFTSUBSET}); skipping. ` +
      `set PYFTSUBSET env var to override.`,
  );
  process.exit(0);
}

const text = collectChars();
writeFileSync(CHARS_FILE, text, "utf-8");
mkdirSync(join(ROOT, "public/fonts"), { recursive: true });

console.log(
  `[gen-fonts] subsetting ${text.length} unique non-ASCII codepoints from Sarasa Mono J`,
);

const result = spawnSync(
  PYFTSUBSET,
  [
    SOURCE,
    `--font-number=${SARASA_MONO_J_INDEX}`,
    `--output-file=${OUTPUT}`,
    "--flavor=woff2",
    `--text-file=${CHARS_FILE}`,
    "--layout-features=*",
    "--no-hinting",
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  console.error("[gen-fonts] pyftsubset failed");
  process.exit(1);
}

const stats = statSync(OUTPUT);
console.log(
  `[gen-fonts] wrote ${OUTPUT} (${(stats.size / 1024).toFixed(1)} KB)`,
);
