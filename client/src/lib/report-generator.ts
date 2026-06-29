/**
 * PDF验收报告生成器
 * 使用纯前端方式生成PDF验收报告
 * 
 * 支持两种报告模式:
 * 1. 标准帧分析报告 - 基于当前帧数据的重复性/一致性分析
 * 2. 自动化验收报告 - 基于多点位砝码按压对比的验收分析
 */
import type { BasicStats } from "./analysis";
import type { PointComparisonResult, PressEvent, AutoTestConfig } from "./auto-test";

/** 标准帧分析报告数据 */
interface ReportData {
  matrixSize: string;
  adcThreshold: number;
  stats: BasicStats;
  matrixData: number[];
  timestamp: Date;
  /** 自动化验收多点对比结果（可选） */
  autoTestResult?: PointComparisonResult;
  /** 自动化验收配置（可选） */
  autoTestConfig?: AutoTestConfig;
  /** 样品编号（可选） */
  sampleId?: string;
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "优秀": return "#22c55e";
    case "良好": return "#3b82f6";
    case "异常": return "#ef4444";
    default: return "#6b7280";
  }
}

function verdictColor(verdict: string): string {
  if (verdict === "合格") return "#22c55e";
  if (verdict === "异常" || verdict === "测试过程异常") return "#ef4444";
  return "#f59e0b";
}

function pressureToHexColor(value: number, maxValue = 255): string {
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  if (ratio < 0.02) return "#080c1e";

  const stops = [
    { pos: 0.0, r: 10, g: 20, b: 60 },
    { pos: 0.15, r: 20, g: 60, b: 180 },
    { pos: 0.3, r: 30, g: 140, b: 220 },
    { pos: 0.45, r: 0, g: 210, b: 200 },
    { pos: 0.6, r: 50, g: 220, b: 80 },
    { pos: 0.75, r: 220, g: 220, b: 30 },
    { pos: 0.9, r: 255, g: 120, b: 20 },
    { pos: 1.0, r: 255, g: 40, b: 40 },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i].pos && ratio <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const t = (ratio - lower.pos) / (upper.pos - lower.pos);
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function drawMatrixToCanvas(data: number[], dim: number, threshold: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cellSize = size / dim;

  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const value = data[row * dim + col] ?? 0;
      const x = col * cellSize;
      const y = row * cellSize;

      if (value > threshold) {
        ctx.fillStyle = pressureToHexColor(value);
      } else {
        ctx.fillStyle = "#0a0e1a";
      }
      ctx.fillRect(x, y, cellSize - 0.5, cellSize - 0.5);

      // Draw value text for small matrices
      if (dim <= 16 && value > threshold) {
        ctx.fillStyle = value < 120 ? "#ffffff" : value < 200 ? "#000000" : "#ffffff";
        ctx.font = `bold ${Math.max(8, cellSize * 0.35)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  return canvas;
}

/**
 * 绘制各点位ADC均值对比柱状图
 */
function drawPointBarChart(events: PressEvent[], width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const padding = { top: 25, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  if (events.length === 0) return canvas;

  const maxVal = Math.max(...events.map(e => e.meanValue)) * 1.15;
  const barWidth = Math.min(40, (chartW / events.length) * 0.6);
  const gap = (chartW - barWidth * events.length) / (events.length + 1);

  // Title
  ctx.fillStyle = "#333";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("各点位ADC均值对比", width / 2, 15);

  // Y axis
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + chartH - (chartH * i) / yTicks;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#999";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(((maxVal * i) / yTicks).toFixed(0), padding.left - 5, y + 3);
  }

  // Mean line
  const meanVal = events.reduce((s, e) => s + e.meanValue, 0) / events.length;
  const meanY = padding.top + chartH - (chartH * meanVal) / maxVal;
  ctx.strokeStyle = "#1e6fd9";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, meanY);
  ctx.lineTo(width - padding.right, meanY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#1e6fd9";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`总均值 ${meanVal.toFixed(1)}`, width - padding.right + 2, meanY - 3);

  // Bars
  events.forEach((evt, i) => {
    const x = padding.left + gap + i * (barWidth + gap);
    const barH = (chartH * evt.meanValue) / maxVal;
    const y = padding.top + chartH - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(x, y, x, padding.top + chartH);
    grad.addColorStop(0, "#3b82f6");
    grad.addColorStop(1, "#1e40af");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barH);

    // Error bar (stdValue - temporal std)
    const stdH = (chartH * evt.stdValue) / maxVal;
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + barWidth / 2, y - stdH);
    ctx.lineTo(x + barWidth / 2, y + stdH);
    ctx.stroke();
    // Caps
    ctx.beginPath();
    ctx.moveTo(x + barWidth / 2 - 3, y - stdH);
    ctx.lineTo(x + barWidth / 2 + 3, y - stdH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + barWidth / 2 - 3, y + stdH);
    ctx.lineTo(x + barWidth / 2 + 3, y + stdH);
    ctx.stroke();

    // Value label
    ctx.fillStyle = "#333";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(evt.meanValue.toFixed(1), x + barWidth / 2, y - stdH - 5);

    // X label
    ctx.fillStyle = "#666";
    ctx.font = "9px sans-serif";
    ctx.fillText(`#${evt.index}`, x + barWidth / 2, padding.top + chartH + 13);
    ctx.font = "8px monospace";
    ctx.fillStyle = "#999";
    ctx.fillText(`(${evt.position[0]},${evt.position[1]})`, x + barWidth / 2, padding.top + chartH + 25);
  });

  return canvas;
}

