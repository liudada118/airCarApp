# 自动化验收流程重构

## 任务清单
- [x] 重写 auto-test.ts: 新数据模型（RegionPress记录区域内所有点位数据，多次RegionPress对比）
- [x] 重写 auto-test.ts: 区域检测算法（检测超阈值的所有点位，而非单个最大点）
- [x] 重写 auto-test.ts: 多区域对比分析（均匀性、一致性、重复性跨区域对比）
- [x] 重写 AutoTestPanel.tsx: 适配新流程UI（显示区域点位数、各区域汇总、对比结果）
- [x] 更新 Home.tsx: handleStartAutoTest / handleStopAutoTest / onMatrixFrame回调
- [x] 更新 report-generator.ts: 适配新的多区域对比结果
- [x] TypeScript编译零错误
- [ ] 保存检查点
