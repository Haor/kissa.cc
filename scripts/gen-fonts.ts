/**
 * 把站点用到的字体 subset 成极小的 woff2 自托管，保证 Mac / Windows 渲染一致，
 * 同时把首屏字体体积从 ~3MB（Iosevka 全量 × 3 字重）压到几十 KB。
 *
 * 三组字体：
 *   - CJK Mono   ← Sarasa Mono J（scripts/font-sources/Sarasa-Regular.ttc，gitignore）
 *   - Iosevka    ← @fontsource/iosevka（node_modules）  机器之声：HUD / 标签 / 字符场 atlas
 *   - Cormorant  ← @fontsource/cormorant（node_modules）梦之声：italic 展示标题
 *
 * 字符集 = 可打印 ASCII + 扫 src/**\/*.{ts,tsx,json} 抽出的所有非 ASCII 字符
 * （注释先剥掉；字体里没有的字 pyftsubset 会自动忽略）。
 *
 * CI 上没有 pyftsubset（也可能没有 Sarasa 源），脚本会静默 skip 对应项，
 * 构建用 commit 进 git 的 woff2 产物。
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
const OUT_DIR = join(ROOT, "public/fonts");
const PYFTSUBSET = process.env.PYFTSUBSET ?? "/tmp/fontvenv/bin/pyftsubset";
// Sarasa-Regular.ttc 中 Sarasa Mono J Regular 的 font index
// （Sarasa Gothic / UI / Mono CL/SC/TC/HC/J/K 顺序，Mono J 落在 16）
const SARASA_MONO_J_INDEX = 16;

type Job = {
  /** 源字体路径 */
  source: string;
  /** 输出文件名（public/fonts/ 下） */
  output: string;
  /** TTC 内的 font index */
  fontNumber?: number;
  /** 只保留非 ASCII（CJK subset 不需要拉丁字符，那部分走 Iosevka） */
  nonAsciiOnly?: boolean;
};

const IOSEVKA = join(ROOT, "node_modules/@fontsource/iosevka/files");
const CORMORANT = join(ROOT, "node_modules/@fontsource/cormorant/files");

const JOBS: Job[] = [
  {
    source: join(ROOT, "scripts/font-sources/Sarasa-Regular.ttc"),
    output: "cjk-mono.woff2",
    fontNumber: SARASA_MONO_J_INDEX,
    nonAsciiOnly: true,
  },
  { source: join(IOSEVKA, "iosevka-latin-400-normal.woff2"), output: "iosevka-400.woff2" },
  { source: join(IOSEVKA, "iosevka-latin-500-normal.woff2"), output: "iosevka-500.woff2" },
  { source: join(IOSEVKA, "iosevka-latin-700-normal.woff2"), output: "iosevka-700.woff2" },
  { source: join(CORMORANT, "cormorant-latin-400-italic.woff2"), output: "cormorant-400-italic.woff2" },
  { source: join(CORMORANT, "cormorant-latin-500-italic.woff2"), output: "cormorant-500-italic.woff2" },
];

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

function collectNonAscii(): string {
  const files = listFiles(join(ROOT, "src"), [".tsx", ".ts", ".json"]).filter(
    (f) => !f.endsWith(".schema.json"),
  );
  const chars = new Set<string>();
  for (const f of files) {
    let text = readFileSync(f, "utf-8");
    // 源码里的中文注释不会显示在页面上，剥掉再收集（否则 CJK subset 白白多出几十 KB）
    if (!f.endsWith(".json")) {
      text = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    }
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && cp > 127) chars.add(ch);
    }
  }
  return Array.from(chars).sort().join("");
}

if (!existsSync(PYFTSUBSET)) {
  console.log(
    `[gen-fonts] pyftsubset not found (${PYFTSUBSET}); skipping. ` +
      `set PYFTSUBSET env var to override.`,
  );
  process.exit(0);
}

const nonAscii = collectNonAscii();
let ascii = "";
for (let cp = 0x20; cp < 0x7f; cp++) ascii += String.fromCharCode(cp);

mkdirSync(OUT_DIR, { recursive: true });

for (const job of JOBS) {
  if (!existsSync(job.source)) {
    console.log(`[gen-fonts] source not found (${job.source}); skipping ${job.output}`);
    continue;
  }
  const text = job.nonAsciiOnly ? nonAscii : ascii + nonAscii;
  const charsFile = join(tmpdir(), `kissa-chars-${job.output}.txt`);
  writeFileSync(charsFile, text, "utf-8");
  const output = join(OUT_DIR, job.output);
  const result = spawnSync(
    PYFTSUBSET,
    [
      job.source,
      ...(job.fontNumber !== undefined ? [`--font-number=${job.fontNumber}`] : []),
      `--output-file=${output}`,
      "--flavor=woff2",
      `--text-file=${charsFile}`,
      "--layout-features=*",
      "--no-hinting",
      "--desubroutinize",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`[gen-fonts] pyftsubset failed for ${job.output}`);
    process.exit(1);
  }
  const kb = (statSync(output).size / 1024).toFixed(1);
  console.log(`[gen-fonts] ${job.output.padEnd(28)} ${kb} KB`);
}