/**
 * 生成自动化验收多点对比报告的HTML片段
 */
function buildAutoTestSection(result: PointComparisonResult, config?: AutoTestConfig, sampleId?: string): string {
  const events = result.pressEvents;

  // 绘制柱状图
  const barCanvas = drawPointBarChart(events, 500, 220);
  const barImage = barCanvas.toDataURL("image/png");

  // 各点位数据表行
  const pointRows = events.map((evt: PressEvent) => `
    <tr>
      <td style="text-align:center;font-weight:bold;color:#1e6fd9">#${evt.index}</td>
      <td style="text-align:center;font-family:monospace">(${evt.position[0]}, ${evt.position[1]})</td>
      <td style="text-align:center;font-family:monospace;font-weight:bold">${evt.meanValue.toFixed(1)}</td>
      <td style="text-align:center;font-family:monospace">\u00b1${evt.stdValue.toFixed(1)}</td>
      <td style="text-align:center;font-family:monospace">${evt.maxValue}</td>
      <td style="text-align:center;font-family:monospace">${evt.minValue}</td>
      <td style="text-align:center;font-family:monospace">${evt.duration.toFixed(1)}s</td>
      <td style="text-align:center;font-family:monospace">${evt.frameCount}</td>
    </tr>
  `).join("");

  return `
  <!-- 自动化验收综合判定 -->
  <div class="section" style="page-break-before:always;">
    <div class="section-title">
      砝码按压验收测试 \u2014 ${result.testType === "repeatability" ? "重复性分析" : "一致性分析"}
    </div>

    <!-- 验收结论 -->
    <div style="text-align:center;padding:30px 20px;margin-bottom:16px;background:${result.verdict === '合格' ? '#f0fdf4' : result.verdict === '异常' || result.verdict === '测试过程异常' ? '#f5f5f5' : '#fffbeb'};border:3px solid ${verdictColor(result.verdict)};border-radius:8px;">
      <div style="font-size:48px;font-weight:bold;color:${verdictColor(result.verdict)};letter-spacing:12px;margin-bottom:12px">${result.verdict}</div>
      <div style="font-size:16px;color:#444;margin-top:10px;line-height:2">
        综合评分: <span style="font-size:28px;font-weight:bold;color:${verdictColor(result.verdict)};font-family:monospace">${result.overallScore.toFixed(1)}</span> 分
        &nbsp;&middot;&nbsp; 等级: <span style="font-size:20px;font-weight:bold;color:${gradeColor(result.overallGrade)}">${result.overallGrade}</span>
        &nbsp;&middot;&nbsp; 测试点位: <span style="font-size:20px;font-weight:bold">${result.pressCount}</span> 个
      </div>
      ${sampleId ? `<div style="font-size:12px;color:#666;margin-top:8px">样品编号: ${sampleId}</div>` : ""}
    </div>

    <!-- 评分 -->
    <div class="scores-row" style="margin:16px 0">
      ${result.testType === "consistency" ? `
      <div style="display:inline-block;text-align:center;margin:0 16px">
        <div class="score-box" style="background:${gradeColor(result.consistencyGrade)}">${result.consistencyScore.toFixed(0)}</div>
        <span class="score-label">一致性 (各点间RSD)</span>
      </div>` : `
      <div style="display:inline-block;text-align:center;margin:0 16px">
        <div class="score-box" style="background:${gradeColor(result.repeatabilityGrade)}">${result.repeatabilityScore.toFixed(0)}</div>
        <span class="score-label">重复性 (时间稳定)</span>
      </div>`}
    </div>
  </div>

  <!-- 一致性分析 -->
  ${result.testType === "consistency" ? `<div class="section">
    <div class="section-title">一致性分析 (不同点位间响应一致性)</div>
    <table>
      <tr><th style="width:180px">指标</th><th style="width:100px">数值</th><th style="width:80px">等级</th><th>说明</th></tr>
      <tr>
        <td>各点间一致性 RSD (%)</td>
        <td class="highlight" style="font-family:monospace;font-size:13px">${result.consistencyRSD.toFixed(2)}%</td>
        <td><span class="grade" style="background:${gradeColor(result.consistencyGrade)}">${result.consistencyGrade}</span></td>
        <td>各点ADC均值的相对标准偏差，越小表示不同位置的传感器响应越一致</td>
      </tr>
      <tr>
        <td>各点间均值标准差</td>
        <td style="font-family:monospace">${result.interPointStd.toFixed(2)}</td>
        <td colspan="2">各点ADC均值的标准差</td>
      </tr>
      <tr>
        <td>各点间平均ADC</td>
        <td style="font-family:monospace">${result.interPointMean.toFixed(2)}</td>
        <td colspan="2">所有测试点位ADC均值的平均值</td>
      </tr>
      <tr>
        <td>一致性评分</td>
        <td style="font-family:monospace;font-weight:bold;color:${gradeColor(result.consistencyGrade)}">${result.consistencyScore.toFixed(1)}</td>
        <td colspan="2">评分公式: max(0, 100 - RSD)</td>
      </tr>
    </table>
  </div>` : ""}

  <!-- 重复性分析 -->
  ${result.testType === "repeatability" ? `<div class="section">
    <div class="section-title">重复性分析 (同一点位多次按压偏差)</div>
    <table>
      <tr><th style="width:180px">指标</th><th style="width:100px">数值</th><th style="width:80px">等级</th><th>说明</th></tr>
      <tr>
        <td>最大偏差 (%FSO)</td>
        <td class="highlight" style="font-family:monospace;font-size:13px">\u00b1${result.repeatabilityER.toFixed(2)}%</td>
        <td><span class="grade" style="background:${gradeColor(result.repeatabilityGrade)}">${result.repeatabilityGrade}</span></td>
        <td>多次按压同一点位，稳定后均值的最大差异占满量程百分比</td>
      </tr>
      <tr>
        <td>变异系数 CV (%)</td>
        <td style="font-family:monospace;font-weight:bold">${result.repeatabilityCV.toFixed(2)}%</td>
        <td colspan="2">各次按压代表值的标准差/平均值 \u00d7 100，越小越好</td>
      </tr>
      <tr>
        <td>各次均值平均</td>
        <td style="font-family:monospace">${result.repeatMean.toFixed(2)}</td>
        <td colspan="2">多次按压稳定后均值的算术平均</td>
      </tr>
      <tr>
        <td>各次均值标准差</td>
        <td style="font-family:monospace">${result.repeatStd.toFixed(2)}</td>
        <td colspan="2">多次按压稳定后均值的标准差</td>
      </tr>
      <tr>
        <td>重复性评分</td>
        <td style="font-family:monospace;font-weight:bold;color:${gradeColor(result.repeatabilityGrade)}">${result.repeatabilityScore.toFixed(1)}</td>
        <td colspan="2">评分公式: max(0, 100 - 最大偏差%FSO)</td>
      </tr>
    </table>
  </div>` : ""}

  <!-- 各点位/各次ADC均值对比图 -->
  <div class="section">
    <div class="section-title">${result.testType === "repeatability" ? "各次按压ADC均值对比图" : "各点位ADC均值对比图"}</div>
    <div style="text-align:center">
      <img src="${barImage}" width="480" style="border:1px solid #eee;border-radius:4px" />
      <div style="font-size:9px;color:#999;margin-top:4px">${result.testType === "repeatability" ? "蓝色柱: 各次按压稳定后均值 | 蓝色虚线: 总体均值" : "蓝色柱: 各点位ADC均值 | 红色误差线: \u00b1标准差 | 蓝色虚线: 总体均值"}</div>
    </div>
  </div>

  <!-- 各点位/各次详细数据表 -->
  <div class="section" style="page-break-before:always;">
    <div class="section-title">${result.testType === "repeatability" ? "各次按压详细数据" : "各点位详细数据"}</div>
    <table>
      <tr>
        <th style="text-align:center;width:50px">序号</th>
        <th style="text-align:center;width:80px">点位坐标</th>
        <th style="text-align:center;width:80px">ADC均值</th>
        <th style="text-align:center;width:70px">标准差</th>
        <th style="text-align:center;width:60px">最大值</th>
        <th style="text-align:center;width:60px">最小值</th>
        <th style="text-align:center;width:65px">持续时间</th>
        <th style="text-align:center;width:60px">采集帧数</th>
      </tr>
      ${pointRows}
    </table>
    ${config ? `
    <div style="margin-top:8px;padding:6px 10px;background:#f5f7fa;border-radius:4px;font-size:10px;color:#666">
      <strong>测试参数:</strong>
      按压检测阈值=${config.pressThreshold} |
      释放检测阈值=${config.releaseThreshold} |
      最小采集时间=${(config.minSampleTime / 1000).toFixed(1)}s |
      稳定判定标准差\u2264${config.stableStdThreshold}
    </div>
    ` : ""}
  </div>
  `;
}

