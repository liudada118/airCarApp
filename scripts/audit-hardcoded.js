/* eslint-disable no-bitwise */
/**
 * 盘点 src/ 里散着的硬编码颜色和字号，按「能不能自动换成 token」分三档。
 *
 *   npm run audit:hardcoded              # 只出报告
 *   npm run audit:hardcoded -- --fix     # 把第 1 档（精确命中 token）自动替换掉
 *   npm run audit:hardcoded -- --near=8  # 调整第 2 档的色差阈值，默认 6
 *
 * 只改第 1 档。第 2 档（近似但不相等）一定要人看过再决定，多半是历史手抄误差，
 * 也可能是设计上真的要区分——脚本没资格替你判断。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const THEME_DIR = path.join(SRC, 'theme');

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const NEAR = (() => {
  const a = args.find((x) => x.startsWith('--near='));
  return a ? Number(a.slice(7)) : 6;
})();

/* ------------------------------------------------------------------ 取 token */

/** 直接从主题源码里正则抠出 key → 色值，省得为了跑脚本还要先编译 TS */
function loadColorTokens() {
  const files = [
    path.join(THEME_DIR, 'colors.ts'),
    path.join(THEME_DIR, 'generated', 'colors.ts'),
  ];
  const tokens = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    // key 可能是中文（generated 里按设计稿样式名推导的），所以走 unicode 类
    const re = /^\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*:\s*'(#[0-9a-fA-F]{3,8})'/gmu;
    let m;
    while ((m = re.exec(text))) {
      // generated 后加载，同名时压过基线值，和 src/theme/index.ts 的合并顺序一致
      const existing = tokens.findIndex((t) => t.key === m[1]);
      const entry = {key: m[1], hex: normalizeHex(m[2])};
      if (existing >= 0) tokens[existing] = entry;
      else tokens.push(entry);
    }
  }
  return tokens;
}

function normalizeHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length === 8) h = h.slice(0, 6); // 忽略 alpha 通道，只比 RGB
  return ('#' + h).toUpperCase();
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 简单欧氏色差就够了，这里只是为了把「手抄错一位」的挑出来 */
function colorDistance(a, b) {
  const x = rgb(a);
  const y = rgb(b);
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}

/* ------------------------------------------------------------------ 扫文件 */

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'generated' || name === 'assets' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !full.startsWith(THEME_DIR)) {
      out.push(full);
    }
  }
  return out;
}

function scan() {
  const files = walk(SRC, []);
  const colorHits = new Map(); // hex → [{file, line}]
  const fontHits = new Map(); // size → [{file, line}]

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const colorRe = /'(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8})'/g;
      let m;
      while ((m = colorRe.exec(line))) {
        const hex = normalizeHex(m[1]);
        if (!colorHits.has(hex)) colorHits.set(hex, []);
        colorHits.get(hex).push({file, line: i + 1, raw: m[1]});
      }
      const fontRe = /\bfontSize:\s*(\d+(?:\.\d+)?)/g;
      while ((m = fontRe.exec(line))) {
        const size = Number(m[1]);
        if (!fontHits.has(size)) fontHits.set(size, []);
        fontHits.get(size).push({file, line: i + 1});
      }
    });
  }
  return {colorHits, fontHits, fileCount: files.length};
}

/* ------------------------------------------------------------------ 分档 */

function classify(colorHits, tokens) {
  const exact = [];
  const near = [];
  const orphan = [];

  for (const [hex, hits] of colorHits) {
    const hit = tokens.find((t) => t.hex === hex);
    if (hit) {
      exact.push({hex, key: hit.key, hits});
      continue;
    }
    const ranked = tokens
      .map((t) => ({...t, d: colorDistance(hex, t.hex)}))
      .sort((a, b) => a.d - b.d);
    if (ranked.length && ranked[0].d <= NEAR) near.push({hex, hits, closest: ranked[0]});
    else orphan.push({hex, hits, closest: ranked[0] || null});
  }

  const bySize = (a, b) => b.hits.length - a.hits.length;
  return {exact: exact.sort(bySize), near: near.sort(bySize), orphan: orphan.sort(bySize)};
}

/* ------------------------------------------------------------------ 自动替换 */

