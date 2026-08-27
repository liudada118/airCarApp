# 设计令牌同步

MasterGo 样式库 → 这个目录 → `src/theme/generated/` → 全 App 生效。

插件在 [c:\project\mastergo](../../../mastergo/README.md)，设计文件
<https://mastergo.com/file/184198035129851>。

## 日常怎么用

```bash
# 1. MasterGo 里跑插件「Design Token 导出器」→ 点「复制到剪贴板」
# 2. 回到这里：
npm run sync:design

# 剪贴板被拦了就改用下载：
npm run sync:design -- --from=file

# 只想看会改什么、先不落盘：
npm run sync:design -- --dry
```

脚本会打印一份 diff（哪些 token 新增/变更/删除），然后重写
`design-tokens.json` 和 `src/theme/generated/`。改完 **`git diff` 过一眼**，
再重启 metro：`npm start -- --reset-cache`。

## 这个目录里的文件

| 文件 | 谁维护 | 说明 |
|---|---|---|
| `design-tokens.json` | 脚本生成 | 从 MasterGo 拿到的原始 token，提交进版本库，用来 diff 和回滚 |
| `token-map.json` | **手写** | MasterGo 样式名 → 代码 key 的锁定表 |
| `token-map.pending.json` | 脚本生成 | 还没锁定、用了自动推导 key 的样式，供你挑着补进上面那张表 |

## token-map.json 是干嘛的

设计师在 MasterGo 里把「颜色/主色」改名成「颜色/品牌色」，如果没有这张表，
代码里的 key 就跟着变了，`Colors.颜色主色` 直接编译不过。

有了映射就锁死：

```json
{
  "colors": {
    "颜色/主色": "primary",
    "颜色/品牌色": "primary"
  }
}
```

新旧名都指向同一个 `primary`，改名不影响代码。顺便也能把中文名换成英文 key。

`spacing` / `radii` 的 key 是采样到的**数值字符串**：

```json
{"spacing": {"12": "md"}}
```

意思是把画布上出现最多的 12px 提升成 `Spacing.md`。
⚠️ 这会**直接覆盖** `src/theme/spacing.ts` 里手写的 `md`，全应用布局都会动，想清楚再写。
不写映射的话默认生成 `Spacing.s12`，只是新增，不影响既有代码。

## 主题的三层合并

`src/theme/index.ts` 按这个顺序合并，后面压过前面：

```
colors.ts / spacing.ts   基线值（同步前的手写主题，也是兜底）
generated/               MasterGo 同步下来的值 ← 设计说了算
overrides.ts             手工临时覆盖
```

对外导出的名字（`Colors` / `FontSize` / `Spacing` / `BorderRadius`）没变，
已经在用主题的组件一行都不用改。新增了 `Gradients` / `Typography` / `Shadows` / `DebugColors`。

`generated/` 里的文件**不要手改**，下次同步会被覆盖。要手工调整写到 `overrides.ts`。

## 硬编码治理

同步了 token，代码里还散着一堆写死的 hex 的话，等于白同步。

```bash
npm run audit:hardcoded            # 出报告，分三档
npm run audit:hardcoded -- --fix   # 只自动替换第一档（精确命中 token 的）
```

- **一档**：色值和某个 token 完全相等 → 可以放心自动换
- **二档**：很接近但不相等（默认色差阈值 6）→ 多半是历史手抄误差，**需要人看**，
  脚本不动它。用 `--near=8` 调阈值
- **三档**：token 里压根没有 → 要么补进设计稿的样式库，要么它本来就不是设计资产

关于三档里的 `#4CAF50` / `#FFC107` / `#FF5722`：那是 HomeScreen 实时数据调试面板的状态色，
不是设计资产，已经单独放在 `src/theme/overrides.ts` 的 `DebugColors` 里，
刻意不进同步管线——设计换主题时不该把调试面板一起换掉。

`--fix` 跑完务必 `npx tsc --noEmit && npm run lint`，再逐个 `git diff` 看过。

## 防回潮

`.eslintrc.js` 里开了 `react-native/no-color-literals` 和 `no-inline-styles`，
现在是 `warn`。等一档清零、二档处理完，把它们提到 `error`。

## 回滚

```bash
git checkout design/ src/theme/generated/
```