export async function generateReport(data: ReportData): Promise<void> {
  const { matrixSize, adcThreshold, stats, matrixData, timestamp, autoTestResult, autoTestConfig, sampleId } = data;

  const dim = parseInt(matrixSize.split("x")[0]);
  const matrixCanvas = drawMatrixToCanvas(matrixData, dim, adcThreshold, 500);
  const matrixImage = matrixCanvas.toDataURL("image/png");

  const hasAutoTest = !!autoTestResult && autoTestResult.pressCount >= 2;
  const reportTitle = hasAutoTest ? "柔性压力传感器砝码按压验收测试报告" : "柔性压力传感器验收测试报告";
  const reportTitleEn = hasAutoTest ? "Flexible Pressure Sensor Weight-Press Acceptance Test Report" : "Flexible Pressure Sensor Acceptance Test Report";

  // Build auto test section if available
  const autoTestSection = hasAutoTest
    ? buildAutoTestSection(autoTestResult, autoTestConfig, sampleId)
    : "";

  // Build HTML report
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${reportTitle}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #1a1a2e; font-size: 11px; line-height: 1.6; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #1e6fd9; margin-bottom: 20px; }
    .header h1 { font-size: 20px; color: #1e6fd9; letter-spacing: 4px; }
    .header .subtitle { font-size: 11px; color: #666; margin-top: 6px; }
    .header .company { font-size: 13px; color: #333; margin-top: 4px; font-weight: bold; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 13px; font-weight: bold; color: #1e6fd9; padding: 6px 12px; background: #f0f5ff; border-left: 4px solid #1e6fd9; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 5px 8px; border: 1px solid #ddd; text-align: left; font-size: 10.5px; }
    th { background: #f5f7fa; font-weight: bold; color: #333; }
    .grade { display: inline-block; padding: 1px 8px; border-radius: 3px; color: white; font-size: 10px; font-weight: bold; }
    .matrix-img { display: block; margin: 10px auto; border: 1px solid #ddd; }
    .score-box { display: inline-block; width: 56px; height: 56px; line-height: 56px; text-align: center; border-radius: 50%; color: white; font-size: 18px; font-weight: bold; margin: 0 8px; }
    .scores-row { text-align: center; margin: 15px 0; }
    .score-label { display: block; font-size: 10px; color: #666; margin-top: 4px; }
    .footer { text-align: center; padding-top: 15px; border-top: 1px solid #ddd; margin-top: 20px; font-size: 10px; color: #999; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .info-grid td:first-child { width: 120px; color: #666; }
    .highlight { color: #1e6fd9; font-weight: bold; }
    .warn { color: #f59e0b; }
    .danger { color: #666666; font-weight: bold; }
    .success { color: #22c55e; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">威海矩侨工业科技有限公司</div>
    <h1>${reportTitle}</h1>
    <div class="subtitle">${reportTitleEn}</div>
  </div>

  <div class="section">
    <div class="section-title">基本信息</div>
    <table>
      <tr>
        <td style="width:110px;color:#666">测试时间</td>
        <td>${timestamp.toLocaleString("zh-CN")}</td>
        <td style="width:110px;color:#666">矩阵规格</td>
        <td>${matrixSize} (${dim * dim}点)</td>
      </tr>

      ${sampleId ? `<tr><td style="color:#666">样品编号</td><td colspan="3" style="font-family:monospace;font-weight:bold">${sampleId}</td></tr>` : ""}
      ${hasAutoTest ? `<tr><td style="color:#666">测试模式</td><td colspan="3" style="font-weight:bold;font-size:13px">砝码按压验收测试 - ${autoTestResult.testType === "repeatability" ? `重复性 (${autoTestResult.pressCount}次按压)` : `一致性 (${autoTestResult.pressCount}个点位)`}</td></tr>` : ""}
      ${autoTestConfig?.weightGrams ? `<tr><td style="color:#666">砝码重量</td><td>${autoTestConfig.weightGrams} g</td><td style="color:#666">环境温度</td><td>${autoTestConfig.temperature || "未记录"} °C</td></tr>` : ""}
      ${autoTestConfig?.operator ? `<tr><td style="color:#666">测试人员</td><td>${autoTestConfig.operator}</td><td style="color:#666">测试备注</td><td>${autoTestConfig.notes || "无"}</td></tr>` : ""}
    </table>
  </div>

  ${autoTestSection}

  <div class="footer">
    <p>本报告由「矩侨工业 - 压力传感器验收分析系统」自动生成</p>
    <p>威海矩侨工业科技有限公司 | ${timestamp.toLocaleDateString("zh-CN")}</p>
  </div>
</body>
</html>`;

  // Open print dialog for PDF export
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // Fallback: download as HTML
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JQ_${hasAutoTest ? "砝码验收" : "验收"}报告_${matrixSize}_${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for images to load then trigger print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}