/** 已经 import 了主题就沿用，没有就补一行 import */
function ensureThemeImport(text, file) {
  if (/from\s+['"][^'"]*\/theme['"]/.test(text)) {
    // 已有 import，确认 Colors 在里面
    return text.replace(
      /import\s*\{([^}]*)\}\s*from\s*(['"][^'"]*\/theme['"])/,
      (full, names, from) => {
        const list = names.split(',').map((s) => s.trim()).filter(Boolean);
        if (list.includes('Colors')) return full;
        list.unshift('Colors');
        return `import {${list.join(', ')}} from ${from}`;
      }
    );
  }
  const relPath = path
    .relative(path.dirname(file), THEME_DIR)
    .split(path.sep)
    .join('/');
  const spec = relPath.startsWith('.') ? relPath : './' + relPath;
  const lines = text.split(/\r?\n/);
  // 插在最后一条 import 之后，保持 import 块聚在一起
  let last = -1;
  for (let i = 0; i < lines.length; i++) if (/^import\s/.test(lines[i])) last = i;
  lines.splice(last + 1, 0, `import {Colors} from '${spec}';`);
  return lines.join('\n');
}

function applyFix(exact) {
  const perFile = new Map();
  for (const group of exact) {
    for (const hit of group.hits) {
      if (!perFile.has(hit.file)) perFile.set(hit.file, []);
      perFile.get(hit.file).push({raw: hit.raw, key: group.key});
    }
  }

  let replaced = 0;
  for (const [file, subs] of perFile) {
    let text = fs.readFileSync(file, 'utf8');
    const seen = new Set();
    for (const s of subs) {
      if (seen.has(s.raw)) continue;
      seen.add(s.raw);
      const re = new RegExp("'" + s.raw + "'", 'g');
      const before = text;
      text = text.replace(re, `Colors.${s.key}`);
      if (text !== before) replaced += (before.match(re) || []).length;
    }
    text = ensureThemeImport(text, file);
    fs.writeFileSync(file, text, 'utf8');
    console.log(`  改写 ${path.relative(ROOT, file)}`);
  }
  return replaced;
}

/* ------------------------------------------------------------------ 报告 */

function rel(f) {
  return path.relative(ROOT, f).split(path.sep).join('/');
}

function listHits(hits, limit) {
  const shown = hits.slice(0, limit).map((h) => `${rel(h.file)}:${h.line}`);
  if (hits.length > limit) shown.push(`…还有 ${hits.length - limit} 处`);
  return shown.join(', ');
}

function main() {
  const tokens = loadColorTokens();
  if (!tokens.length) {
    console.error('[audit] 没在 src/theme 里读到任何颜色 token，先跑 npm run gen:theme');
    process.exit(1);
  }

  const {colorHits, fontHits, fileCount} = scan();
  const {exact, near, orphan} = classify(colorHits, tokens);
  const total = [...colorHits.values()].reduce((n, h) => n + h.length, 0);

  console.log(`[audit] 扫了 ${fileCount} 个文件，${total} 处硬编码颜色，token 库里有 ${tokens.length} 个色值\n`);

  console.log(`一档 · 精确命中 token，可自动替换（${exact.length} 个色值）`);
  exact.forEach((g) =>
    console.log(`  ${g.hex} → Colors.${g.key}   ${g.hits.length} 处   ${listHits(g.hits, 3)}`)
  );
  if (!exact.length) console.log('  （无）');

  console.log(`\n二档 · 和 token 很接近但不相等，需要人工确认（${near.length} 个色值，色差阈值 ${NEAR}）`);
  near.forEach((g) =>
    console.log(
      `  ${g.hex} ≈ Colors.${g.closest.key}(${g.closest.hex}) 差 ${g.closest.d.toFixed(1)}   ${g.hits.length} 处   ${listHits(g.hits, 3)}`
    )
  );
  if (!near.length) console.log('  （无）');

  console.log(`\n三档 · token 里没有对应色值（${orphan.length} 个色值）`);
  orphan.forEach((g) =>
    console.log(`  ${g.hex}   ${g.hits.length} 处   ${listHits(g.hits, 3)}`)
  );
  if (!orphan.length) console.log('  （无）');

  const fontTotal = [...fontHits.values()].reduce((n, h) => n + h.length, 0);
  console.log(`\n字号 · ${fontTotal} 处 fontSize 字面量`);
  [...fontHits.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([size, hits]) => console.log(`  ${size}px   ${hits.length} 处   ${listHits(hits, 2)}`));

  if (FIX) {
    if (!exact.length) {
      console.log('\n[audit] --fix：一档为空，没什么可改的');
      return;
    }
    console.log('\n[audit] --fix：开始替换一档');
    const n = applyFix(exact);
    console.log(`[audit] 替换了 ${n} 处，接着跑 npx tsc --noEmit && npm run lint，然后 git diff 逐个看过`);
  } else if (exact.length) {
    console.log('\n[audit] 想自动替换一档：npm run audit:hardcoded -- --fix');
  }
}

module.exports = {loadColorTokens, normalizeHex, colorDistance};

if (require.main === module) main();
