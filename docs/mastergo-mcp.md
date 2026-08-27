# MasterGo MCP 接入

**状态：已配好，已验证可用。** 用你的个人访问令牌实际调通了 `mcp__getPageLayers`，
读到设计文件 `184198035129851` 的 3113 个图层，说明账号权限够（团队版及以上）。

Token 同步管线（见 [design/README.md](../design/README.md)）负责颜色/字号/圆角/阴影这类**设计令牌**；
MCP 负责**带布局的整页 / 整组件代码生成**，两者互补。

## 配置在哪

注册在 **user 作用域**（`C:\Users\98765\.claude.json`），所以在 airCarApp 和
`c:\project\mastergo` 两个目录下都能用，不用每个项目配一遍：

```json
{
  "mcpServers": {
    "mastergo": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@mastergo/magic-mcp",
               "--token=<个人访问令牌>", "--url=https://mastergo.com"],
      "env": {}
    }
  }
}
```

验证：`claude mcp list` 应该看到 `mastergo: ... ✔ Connected`。

> 令牌轮换：在 mastergo.com → 个人设置 → 安全设置 → 个人访问令牌 重新生成后，
> 改上面这个文件里的 `--token=`，或者跑
> `claude mcp remove mastergo -s user` 再 `claude mcp add` 一遍。
> 注意 Git Bash 会把 `/c` 误转成 `C:/`，加完记得检查一下 `args[0]` 是不是 `/c`。

## 可用的工具

| 工具 | 用途 |
|---|---|
| `mcp__getPageLayers` | 列出整页所有图层（id / name / type / parentId / childrenCount），用来找目标图层 |
| `mcp__getDesignSections` | 布局总览，按 section 分块，带绝对坐标和 nodeCount。**整页还原前必须先调这个** |
| `mcp__getDsl` | 取某个图层的完整 DSL（结构 + 样式 + 位置） |
| `mcp__extractSvg` | 把矢量图层导成 SVG |
| `mcp__getMeta` | 图层元信息 |
| `mcp__getComponentGenerator` | 结构化组件开发流程（Vue / React） |
| `mcp__applyDesign` | 把生成的代码写到指定目录 |
| `mcp__getD2c` / `mcp__C2d` | D2C 数据 / 反向对比 |

## 怎么用

**给我一个链接就行。** 两种粒度：

```
整页：  https://mastergo.com/file/184198035129851?page_id=M&shareId=184198035129851
单图层：https://mastergo.com/file/184198035129851?layer_id=112%3A0814
```

单图层链接的拿法：在 MasterGo 里选中目标图层 → 右键「复制链接」/ 复制容器链接。
`layer_id` 里的冒号要 URL 编码成 `%3A`。

然后直接说：

- 「按这个链接的设计稿，生成 RN 组件」
- 「这个按钮的设计稿改了，把 `src/components/AdjustButtons.tsx` 同步一下」
- 「把这个图层的图标导成 SVG，放进 `src/assets/`」

**建议优先给单图层链接**。整页 3113 个图层，一次性还原既慢又容易糊；
按屏 / 按组件一个个来，产出质量高得多。

---

## 生成 RN 代码的约定

⚠️ 这个 MCP 的内置提示词是面向 **HTML 还原**写的（它会要求「一个图层一个 standalone .html 文件」）。
我们的目标是 React Native，所以生成时按下面的约定来，**不要照它的 HTML 流程走**。

1. **样式一律 `StyleSheet.create`**，不要内联对象（`.eslintrc.js` 里 `no-inline-styles` 会警告）。
2. **颜色、字号、圆角、间距只准引用 `src/theme`**，禁止写死 hex 和数字：
   ```tsx
   import {Colors, FontSize, Spacing, BorderRadius, Typography} from '../theme';
   ```
   设计稿里的值如果 token 里没有，**先补进 MasterGo 的样式库再跑 `npm run sync:design`**，
   而不是在组件里硬编码。
3. **尺寸不要照抄绝对 px**。这是车机/平板横屏应用，用百分比、`flex`、
   `Dimensions.get('window')` 折算，或按设计稿基准宽度等比缩放。照抄 DSL 里的绝对坐标换个屏就崩。
4. **绝对定位克制使用**。DSL 里的 `x/y` 是画布坐标，直接转 `position:'absolute'`
   会得到一个没法维护的布局。优先还原成 flex 行列结构。
5. **渐变走 `expo-linear-gradient`**：`<LinearGradient {...Gradients.xxx} />`，
   token 已经把 `colors` / `locations` / `start` / `end` 备好了。
6. **图标和矢量走 `react-native-svg`**，用 `mcp__extractSvg` 导出后放 `src/assets/`。
   项目里已有 `.svgrrc.js` 配好的 SVGR 流程，按既有目录结构走（参考 `src/assets/seat/`）。
7. **文字样式优先摊 `Typography`**：
   ```tsx
   <Text style={[Typography.文字标题, styles.title]}>…</Text>
   ```
   而不是逐个写 `fontSize` / `lineHeight` / `fontWeight`。
8. **不要自动写 `fontFamily`**。Android 上字体文件必须先放进
   `android/app/src/main/assets/fonts/` 才生效，写了但没打包会静默 fallback 成系统字体，
   比不写更难排查。token 生成器也刻意没写 `fontFamily`，只在注释里标了设计稿用的字体。
9. **改已有组件时先读代码再改**，别用「第二行第三个按钮」这种描述定位。
10. **改父容器时保留全部子元素**。局部更新最容易丢子节点，改完对着 `git diff` 数一遍。

## 生成完的检查清单

```bash
npx tsc --noEmit          # 只看 src/ 的报错；android/ 下有个历史遗留的坏文件，与此无关
npm run lint
npm run audit:hardcoded   # 确认没有新增硬编码颜色
```
