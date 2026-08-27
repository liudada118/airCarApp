/**
 * 从 MasterGo 插件拿到的 JSON → design/design-tokens.json → 重新生成 src/theme/generated/
 *
 *   npm run sync:design                    # 从剪贴板读（插件里点「复制到剪贴板」）
 *   npm run sync:design -- --from=file     # 从下载目录里最新的 design-tokens*.json 读
 *   npm run sync:design -- --file=D:\x.json
 *   npm run sync:design -- --dry           # 只看 diff，不落盘
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');
const {generate} = require('./gen-theme');

const ROOT = path.join(__dirname, '..');
const TOKENS_FILE = path.join(ROOT, 'design', 'design-tokens.json');

/* ------------------------------------------------------------------ 参数 */

function parseArgs(argv) {
  const out = {from: 'clipboard', file: null, dry: false};
  for (const a of argv) {
    if (a === '--dry') out.dry = true;
    else if (a.startsWith('--from=')) out.from = a.slice(7);
    else if (a.startsWith('--file=')) {
      out.file = a.slice(7);
      out.from = 'file';
    }
  }
  return out;
}

/* ------------------------------------------------------------------ 读取 */

function readClipboard() {
  if (process.platform === 'win32') {
    // 必须显式指定 UTF-8，否则中文样式名会变成问号
    return execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw',
      ],
      {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}
    );
  }
  if (process.platform === 'darwin') {
    return execFileSync('pbpaste', {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  }
  return execFileSync('xclip', ['-selection', 'clipboard', '-o'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** 没指定路径时，去下载目录找最新的 design-tokens*.json */
function findDownloaded() {
  const candidates = [
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), '下载'),
  ].filter((d) => fs.existsSync(d));

  let best = null;
  for (const dir of candidates) {
    for (const name of fs.readdirSync(dir)) {
      if (!/^design-tokens.*\.json$/i.test(name)) continue;
      const full = path.join(dir, name);
      const mtime = fs.statSync(full).mtimeMs;
      if (!best || mtime > best.mtime) best = {full, mtime};
    }
  }
  if (!best) {
    throw new Error(
      '下载目录里没找到 design-tokens*.json。先在 MasterGo 插件里点「下载 JSON」，或用 --file= 指定路径。'
    );
  }
  return best.full;
}

function loadIncoming(args) {
  let text;
  let origin;

  if (args.from === 'file') {
    const file = args.file || findDownloaded();
    origin = file;
    text = fs.readFileSync(file, 'utf8');
  } else {
    origin = '剪贴板';
    try {
      text = readClipboard();
    } catch (e) {
      throw new Error('读剪贴板失败：' + e.message + '\n可以改用 --from=file');
    }
  }

  text = String(text || '').trim();
  if (!text) {
    throw new Error(`${origin} 是空的。先在 MasterGo 插件里点「复制到剪贴板」。`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const head = text.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(
      `${origin} 里不是 JSON（开头是「${head}」）。确认插件里点的是「复制到剪贴板」，中间没复制过别的东西。`
    );
  }
  return {data, origin};
}

/* ------------------------------------------------------------------ 校验 */

const LISTS = ['colors', 'gradients', 'typography', 'shadows', 'radii', 'spacing'];

const SUPPORTED = ['design-tokens/v1', 'design-tokens/v2'];

function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('内容不是一个对象');
  if (!SUPPORTED.includes(data.schema)) {
    throw new Error(
      `schema 不匹配（拿到的是 ${JSON.stringify(data.schema)}，支持 ${SUPPORTED.join(' / ')}）。` +
        '插件版本和脚本对不上，重新跑一次插件的 npm run build 并在 MasterGo 里重新上传 manifest。'
    );
  }
  for (const k of LISTS) {
    if (!Array.isArray(data[k])) throw new Error(`字段 ${k} 缺失或不是数组`);
  }
  // v1 没有 usage，补个空的，后面就不用到处判空
  if (!data.usage) data.usage = {scannedNodes: 0, colors: [], typography: []};

  const styleTotal = LISTS.reduce((n, k) => n + data[k].length, 0);
  const usageTotal = data.usage.colors.length + data.usage.typography.length;
  if (styleTotal === 0 && usageTotal === 0) {
    throw new Error(
      '这份 JSON 里样式库和画布用量都是空的，不覆盖现有文件。' +
        '确认插件面板上「扫描了 N 个图层」的 N 不是 0。'
    );
  }
}

/* ------------------------------------------------------------------ diff */

function indexByName(list) {
  const m = new Map();
  for (const item of list) m.set(item.name, item);
  return m;
}

/** 比较除 name/path/description 外的实质字段 */
function fingerprint(item) {
  const {name, path: _p, description, ...rest} = item;
  return JSON.stringify(rest);
}

function diffSection(oldList, newList) {
  const a = indexByName(oldList || []);
  const b = indexByName(newList || []);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [name, item] of b) {
    if (!a.has(name)) added.push(name);
    else if (fingerprint(a.get(name)) !== fingerprint(item)) {
      changed.push({name, from: a.get(name), to: item});
    }
  }
  for (const name of a.keys()) if (!b.has(name)) removed.push(name);

  return {added, removed, changed};
}

function describeChange(section, c) {
  if (section === 'colors') return `${c.from.value} → ${c.to.value}`;
  if (section === 'typography') {
    const f = (t) => `${t.fontSize}px${t.lineHeight ? '/' + t.lineHeight : ''}`;
    return `${f(c.from)} → ${f(c.to)}`;
  }
  return '有改动';
}

function printDiff(oldData, newData) {
  const sections = [
    ['colors', '颜色'],
    ['gradients', '渐变'],
    ['typography', '文字'],
    ['shadows', '阴影'],
  ];
  let touched = 0;

  for (const [key, label] of sections) {
    const d = diffSection(oldData && oldData[key], newData[key]);
    if (!d.added.length && !d.removed.length && !d.changed.length) continue;
    touched++;
    console.log(`\n  ${label}`);
    d.added.forEach((n) => console.log(`    + 新增  ${n}`));
    d.changed.forEach((c) => console.log(`    ~ 变更  ${c.name}   ${describeChange(key, c)}`));
    d.removed.forEach((n) =>
      console.log(`    - 删除  ${n}   ← 代码里如果还在用这个 token，编译会报错，需要手工处理`)
    );
  }

  if (!touched) console.log('\n  （和上次同步完全一致，没有任何改动）');
  return touched;
}

/* ------------------------------------------------------------------ 主流程 */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const {data, origin} = loadIncoming(args);
  validate(data);

  const oldData = fs.existsSync(TOKENS_FILE)
    ? JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'))
    : null;

  console.log(`[sync] 来源：${origin}`);
  if (data.source && data.source.fileName) {
    console.log(`[sync] 设计文件：${data.source.fileName}（导出于 ${data.source.exportedAt || '未知时间'}）`);
  }
  console.log(
    `[sync] 样式库 → 颜色 ${data.colors.length} · 渐变 ${data.gradients.length} · 文字 ${data.typography.length} · 阴影 ${data.shadows.length} · 圆角 ${data.radii.length} · 间距 ${data.spacing.length}`
  );
  console.log(
    `[sync] 画布用量 → 扫了 ${data.usage.scannedNodes} 个图层，实际用 ${data.usage.colors.length} 种颜色 · ${data.usage.typography.length} 种文字规格`
  );

  printDiff(oldData, data);

  if (data.warnings && data.warnings.length) {
    console.log('\n[sync] 插件侧的提示：');
    data.warnings.forEach((w) => console.log('  ⚠ ' + w));
  }

  if (args.dry) {
    console.log('\n[sync] --dry，没有写文件');
    return;
  }

  fs.mkdirSync(path.dirname(TOKENS_FILE), {recursive: true});
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`\n[sync] 已写入 design/design-tokens.json`);

  const res = generate();
  const c = res.counts;
  console.log(
    `[sync] 已生成 src/theme/generated/ → 颜色 ${c.colors} · 渐变 ${c.gradients} · 文字 ${c.typography} · 阴影 ${c.shadows} · 圆角+间距 ${c.scale}`
  );
  res.warnings.forEach((w) => console.warn('  ⚠ ' + w));
  if (res.pendingCount) {
    console.log(
      `[sync] ${res.pendingCount} 个样式名用的是自动推导 key，想改成英文名见 design/token-map.pending.json`
    );
  }
  console.log('\n[sync] 下一步：git diff 看一眼改动，然后重启 metro（npm start -- --reset-cache）');
}

try {
  main();
} catch (e) {
  console.error('[sync] 失败：' + e.message);
  process.exit(1);
}
