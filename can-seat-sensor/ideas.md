# 汽车座椅CAN传感器上位机 - 设计方案

## 项目背景
基于CAN通信协议的汽车座椅压力传感器验收分析系统。支持靠背(0x460)和坐垫(0x461)两个CAN设备的实时数据采集、压力矩阵可视化和自动化验收测试。

---

<response>
<idea>

## 方案一：Automotive HMI Dark Console（汽车HMI深色控制台）

**Design Movement**: 参考特斯拉/蔚来车载HMI界面 + 工业SCADA系统美学

**Core Principles**:
1. 高对比度深色背景，减少视觉疲劳，适合长时间测试场景
2. 数据密度优先，一屏内展示尽可能多的实时信息
3. 状态驱动的色彩系统——颜色仅用于传递信息（正常/警告/异常）
4. 模块化面板布局，支持拖拽和自定义

**Color Philosophy**: 
- 基底色：深海军蓝(#0B1120)，传递专业、沉稳
- 主色调：矩侨蓝(#2563EB)，品牌一致性
- 状态色：翡翠绿(#10B981)正常、琥珀(#F59E0B)警告、红(#EF4444)异常
- 数据可视化渐变：从深蓝到亮青(#06B6D4)表示压力从低到高

**Layout Paradigm**: 
- 左侧窄导航栏 + 左侧面板（设备管理/配置）+ 中央主显示区（压力矩阵热力图）+ 右侧数据面板（统计分析）
- 三栏式布局，中央区域占60%以上

**Signature Elements**:
1. 压力矩阵热力图——使用Canvas渲染的实时色彩矩阵，颜色从深蓝渐变到亮红
2. 电路板纹理背景——呼应PCB/传感器硬件主题
3. 发光边框效果——活跃设备和选中元素带有微弱的蓝色辉光

**Interaction Philosophy**: 
- 最小化点击，最大化信息密度
- 鼠标悬停显示详细数据tooltip
- 实时数据流动感——数字跳动、进度条流动

**Animation**: 
- 数据更新时矩阵单元格的微妙闪烁
- 连接状态变化时的脉冲动画
- 面板展开/折叠的平滑过渡(200ms ease-out)

**Typography System**: 
- 显示字体：Space Grotesk（标题、数值显示）
- 正文字体：DM Sans（标签、描述文本）
- 数据字体：Fira Code（十六进制数据、CAN ID、传感器编号）

</idea>
<text>深色工业控制台风格，高数据密度，适合专业测试人员</text>
<probability>0.08</probability>
</response>

<response>
<idea>

## 方案二：Glassmorphism Data Lab（玻璃态数据实验室）

**Design Movement**: 玻璃拟态 + 数据科学可视化美学

**Core Principles**:
1. 半透明毛玻璃面板叠加在深色渐变背景上
2. 层次感通过模糊和透明度而非阴影来实现
3. 圆润的卡片边角与锐利的数据图表形成对比
4. 呼吸感的留白，不追求极致数据密度

**Color Philosophy**: 
- 背景渐变：从深紫蓝(#0F172A)到深青(#0C1B2A)
- 面板：白色10%透明度 + 20px模糊
- 主色调：电蓝(#3B82F6)
- 辅助色：薰衣草紫(#8B5CF6)用于次要元素

**Layout Paradigm**: 
- 全屏背景 + 浮动卡片式布局
- 顶部导航条 + 下方自由排列的功能卡片
- 卡片可以重叠，创造深度感

**Signature Elements**:
1. 毛玻璃效果面板(backdrop-filter: blur)
2. 3D压力矩阵可视化——立体柱状图表示压力值
3. 渐变边框——面板边缘的微妙彩虹渐变

**Interaction Philosophy**: 
- 卡片悬停时微微上浮
- 拖拽重排面板位置
- 数据图表支持缩放和平移

**Animation**: 
- 面板出现时的淡入+上移动画
- 背景渐变的缓慢流动
- 数据点的弹性过渡效果

**Typography System**: 
- 显示字体：Plus Jakarta Sans（现代感标题）
- 正文字体：Inter（清晰易读的界面文本）
- 数据字体：JetBrains Mono（等宽数据显示）

</idea>
<text>玻璃拟态风格，视觉效果华丽，但可能影响数据阅读效率</text>
<probability>0.04</probability>
</response>

<response>
<idea>

## 方案三：Precision Engineering Blueprint（精密工程蓝图）

**Design Movement**: 工程制图/蓝图美学 + 现代数据仪表盘

**Core Principles**:
1. 以工程蓝图的网格线为视觉基础，传递精密测量的专业感
2. 单色蓝调为主，辅以白色线条和标注
3. 数据以工程图纸标注的方式呈现（引线、尺寸线风格）
4. 功能区域用虚线框划分，模拟技术图纸的分区

**Color Philosophy**: 
- 背景：深蓝图纸色(#0A1628)
- 网格线：蓝灰(#1E3A5F)
- 主色调：矩侨蓝(#2563EB)
- 标注色：亮白(#E2E8F0)
- 数据高亮：青色(#22D3EE)

**Layout Paradigm**: 
- 全屏网格背景 + 固定比例的功能分区
- 左侧控制面板(25%) + 中央矩阵显示(50%) + 右侧数据面板(25%)
- 区域间用蓝图风格的虚线分隔

**Signature Elements**:
1. 蓝图网格背景——细密的正交网格线
2. 工程标注风格的数据标签——带引线和尺寸标注
3. 传感器矩阵以PCB布局图风格呈现

**Interaction Philosophy**: 
- 点击传感器点位弹出详细数据卡片
- 鼠标移动时显示十字准线
- 选区框选多个传感器进行批量分析

**Animation**: 
- 数据更新时的扫描线效果
- 连接建立时的信号波纹扩散
- 最小化的动画，保持工程严谨感

**Typography System**: 
- 显示字体：Rajdhani（工程感标题）
- 正文字体：Source Sans 3（技术文档风格）
- 数据字体：Fira Code（精确的等宽数据）

</idea>
<text>蓝图工程风格，极具专业感，但视觉表现力相对克制</text>
<probability>0.06</probability>
</response>

---

## 选择方案

选择 **方案一：Automotive HMI Dark Console**

理由：
1. 与现有传感器矩阵分析系统(sensor-mtx)的UI风格高度一致
2. 深色主题最适合长时间测试工作场景
3. 高数据密度布局符合工业测试上位机的使用习惯
4. 矩侨工业蓝色品牌色贯穿始终
5. 三栏布局能同时展示设备管理、压力矩阵和数据分析
