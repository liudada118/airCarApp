# -*- coding: utf-8 -*-
"""
汽车座椅智能控制算法包 - 统一版本管理

版本号遵循语义化版本规范 (Semantic Versioning 2.0.0):
    MAJOR.MINOR.PATCH
    - MAJOR: 不兼容的API变更
    - MINOR: 向后兼容的功能新增
    - PATCH: 向后兼容的问题修复

使用方式:
    from version import __version__
    # print(__version__)  # "1.0.0"

版本号更新规则:
    1. 修复bug（不改变接口）: 递增 PATCH (1.0.0 → 1.0.1)
    2. 新增功能（向后兼容）: 递增 MINOR, PATCH归零 (1.0.1 → 1.1.0)
    3. 重大重构（不兼容变更）: 递增 MAJOR, MINOR和PATCH归零 (1.1.0 → 2.0.0)
"""

# ===== 版本号定义（唯一真实来源 Single Source of Truth）=====
__version__ = "1.0.2"

# ===== 版本元信息 =====
__version_info__ = tuple(int(x) for x in __version__.split("."))
__author__ = "Hirkond"
__project__ = "汽车座椅智能控制算法包"

# ===== 版本历史摘要 =====
# 1.0.2 (2026-03-04)
#   - 腿托控制算法V2：重心划分左右腿 + 前3后3比 + 左右独立阈值
#   - 品味采集同步改为前3后3比方案
#   - 品味系统文档更新，清理服务端内容
#
# 1.0.0 (2026-03-04)
#   - 集成座椅控制系统（状态机、自适应调节锁）
#   - 活体检测 + 体型检测（大人/小孩/空座）
#   - 体型三分类（瘦小/中等/高大）
#   - 品味记忆功能（记录/恢复/持久化）
#   - 方案C：体型识别自动触发+外部触发双模式
#   - 三字段精简输出（seat_status / body_shape_info / airbag_command）
#   - 离座时体型状态重置
#   - 腰托/侧翼/腿托自适应控制
