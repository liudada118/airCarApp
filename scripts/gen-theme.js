/* eslint-disable no-bitwise */
/**
 * design/design-tokens.json  →  src/theme/generated/*.ts
 *
 * 由 scripts/sync-design-tokens.js 调用，也可以单独跑：node scripts/gen-theme.js
 * 生成物一律不要手改，改了下次同步就没了。要手工调整请写在 src/theme/overrides.ts。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOKENS_FILE = path.join(ROOT, 'design', 'design-tokens.json');
const MAP_FILE = path.join(ROOT, 'design', 'token-map.json');
const PENDING_FILE = path.join(ROOT, 'design', 'token-map.pending.json');
const OUT_DIR = path.join(ROOT, 'src', 'theme', 'generated');

// 生成物由 .eslintignore 排除，不用在文件里写 eslint-disable
const BANNER =
  '/**\n' +
  ' * AUTO-GENERATED —— 由 `npm run sync:design` 从 MasterGo 样式库生成，请勿手改。\n' +
  ' * 需要手工覆盖请写到 src/theme/overrides.ts。\n' +
  ' */\n\n';

/* ---------------------------------------------------------------- 命名 */

/**
 * 样式名 → 代码里的 key。
 * 英文名走 camelCase；中文名没法音译，就保留成合法标识符（中文是合法的 JS 标识符字符），
 * 同时记进 pending 表，方便之后手动改成英文 key。
 */
function autoKey(segments) {
  const segs = (segments && segments.length ? segments : ['unnamed']).map(String);
  const ascii = segs.every((s) => /^[\x20-\x7E]+$/.test(s));

  let key;
  if (ascii) {
    const words = segs
      .join(' ')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    key = words
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join('');
  } else {
    key = segs.join('').replace(/[^\p{L}\p{N}_$]/gu, '');
  }

  if (!key) key = 'unnamed';
  if (/^[0-9]/.test(key)) key = '_' + key;
  return key;
}

/** 同名冲突时补数字后缀，绝不静默覆盖 */
function uniqueKey(key, taken, warnings, label) {
  if (!taken.has(key)) {
    taken.add(key);
    return key;
  }
  let i = 2;
  while (taken.has(key + i)) i++;
  const next = key + i;
  taken.add(next);
  warnings.push(`${label}：key「${key}」重名，本条改用「${next}」，建议在 token-map.json 里显式指定`);
  return next;
}

/* ---------------------------------------------------------------- 序列化 */

