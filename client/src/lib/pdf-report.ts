/**
 * 专业质检报告 PDF 生成器 v6
 * 布局: 第一页完整占满测试结果, 第二页完整占满公式说明
 */
import type { PointComparisonResult, AutoTestConfig, AcceptanceTestType } from "@/lib/auto-test";

const FONT = {
  TITLE: 16,
  SECTION: 11.5,
  BODY: 9.5,
  TABLE_HEAD: 8.5,
  TABLE_BODY: 8,
  CAPTION: 7.5,
  FOOTER: 6.5,
  SMALL: 6,
};

const CLR = {
  PRI: [25, 70, 130] as [number, number, number],
  SEC: [50, 60, 80] as [number, number, number],
  MUT: [110, 120, 140] as [number, number, number],
  BDR: [185, 195, 215] as [number, number, number],
  LBG: [244, 246, 252] as [number, number, number],
  OK: [0, 110, 55] as [number, number, number],
  NG: [190, 30, 30] as [number, number, number],
  ACC: [25, 90, 190] as [number, number, number],
};

interface PDFReportOptions {
  result: PointComparisonResult;
  testType: AcceptanceTestType;
  config?: AutoTestConfig | null;
  matrixSize?: string;
  startTime?: Date | null;
}

export async function generatePDFReport(opts: PDFReportOptions) {
  const { result, testType, config, matrixSize, startTime } = opts;
  const { default: jsPDF } = await import("jspdf");
  const { NOTO_SANS_SC_BASE64 } = await import("@/lib/chinese-font");
  const { JQ_LOGO_BASE64 } = await import("@/lib/logo-base64");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addFileToVFS("NotoSansSC.ttf", NOTO_SANS_SC_BASE64);
  pdf.addFont("NotoSansSC.ttf", "NotoSansSC", "normal");

  const font = (sz: number) => { pdf.setFontSize(sz); pdf.setFont("NotoSansSC", "normal"); };
  const tc = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
  const dc = (c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);
  const fc = (r: number, g: number, b: number) => pdf.setFillColor(r, g, b);

  const PW = 210, PH = 297, MG = 16;
  const CW = PW - MG * 2;

  const isR = testType === "repeatability";
  const score = isR ? result.repeatabilityScore : result.consistencyScore;
  const grade = isR ? result.repeatabilityGrade : result.consistencyGrade;
  const dt = startTime || new Date();
  const rid = `JQ-${isR ? "RPT" : "CST"}-${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}-${String(dt.getHours()).padStart(2, "0")}${String(dt.getMinutes()).padStart(2, "0")}`;
  const dtStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

  const sm = (matrixSize || "5x5").match(/(\d+)\s*[xX\u00d7]\s*(\d+)/);
  const mR = sm ? parseInt(sm[1]) : 5;
  const mC = sm ? parseInt(sm[2]) : 5;
  const pass = score >= 60;

  // ===== 页眉 =====
  const header = () => {
    pdf.addImage(JQ_LOGO_BASE64, "PNG", MG, 8, 36, 10);
    font(FONT.FOOTER); tc(CLR.MUT);
    pdf.text(rid, PW - MG, 14, { align: "right" });
    dc(CLR.PRI); pdf.setLineWidth(0.5);
    pdf.line(MG, 21, PW - MG, 21);
    dc(CLR.BDR); pdf.setLineWidth(0.12);
    pdf.line(MG, 21.7, PW - MG, 21.7);
  };

  // ===== 页脚 =====
  const footer = (p: number, t: number) => {
    const fy = PH - 10;
    dc(CLR.BDR); pdf.setLineWidth(0.12);
    pdf.line(MG, fy, PW - MG, fy);
    font(FONT.FOOTER); tc(CLR.MUT);
    pdf.text("矩侨工业 | 压力传感器矩阵分析系统", MG, fy + 4);
    pdf.text(`${p} / ${t}`, PW - MG, fy + 4, { align: "right" });
  };

  // ===== 章节标题 =====
  const section = (title: string, y: number): number => {
    font(FONT.SECTION); tc(CLR.PRI);
    pdf.text(title, MG, y);
    dc(CLR.BDR); pdf.setLineWidth(0.2);
    const tw = pdf.getTextWidth(title);
    pdf.line(MG + tw + 2, y - 1, PW - MG, y - 1);
    return y + 6;
  };

  // ===== 通用表格 =====
  const drawTable = (headers: string[], colRatios: number[], rows: string[][], rowColors: (boolean | null)[] | undefined, startY: number, rowH: number = 6.2): number => {
    let ty = startY;
    const headH = rowH + 0.5;

    fc(232, 237, 248); pdf.rect(MG, ty, CW, headH, "F");
    dc(CLR.BDR); pdf.setLineWidth(0.12); pdf.rect(MG, ty, CW, headH, "S");
    font(FONT.TABLE_HEAD); tc(CLR.PRI);
    headers.forEach((h, i) => {
      pdf.text(h, MG + CW * colRatios[i] + 3, ty + headH - 2);
    });
    ty += headH;

    font(FONT.TABLE_BODY);
    rows.forEach((row, idx) => {
      if (idx % 2 === 0) {
        fc(249, 250, 254); pdf.rect(MG, ty, CW, rowH, "F");
      }
      dc(CLR.BDR); pdf.setLineWidth(0.06);
      pdf.line(MG, ty + rowH, PW - MG, ty + rowH);

      row.forEach((cell, ci) => {
        if (ci === row.length - 1 && rowColors && rowColors[idx] !== null) {
          tc(rowColors[idx] ? CLR.OK : CLR.NG);
        } else {
          tc(CLR.SEC);
        }
        pdf.text(cell, MG + CW * colRatios[ci] + 3, ty + rowH - 2);
      });
      ty += rowH;
    });

    dc(CLR.BDR); pdf.setLineWidth(0.15);
    pdf.line(MG, ty, PW - MG, ty);
    return ty + 2;
  };

  // ============================================================
  //  第一页: 测试结果 (占满整页)
  // ============================================================
  header();
  let y = 27;

  // 报告标题
  font(FONT.TITLE); tc(CLR.PRI);
  pdf.text(isR ? "重复性验收测试报告" : "一致性验收测试报告", PW / 2, y, { align: "center" });
  y += 5;
  font(FONT.BODY); tc(CLR.MUT);
  pdf.text(`ISO 5725 | ${dtStr}`, PW / 2, y, { align: "center" });
  y += 8;

  // ---- 检验结论框 (一行三列: 检验结论 / 综合评分 / 评定等级) ----
  const vbH = 14;
  const vc = pass ? CLR.OK : CLR.NG;
  // 绿色边框
  dc(vc); pdf.setLineWidth(0.8);
  pdf.roundedRect(MG, y, CW, vbH, 3, 3, "S");
  // 浅绿背景
  fc(pass ? 240 : 255, pass ? 252 : 240, pass ? 245 : 240);
  pdf.roundedRect(MG + 0.5, y + 0.5, CW - 1, vbH - 1, 2.5, 2.5, "F");

  const colW = CW / 3;
  const cy = y + vbH / 2 + 1.5;

  // 左侧: 检验结论
  font(FONT.BODY); tc(CLR.SEC);
  pdf.text("检验结论:", MG + 8, cy);
  font(14); tc(vc);
  pdf.text(pass ? "合格" : "不合格", MG + 8 + 22, cy);

  // 中间: 综合评分
  font(FONT.BODY); tc(CLR.SEC);
  pdf.text("综合评分:", MG + colW + 8, cy);
  font(14); tc(CLR.ACC);
  const scoreStr = score.toFixed(1);
  pdf.text(scoreStr, MG + colW + 8 + 16, cy);
  font(FONT.BODY); tc(CLR.SEC);
  pdf.text("分", MG + colW + 8 + 16 + pdf.getTextWidth(scoreStr) + 7, cy);

  // 右侧: 评定等级
  font(FONT.BODY); tc(CLR.SEC);
  pdf.text("评定等级:", MG + colW * 2 + 8, cy);
  font(14); tc(vc);
  pdf.text(grade, MG + colW * 2 + 8 + 22, cy);

  y += vbH + 7;

  // ---- 1. 基本信息 + 矩阵示意图 (并排) ----
  y = section("1  基本信息", y);

  const info: [string, string][] = [
    ["测试日期", dtStr],
    ["测试类型", isR ? "重复性测试" : "一致性测试"],
    ["矩阵规格", `${mR} x ${mC} (${mR * mC}点)`],
    ["样本数", isR ? `${result.pressCount}次按压` : `${result.pressCount}个点位`],
  ];
  if (config?.sampleId) info.push(["样品编号", config.sampleId]);
  if (config?.weightGrams) info.push(["砝码重量", `${config.weightGrams} g`]);
  if (config?.temperature) info.push(["\u73af\u5883\u6e29\u5ea6", `${config.temperature} \u2103`]);
  if (config?.operator) info.push(["测试人员", config.operator]);

  // 左侧: 基本信息文字 (占60%宽度)
  font(FONT.BODY);
  const infoW = CW * 0.58;
  for (let i = 0; i < info.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = MG + col * (infoW / 2);
    const by = y + row * 5.5;
    tc(CLR.MUT);
    pdf.text(info[i][0] + ": ", bx, by);
    tc(CLR.SEC);
    const lw = pdf.getTextWidth(info[i][0] + ": ");
    pdf.text(info[i][1], bx + lw, by);
  }

  // 右侧: 矩阵示意图
  const matX = MG + CW * 0.62;
  const matY = y - 2;
  const cs = Math.min(4.5, (CW * 0.35) / mC);
  const tested = new Set(result.pressEvents.map(e => `${e.position[0]},${e.position[1]}`));

  for (let r = 0; r < mR; r++) {
    for (let c = 0; c < mC; c++) {
      const cx = matX + c * (cs + 0.5);
      const cy = matY + r * (cs + 0.5);
      if (tested.has(`${r},${c}`)) {
        fc(34, 197, 94);
      } else {
        fc(218, 224, 234);
      }
      pdf.roundedRect(cx, cy, cs, cs, 0.4, 0.4, "F");
    }
  }
  const lgY = matY + mR * (cs + 0.5) + 2;
  font(FONT.SMALL);
  fc(34, 197, 94); pdf.roundedRect(matX, lgY, 2.5, 2.5, 0.3, 0.3, "F");
  tc(CLR.SEC); pdf.text("已测", matX + 3.5, lgY + 2);
  fc(218, 224, 234); pdf.roundedRect(matX + 13, lgY, 2.5, 2.5, 0.3, 0.3, "F");
  pdf.text("未测", matX + 17, lgY + 2);

  const infoEndY = y + Math.ceil(info.length / 2) * 5.5;
  const matEndY = lgY + 5;
  y = Math.max(infoEndY, matEndY) + 4;

  // ---- 2. 检测结果 ----
  y = section("2  检测结果", y);

  const mHeaders = ["指标", "数值", "标准", "判定"];
  const mColR = [0, 0.32, 0.56, 0.80];

  const metricRows: string[][] = isR ? [
    ["综合评分", score.toFixed(1), ">= 60", score >= 60 ? "通过" : "未通过"],
    ["变异系数 CV%", result.repeatabilityCV.toFixed(3), "< 10", result.repeatabilityCV < 10 ? "通过" : "未通过"],
    ["最大偏差 eR%", result.repeatabilityER.toFixed(3), "< 10", result.repeatabilityER < 10 ? "通过" : "未通过"],
    ["ADC均值", result.repeatMean.toFixed(2), "-", "-"],
    ["ADC标准差", result.repeatStd.toFixed(3), "-", "-"],
  ] : [
    ["综合评分", score.toFixed(1), ">= 60", score >= 60 ? "通过" : "未通过"],
    ["相对标准偏差 RSD%", result.consistencyRSD.toFixed(3), "< 10", result.consistencyRSD < 10 ? "通过" : "未通过"],
    ["点间均值", result.interPointMean.toFixed(2), "-", "-"],
    ["点间标准差", result.interPointStd.toFixed(3), "-", "-"],
    ["测试点数", `${result.pressCount}`, ">= 2", result.pressCount >= 2 ? "通过" : "未通过"],
  ];

  const mColors: (boolean | null)[] = isR
    ? [score >= 60, result.repeatabilityCV < 10, result.repeatabilityER < 10, null, null]
    : [score >= 60, result.consistencyRSD < 10, null, null, result.pressCount >= 2];

  y = drawTable(mHeaders, mColR, metricRows, mColors, y, 6.5);
  y += 3;

  // ---- 3. 原始数据记录 ----
  y = section("3  原始数据记录", y);

  if (result.pressCount < 5) {
    font(FONT.CAPTION); pdf.setTextColor(200, 120, 0);
    pdf.text(`[提示] 样本数=${result.pressCount}, 建议>=5次以保证统计显著性`, MG + 2, y);
    y += 4;
  }

  if (result.pressEvents.length > 0) {
    const dHeaders = ["#", "行,列", "ADC均值", isR ? "标准差" : "偏差"];
    const dColR = [0, 0.32, 0.56, 0.80];

    // 动态计算: 剩余空间分配给数据表和图表
    const footerReserve = 14;
    const chartSectionH = 55; // 图表章节标题+图表+标注
    const remainForData = PH - y - footerReserve - chartSectionH;
    const dataRowH = 5.8;
    const dataHeaderH = 7;
    const maxRows = Math.max(2, Math.floor((remainForData - dataHeaderH) / dataRowH));
    const showRows = Math.min(result.pressEvents.length, maxRows, 15);

    const dRows: string[][] = [];
    for (let i = 0; i < showRows; i++) {
      const ev = result.pressEvents[i];
      const dev = isR ? ev.stdValue.toFixed(2) : (ev.meanValue - result.interPointMean).toFixed(2);
      dRows.push([
        `${ev.index}`,
        `${ev.position[0]},${ev.position[1]}`,
        `${ev.meanValue.toFixed(1)}`,
        dev,
      ]);
    }

    y = drawTable(dHeaders, dColR, dRows, undefined, y, dataRowH);

    if (result.pressEvents.length > showRows) {
      font(FONT.CAPTION); tc(CLR.MUT);
      pdf.text(`(共${result.pressEvents.length}条记录, 显示前${showRows}条)`, MG + 2, y + 1);
      y += 4;
    }
    y += 3;
  }

  // ---- 4. ADC对比图 (自动填满剩余空间) ----
  y = section("4  ADC对比图", y);

  if (result.pressEvents.length > 0) {
    const chartX = MG + 6;
    const chartW = CW - 12;
    const footerY = PH - 14;
    // 图表填满到页脚前，留8mm给标注
    const chartH = Math.max(20, footerY - y - 10);
    const chartY = y;
    const padT = 5, padB = 6;
    const dH = chartH - padT - padB;
    const dW = chartW;

    // 背景
    fc(251, 252, 255); dc(CLR.BDR); pdf.setLineWidth(0.12);
    pdf.roundedRect(chartX, chartY, chartW, chartH, 1, 1, "FD");

    const evts = result.pressEvents;
    const vals = evts.map(e => e.meanValue);
    const iStd = result.interPointStd;
    const stds = isR ? evts.map(e => e.stdValue) : evts.map(() => iStd);
    const maxV = Math.max(...vals.map((v, i) => v + stds[i])) * 1.12;
    const minV = Math.max(0, Math.min(...vals.map((v, i) => v - stds[i])) * 0.88);
    const rng = maxV - minV || 1;

    // 网格线
    dc([228, 233, 243]); pdf.setLineWidth(0.06);
    for (let g = 1; g <= 4; g++) {
      const gy = chartY + padT + (dH * g) / 5;
      pdf.line(chartX + 1, gy, chartX + dW - 1, gy);
    }

    // Y轴刻度
    font(FONT.SMALL); tc(CLR.MUT);
    for (let g = 0; g <= 5; g++) {
      const gy = chartY + padT + (dH * g) / 5;
      const val = maxV - (rng * g) / 5;
      pdf.text(val.toFixed(0), chartX - 1, gy + 1, { align: "right" });
    }

    // 柱宽计算
    const n = evts.length;
    const bArea = dW - 8;
    let bW: number, gap: number;
    if (n === 1) { bW = 10; gap = (bArea - 10) / 2; }
    else if (n <= 6) { bW = Math.min(10, bArea / (n * 1.6)); gap = (bArea - n * bW) / (n + 1); }
    else if (n <= 12) { bW = Math.min(7, bArea / (n * 1.5)); gap = (bArea - n * bW) / (n + 1); }
    else { bW = Math.max(1.5, (bArea * 0.7) / n); gap = (bArea - n * bW) / (n + 1); }

    // 均值线
    const mean = isR ? result.repeatMean : result.interPointMean;
    const mNorm = (mean - minV) / rng;
    const mYp = chartY + padT + dH * (1 - mNorm);
    dc(CLR.ACC); pdf.setLineWidth(0.3);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(chartX + 1, mYp, chartX + dW - 1, mYp);
    pdf.setLineDashPattern([], 0);
    font(FONT.CAPTION); tc(CLR.ACC);
    pdf.text(`均值=${mean.toFixed(1)}`, chartX + 3, mYp - 2);

    // 柱状图
    evts.forEach((ev, i) => {
      const bx = chartX + 4 + gap + i * (bW + gap);
      const norm = (ev.meanValue - minV) / rng;
      const bh = Math.max(0.5, dH * norm);
      const by = chartY + padT + dH - bh;
      fc(55, 105, 185); pdf.roundedRect(bx, by, bW, bh, 0.3, 0.3, "F");

      // 误差线
      const es = stds[i];
      if (es > 0) {
        const etn = (ev.meanValue + es - minV) / rng;
        const ebn = (Math.max(0, ev.meanValue - es) - minV) / rng;
        const et = chartY + padT + dH * (1 - etn);
        const eb = chartY + padT + dH * (1 - ebn);
        const bc = bx + bW / 2;
        dc([70, 80, 100]); pdf.setLineWidth(0.12);
        pdf.line(bc, et, bc, eb);
        pdf.line(bc - 1, et, bc + 1, et);
        pdf.line(bc - 1, eb, bc + 1, eb);
      }

      // X轴标签
      if (n <= 15 || i % Math.ceil(n / 12) === 0) {
        font(FONT.SMALL); tc(CLR.MUT);
        pdf.text(`#${ev.index}`, bx + bW / 2, chartY + chartH - 1.5, { align: "center" });
      }
    });

    y = chartY + chartH + 2;
    font(FONT.CAPTION); tc(CLR.MUT);
    const cap = isR
      ? "图1: 各次按压ADC均值对比 (误差线: 时域标准差)"
      : "图1: 各点位ADC均值对比 (误差线: 点间标准差)";
    pdf.text(cap, MG + 4, y);
  }

  footer(1, 2);

  // ============================================================
  //  第二页: 计算方法说明 (占满整页)
  // ============================================================
  pdf.addPage();
  header();
  y = 27;

  font(FONT.TITLE); tc(CLR.PRI);
  pdf.text("附录: 检测指标计算方法", PW / 2, y, { align: "center" });
  y += 5;
  font(FONT.BODY); tc(CLR.MUT);
  pdf.text("依据 ISO 5725 测量方法与结果的准确度标准", PW / 2, y, { align: "center" });
  y += 10;

  // 第二页布局: 6个公式块 + 2个章节标题, 紧凑排列

  // 公式块绘制 (固定高度，均匀分布)
  const drawFormula = (num: string, title: string, expr: string, descs: string[], note: string, ys: number): number => {
    let cy = ys;

    font(FONT.SECTION); tc(CLR.PRI);
    pdf.text(`${num}  ${title}`, MG, cy);
    cy += 6;

    // 公式框
    fc(244, 246, 252); dc(CLR.BDR); pdf.setLineWidth(0.12);
    pdf.roundedRect(MG + 3, cy - 3.5, CW - 6, 9, 1.2, 1.2, "FD");
    font(10); tc(CLR.SEC);
    pdf.text(expr, PW / 2, cy + 2, { align: "center" });
    cy += 9.5;

    // 说明
    font(FONT.BODY); tc(CLR.SEC);
    for (const d of descs) {
      pdf.text(`  - ${d}`, MG + 3, cy);
      cy += 4.5;
    }

    // 注释
    if (note) {
      font(FONT.CAPTION); tc(CLR.MUT);
      const nl = pdf.splitTextToSize(note, CW - 8);
      pdf.text(nl, MG + 3, cy);
      cy += nl.length * 3.5;
    }

    // 分隔线
    dc([232, 238, 248]); pdf.setLineWidth(0.08);
    cy += 2;
    pdf.line(MG + 8, cy, PW - MG - 8, cy);
    cy += 3;
    return cy;
  };

  // ---- A. 一致性测试指标 ----
  y = section("A. 一致性测试指标", y);
  y += 1;

  y = drawFormula("A.1", "相对标准偏差 RSD",
    "RSD = (S / Xmean) x 100%",
    ["S: 各点位ADC稳定均值的标准差",
     "Xmean: 所有点位ADC均值的算术平均",
     "RSD反映不同点位之间传感响应的离散程度"],
    "RSD<5% 优秀, 5%-10% 良好, >=10% 异常", y);

  y = drawFormula("A.2", "一致性评分",
    "Score = max(0, min(100, 100 - RSD))",
    ["评分由RSD直接推导",
     "RSD越小评分越高, 满分100"],
    "评分>=85 优秀, 60-84 良好, <60 异常", y);

  y = drawFormula("A.3", "点间均值与标准差",
    "Xmean = (1/n)*Sum(xi),  S = sqrt[(1/n)*Sum((xi-Xmean)^2)]",
    ["n: 测试点位总数",
     "xi: 第i个点位的ADC稳定均值"],
    "", y);

  // ---- B. 重复性测试指标 ----
  y = section("B. 重复性测试指标", y);
  y += 1;

  y = drawFormula("B.1", "变异系数 CV",
    "CV = (S / Xmean) x 100%",
    ["S: 同一点位多次按压ADC均值的标准差",
     "Xmean: 多次按压ADC均值的算术平均",
     "CV反映同一点位重复施压下响应的稳定性"],
    "CV<5% 优秀, 5%-10% 良好, >=10% 异常", y);

  y = drawFormula("B.2", "最大偏差 eR",
    "eR = [(max(xi) - min(xi)) / FSO] x 100%",
    ["max(xi)/min(xi): 多次按压中ADC均值的极值",
     "FSO: 传感器满量程输出值 (255)",
     "eR反映极端偏差占满量程的比例"],
    "eR<5% 优秀, 5%-10% 良好, >=10% 异常", y);

  y = drawFormula("B.3", "重复性评分",
    "Score = max(0, min(100, 100 - eR))",
    ["评分由最大偏差eR推导",
     "eR越小评分越高, 满分100"],
    "评分>=85 优秀, 60-84 良好, <60 异常", y);

  footer(2, 2);

  // 保存
  const fn = `质检报告_${isR ? "重复性" : "一致性"}_${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}.pdf`;
  pdf.save(fn);
}