function q(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** key 不是合法标识符时才加引号。中文本身就是合法标识符字符，不用引号 */
function propKey(k) {
  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(k) ? k : q(k);
}

function hexToRgba(hex, alpha) {
  if (alpha >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function objectLiteral(entries, indent) {
  const pad = ' '.repeat(indent);
  return entries.map(([k, v]) => `${pad}${propKey(k)}: ${v},`).join('\n');
}

/* ---------------------------------------------------------------- 生成器 */

function genColors(tokens, map, warnings) {
  const taken = new Set();
  const lines = [];
  const pending = {};

  for (const c of tokens.colors) {
    let key = map.colors[c.name];
    if (!key) {
      key = autoKey(c.path);
      pending[c.name] = key;
    }
    key = uniqueKey(key, taken, warnings, '颜色');
    // 注释里带上设计稿原名，方便回查是哪个样式
    const note = c.description ? `${c.name} — ${c.description}` : c.name;
    lines.push(`  ${propKey(key)}: ${q(hexToRgba(c.value, c.alpha))}, // ${note.replace(/\r?\n/g, ' ')}`);
  }

  /**
   * 样式库为空时的出口：在 token-map.json 的 usageColors 里给画布上的色值起名，
   * 效果等同于样式库，只是名字维护在代码侧。
   *
   * 注意这不是样式库的等价替代：这里的映射键是**色值本身**，设计师一改色，
   * 映射就失配、需要人工更新。样式库的名字挂在设计稿里，改色值名字不变，
   * 那才是真正的自动同步。这里只是过渡手段。
   */
  const usageColors = (tokens.usage && tokens.usage.colors) || [];
  const named = map.usageColors || {};
  let namedCount = 0;
  for (const c of usageColors) {
    const key = named[c.color] || named[c.color.toUpperCase()];
    if (!key) continue;
    if (taken.has(key)) continue; // 样式库里已有同名的，以样式库为准
    uniqueKey(key, taken, warnings, '画布用色');
    lines.push(
      `  ${propKey(key)}: ${q(hexToRgba(c.color, c.alpha))}, // 画布用色，出现 ${c.count} 次`
    );
    namedCount++;
  }
  const unnamed = usageColors.length - namedCount;
  if (!tokens.colors.length && unnamed > 0) {
    warnings.push(
      `画布上还有 ${unnamed} 种颜色没起名字，不会生成 token。` +
        '要用的话去 design/token-map.json 的 usageColors 里加映射（见 design/design-usage.md 的清单）。'
    );
  }

  const body = lines.length ? lines.join('\n') : '  // 还没同步过任何颜色样式';

  return {
    file: 'colors.ts',
    content: BANNER + 'export const GeneratedColors = {\n' + body + '\n} as const;\n',
    pending,
    count: lines.length,
  };
}

function genGradients(tokens, map, warnings) {
  const taken = new Set();
  const lines = [];
  const pending = {};

  for (const g of tokens.gradients) {
    let key = map.gradients[g.name];
    if (!key) {
      key = autoKey(g.path);
      pending[g.name] = key;
    }
    key = uniqueKey(key, taken, warnings, '渐变');

    if (g.type !== 'linear') {
      warnings.push(`渐变「${g.name}」是 ${g.type} 类型，expo-linear-gradient 只支持线性，已按线性近似导出`);
    }

    // 0° = 左→右，90° = 上→下。换算成 LinearGradient 的 start/end 单位坐标。
    const rad = (g.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const r3 = (n) => Math.round(n * 1000) / 1000;
    const start = `{x: ${r3(0.5 - dx / 2)}, y: ${r3(0.5 - dy / 2)}}`;
    const end = `{x: ${r3(0.5 + dx / 2)}, y: ${r3(0.5 + dy / 2)}}`;

    // expo-linear-gradient 的 colors 至少要两项，单色标的渐变补一项一样的
    let stops = g.stops;
    if (stops.length < 2) {
      warnings.push(`渐变「${g.name}」只有一个色标，已复制成两项以满足 LinearGradient 的类型要求`);
      stops = [stops[0], {...stops[0], position: 1}];
    }

    const colors = stops.map((s) => q(hexToRgba(s.color, s.alpha))).join(', ');
    const locations = stops.map((s) => s.position).join(', ');

    lines.push(
      `  ${propKey(key)}: {\n` +
        `    colors: [${colors}],\n` +
        `    locations: [${locations}],\n` +
        `    start: ${start},\n` +
        `    end: ${end},\n` +
        `  },`
    );
  }

  const body = lines.length ? lines.join('\n') : '  // 还没同步过任何渐变样式';

  return {
    file: 'gradients.ts',
    content:
      BANNER +
      '/** 直接摊给 expo-linear-gradient：<LinearGradient {...Gradients.xxx} /> */\n' +
      'export const GeneratedGradients = {\n' +
      body +
      '\n} as const;\n',
    pending,
    count: lines.length,
  };
}

function genTypography(tokens, map, warnings) {
  const taken = new Set();
  const typoLines = [];
  const sizeEntries = [];
  const pending = {};

  for (const t of tokens.typography) {
    let key = map.typography[t.name];
    if (!key) {
      key = autoKey(t.path);
      pending[t.name] = key;
    }
    key = uniqueKey(key, taken, warnings, '文字');

    const props = [`fontSize: ${t.fontSize}`];
    if (t.lineHeight) props.push(`lineHeight: ${t.lineHeight}`);
    if (t.letterSpacing) props.push(`letterSpacing: ${t.letterSpacing}`);
    // RN 的 fontWeight 要字符串
    if (t.fontWeight) props.push(`fontWeight: ${q(String(t.fontWeight))}`);
    if (t.textCase === 'UPPER') props.push(`textTransform: 'uppercase'`);
    if (t.textCase === 'LOWER') props.push(`textTransform: 'lowercase'`);
    if (t.textDecoration === 'UNDERLINE') props.push(`textDecorationLine: 'underline'`);

    // fontFamily 不自动写进去：Android 上必须先把字体文件放进 android/app/src/main/assets/fonts，
    // 写了但没打包进去会直接 fallback 成系统字体，反而更难排查。
    const cmt = t.fontFamily ? `  // 设计稿字体：${t.fontFamily} ${t.fontStyle}`.trimEnd() : '';
    typoLines.push(`  ${propKey(key)}: {${props.join(', ')}},${cmt}`);
    sizeEntries.push([key, String(t.fontSize)]);
  }

  /**
   * 样式库没有文字样式时，用画布实际用量兜底。
   * key 直接编码设计稿字号（fs22），因为字号本身就是它的身份——
   * 这点和颜色不一样：颜色改了名字该不变，字号改了本来就该让代码知道。
   * 同字号不同字重的，再补上 w600 区分。
   */
  const usageText = (tokens.usage && tokens.usage.typography) || [];
  if (usageText.length) {
    const sizeFreq = {};
    usageText.forEach((t) => {
      sizeFreq[t.fontSize] = (sizeFreq[t.fontSize] || 0) + 1;
    });

    for (const t of usageText) {
      const mapped = map.typography['px:' + t.fontSize];
      let key =
        mapped ||
        'fs' + String(t.fontSize).replace('.', '_') +
          (sizeFreq[t.fontSize] > 1 && t.fontWeight ? 'w' + t.fontWeight : '');
      if (taken.has(key)) continue; // 样式库里已经有同名的，以样式库为准
      key = uniqueKey(key, taken, warnings, '画布字号');

      const props = [`fontSize: ${t.fontSize}`];
      if (t.lineHeight) props.push(`lineHeight: ${t.lineHeight}`);
      if (t.fontWeight) props.push(`fontWeight: ${q(String(t.fontWeight))}`);
      typoLines.push(`  ${propKey(key)}: {${props.join(', ')}}, // 画布出现 ${t.count} 次`);
      sizeEntries.push([key, String(t.fontSize)]);
    }
  }

  const typoBody = typoLines.length ? typoLines.join('\n') : '  // 还没同步过任何文字样式';
  const sizeBody = sizeEntries.length
    ? objectLiteral(sizeEntries, 2)
    : '  // 还没同步过任何文字样式';

  return {
    file: 'typography.ts',
    content:
      BANNER +
      '/**\n' +
      ' * 整套文字样式，直接摊进 Text 的 style：\n' +
      ' *   style={[Typography.title, {color: Colors.textWhite}]}\n' +
      ' * 用 as const 是为了让 fontWeight/textTransform 保持字面量类型，否则 RN 的联合类型对不上。\n' +
      ' */\n' +
      'export const GeneratedTypography = {\n' +
      typoBody +
      '\n} as const;\n\n' +
      '/** 只要字号时用这个，和既有的 FontSize 合并 */\n' +
      'export const GeneratedFontSize = {\n' +
      sizeBody +
      '\n} as const;\n',
    pending,
    count: typoLines.length,
  };
}

function genShadows(tokens, map, warnings) {
  const taken = new Set();
  const lines = [];
  const pending = {};

  for (const s of tokens.shadows) {
    let key = map.shadows[s.name];
    if (!key) {
      key = autoKey(s.path);
      pending[s.name] = key;
    }
    key = uniqueKey(key, taken, warnings, '阴影');

    const l = s.layers[0];
    if (l.type === 'INNER_SHADOW') {
      warnings.push(`阴影「${s.name}」是内阴影，RN 原生不支持，已按外阴影导出，视觉会有出入`);
    }
    // Android 不认 shadow*，只认 elevation；用模糊半径折算一个近似值
    const elevation = Math.max(1, Math.round(l.blur / 2));
    lines.push(
      `  ${propKey(key)}: {\n` +
        `    shadowColor: ${q(l.color)},\n` +
        `    shadowOffset: {width: ${l.x}, height: ${l.y}},\n` +
        `    shadowOpacity: ${l.alpha},\n` +
        `    shadowRadius: ${l.blur},\n` +
        `    elevation: ${elevation},\n` +
        `  },`
    );
  }

  const body = lines.length ? lines.join('\n') : '  // 还没同步过任何阴影样式';

  return {
    file: 'shadows.ts',
    content:
      BANNER +
      '/** iOS 用 shadow*，Android 只认 elevation，两套都给全 */\n' +
      'export const GeneratedShadows = {\n' +
      body +
      '\n} as const;\n',
    pending,
    count: lines.length,
  };
}

/**
 * 圆角和间距不在样式库里，是插件从画布上按出现频次采样来的。
 * 所以默认 key 用 `r8` / `s12` 这种带值的形式——绝不自动占用 sm/md/lg，
 * 否则会静默改掉既有 Spacing.md 的值，全应用布局都会动。
 * 想提升成语义名，在 token-map.json 里显式写映射。
 */
function genScale(tokens, map, warnings) {
  const mk = (samples, prefix, mapping, label) => {
    const taken = new Set();
    const entries = [];
    for (const s of samples) {
      const raw = String(s.value);
      let key = mapping[raw];
      if (!key) key = prefix + raw.replace('.', '_');
      key = uniqueKey(key, taken, warnings, label);
      entries.push([key, `${s.value}, // 画布出现 ${s.count} 次`]);
    }
    return entries.length
      ? entries.map(([k, v]) => `  ${propKey(k)}: ${v}`).join('\n')
      : `  // 还没采样到${label}`;
  };

  return {
    file: 'scale.ts',
    content:
      BANNER +
      '/** 画布采样的圆角值 */\n' +
      'export const GeneratedRadius = {\n' +
      mk(tokens.radii, 'r', map.radii, '圆角') +
      '\n} as const;\n\n' +
      '/** 画布采样的间距值 */\n' +
      'export const GeneratedSpacing = {\n' +
      mk(tokens.spacing, 's', map.spacing, '间距') +
      '\n} as const;\n',
    pending: {},
    count: tokens.radii.length + tokens.spacing.length,
  };
}

/* ---------------------------------------------------------------- 主流程 */

const EMPTY_TOKENS = {
  schema: 'design-tokens/v2',
  source: {},
  colors: [],
  gradients: [],
  typography: [],
  shadows: [],
  radii: [],
  spacing: [],
  usage: {scannedNodes: 0, colors: [], typography: []},
  warnings: [],
};

/**
 * 画布用量报告。
 *
 * 为什么不直接把这些生成成 token：用量里的色值**没有名字**。
 * 设计稿里把 #2978CE 改成别的色，代码这边没有任何标识能对上——
 * token 的价值在于「名字稳定、值可变」，没名字就没法同步。
 * 所以这里只出报告，供人决定哪些该在 MasterGo 里建成样式。
 */
function genUsageReport(tokens) {
  const u = tokens.usage || {scannedNodes: 0, colors: [], typography: []};
  const src = tokens.source || {};

  let known = [];
  try {
    known = require('./audit-hardcoded').loadColorTokens();
  } catch (e) {
    // 报告里少一列而已，不该因此让整个同步失败
  }
  const findToken = (hex) => {
    const hit = known.find((t) => t.hex === String(hex).toUpperCase());
    return hit ? '`Colors.' + hit.key + '`' : '—';
  };

  const lines = [];
  lines.push('# 画布用量报告');
  lines.push('');
  lines.push('> 由 `npm run sync:design` 生成，**请勿手改**。');
  lines.push('>');
  lines.push(`> 设计文件：${src.fileName || '未知'}　导出于 ${src.exportedAt || '未知'}　扫描范围 ${src.scope || '未知'}`);
  lines.push(`> 共扫描 ${u.scannedNodes} 个图层。`);
  lines.push('');
  lines.push('这份报告统计的是设计稿里**实际用到**的值，和「样式库」是两回事。');
  lines.push('样式库为空时，这里就是唯一能反推设计规范的依据：出现次数高的才是规范，');
  lines.push('只出现一两次的多半是谁随手调的。');
  lines.push('');

  lines.push('## 文字规格');
  lines.push('');
  if (u.typography.length) {
    lines.push('| 字号 | 行高 | 字重 | 字体 | 出现次数 |');
    lines.push('|---:|---:|---:|---|---:|');
    u.typography.forEach((t) => {
      lines.push(
        `| ${t.fontSize} | ${t.lineHeight || '—'} | ${t.fontWeight || '—'} | ${t.fontFamily || '—'} | ${t.count} |`
      );
    });
  } else {
    lines.push('（没扫到文字图层）');
  }
  lines.push('');

  lines.push('## 颜色');
  lines.push('');
  if (u.colors.length) {
    lines.push('| 色值 | 不透明度 | 出现次数 | 代码里已有的 token |');
    lines.push('|---|---:|---:|---|');
    u.colors.forEach((c) => {
      lines.push(
        `| \`${c.color}\` | ${c.alpha < 1 ? Math.round(c.alpha * 100) + '%' : '100%'} | ${c.count} | ${findToken(c.color)} |`
      );
    });
  } else {
    lines.push('（没扫到填充或描边）');
  }
  lines.push('');

  lines.push('## 怎么用这份报告');
  lines.push('');
  lines.push('1. 挑出出现次数高的色值和字号——那些就是事实上的设计规范；');
  lines.push('2. 在 MasterGo 里把它们**建成颜色样式 / 文字样式**（起有意义的名字，如 `颜色/主色`）；');
  lines.push('3. 再跑一次 `npm run sync:design`，这些就会带着名字进入 `src/theme/generated/`，从此可同步；');
  lines.push('4. 最后 `npm run audit:hardcoded -- --fix` 把代码里对应的硬编码换成 token。');
  lines.push('');
  lines.push('第 2 步是关键，也只能在 MasterGo 里做——没有名字的色值无法同步。');

  return lines.join('\n') + '\n';
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)} 不是合法 JSON：${e.message}`);
  }
}

function generate() {
  const raw = readJson(TOKENS_FILE, null);
  const tokens = raw ? {...EMPTY_TOKENS, ...raw} : EMPTY_TOKENS;
  if (!raw) {
    console.log('[gen-theme] design/design-tokens.json 还不存在，先生成空壳，跑一次 npm run sync:design 就有内容了');
  }

  const rawMap = readJson(MAP_FILE, {});
  const map = {
    colors: rawMap.colors || {},
    gradients: rawMap.gradients || {},
    typography: rawMap.typography || {},
    shadows: rawMap.shadows || {},
    radii: rawMap.radii || {},
    spacing: rawMap.spacing || {},
    // 样式库为空时，给画布用色起名的出口
    usageColors: rawMap.usageColors || {},
  };

  const warnings = [];
  const results = [
    genColors(tokens, map, warnings),
    genGradients(tokens, map, warnings),
    genTypography(tokens, map, warnings),
    genShadows(tokens, map, warnings),
    genScale(tokens, map, warnings),
  ];

  fs.mkdirSync(OUT_DIR, {recursive: true});
  fs.mkdirSync(path.join(ROOT, 'design'), {recursive: true});
  for (const r of results) {
    fs.writeFileSync(path.join(OUT_DIR, r.file), r.content, 'utf8');
  }

  const indexContent =
    BANNER +
    "export {GeneratedColors} from './colors';\n" +
    "export {GeneratedGradients} from './gradients';\n" +
    "export {GeneratedTypography, GeneratedFontSize} from './typography';\n" +
    "export {GeneratedShadows} from './shadows';\n" +
    "export {GeneratedRadius, GeneratedSpacing} from './scale';\n";
  fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), indexContent, 'utf8');

  fs.writeFileSync(path.join(ROOT, 'design', 'design-usage.md'), genUsageReport(tokens), 'utf8');

  // 没映射的样式名收集起来，方便一次性补 token-map.json
  const pending = {colors: {}, gradients: {}, typography: {}, shadows: {}};
  const slots = ['colors', 'gradients', 'typography', 'shadows'];
  results.forEach((r, i) => {
    if (slots[i]) Object.assign(pending[slots[i]], r.pending);
  });
  const pendingCount = slots.reduce((n, k) => n + Object.keys(pending[k]).length, 0);

  if (pendingCount) {
    fs.writeFileSync(
      PENDING_FILE,
      '// 这些样式名还没在 token-map.json 里指定 key，下面是自动推导的结果。\n' +
        '// 想换成更好的英文 key，把对应条目改好后剪进 token-map.json，再跑一次 npm run sync:design。\n' +
        JSON.stringify(pending, null, 2) +
        '\n',
      'utf8'
    );
  } else if (fs.existsSync(PENDING_FILE)) {
    fs.unlinkSync(PENDING_FILE);
  }

  return {
    counts: {
      colors: results[0].count,
      gradients: results[1].count,
      typography: results[2].count,
      shadows: results[3].count,
      scale: results[4].count,
    },
    warnings: warnings.concat(tokens.warnings || []),
    pendingCount,
  };
}

module.exports = {generate, autoKey};

if (require.main === module) {
  try {
    const res = generate();
    const c = res.counts;
    console.log(
      `[gen-theme] 颜色 ${c.colors} · 渐变 ${c.gradients} · 文字 ${c.typography} · 阴影 ${c.shadows} · 圆角+间距 ${c.scale}`
    );
    res.warnings.forEach((w) => console.warn('  ⚠ ' + w));
    if (res.pendingCount) {
      console.log(`[gen-theme] ${res.pendingCount} 个样式名用了自动推导的 key，见 design/token-map.pending.json`);
    }
  } catch (e) {
    console.error('[gen-theme] 失败：' + e.message);
    process.exit(1);
  }
}
