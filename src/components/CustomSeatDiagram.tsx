import React from 'react';
import {View, Image, StyleSheet} from 'react-native';
import type {CustomAirbagZone, CustomAirbagValues, AirbagCommandStates, AirbagCommandState} from '../types';

// 座椅背景图
const SEAT_BG = require('../assets/images/seat_bg.png');

interface CustomSeatDiagramProps {
  activeZone: CustomAirbagZone | null;
  /** 缩放比例，默认 1 */
  scale?: number;
  /** 各气囊的数值，用于判断是否激活 */
  values?: Partial<CustomAirbagValues>;
  /** 气囊指令状态（来自51字节回传指令解析结果） */
  commandStates?: AirbagCommandStates;
}

/**
 * 箭头指示器（三角形）
 */
const ArrowIndicator: React.FC<{
  direction: 'up' | 'down';
  size?: number;
}> = ({direction, size = 10}) => {
  return (
    <View style={[arrowStyles.container, {width: size, height: size}]}>
      <View
        style={[
          arrowStyles.arrow,
          {
            borderLeftWidth: size * 0.4,
            borderRightWidth: size * 0.4,
            borderBottomWidth: size * 0.6,
            borderBottomColor: 'rgba(255,255,255,0.85)',
            transform: [{rotate: direction === 'up' ? '0deg' : '180deg'}],
          },
        ]}
      />
    </View>
  );
};

const arrowStyles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});

/**
 * 自定义 zone 到物理气囊 zone 的映射
 * 每个自定义 zone 对应两个物理气囊
 */
const CUSTOM_TO_PHYSICAL: Record<CustomAirbagZone, [string, string]> = {
  shoulder: ['shoulderL', 'shoulderR'],
  sideWing: ['sideWingL', 'sideWingR'],
  lumbar: ['lumbarUp', 'lumbarDown'],
  hipFirm: ['cushionFL', 'cushionFR'],
  legRest: ['cushionRL', 'cushionRR'],
};

/**
 * 获取自定义 zone 的指令状态
 * 取两个物理气囊中优先级更高的状态（充气3 > 放气4 > 空闲0）
 */
function getCustomZoneCmd(
  zone: CustomAirbagZone,
  commandStates?: AirbagCommandStates,
): AirbagCommandState {
  if (!commandStates) return 0;
  const [z1, z2] = CUSTOM_TO_PHYSICAL[zone];
  const cmd1 = (commandStates as any)[z1] ?? 0;
  const cmd2 = (commandStates as any)[z2] ?? 0;
  // 优先返回充气(3)，其次放气(4)，最后空闲(0)
  if (cmd1 === 3 || cmd2 === 3) return 3;
  if (cmd1 === 4 || cmd2 === 4) return 4;
  return 0;
}

/**
 * 根据 command 状态获取气囊区域的样式
 *
 * 指令 3 = 充气：蓝色背景 + 向上箭头
 * 指令 4 = 放气：蓝色背景 + 向下箭头
 * 指令 0 = 空闲：无背景色 + 无箭头
 */
function getZoneStyleByCommand(cmd: AirbagCommandState, isActive: boolean) {
  if (cmd === 3 || cmd === 4) {
    return {
      backgroundColor: 'rgba(0, 150, 255, 0.45)',
      borderColor: 'rgba(0, 150, 255, 0.6)',
    };
  }
  if (isActive) {
    return {
      backgroundColor: 'rgba(0, 150, 255, 0.45)',
      borderColor: 'rgba(0, 150, 255, 0.6)',
    };
  }
  return {
    backgroundColor: 'rgba(100, 120, 160, 0.08)',
    borderColor: 'rgba(150, 160, 180, 0.2)',
  };
}

/**
 * 5 组气囊的座椅示意图（自定义气囊调节页面专用）
 *
 * 布局：
 *   靠背上部: shoulder（肩部气囊 1,2）- 左右两块
 *   靠背中部: sideWing（侧翼气囊 3,4）- 左右两块
 *             lumbar（腰托气囊 5,6）- 中间上下两块
 *   坐垫区域: hipFirm（臀部软硬度 7,8）- 左右两块
 *   坐垫前部: legRest（腿托气囊 9,10）- 左右两块
 *
 * 气囊状态由 commandStates 驱动：
 *   指令 3 → 蓝色背景 + ↑ 箭头（充气）
 *   指令 4 → 蓝色背景 + ↓ 箭头（放气）
 *   指令 0 → 无背景 + 无箭头（空闲）
 *
 * 基准尺寸适配新座椅图 (791×924px, 宽高比 0.856:1)
 */
const CustomSeatDiagram: React.FC<CustomSeatDiagramProps> = ({
  activeZone,
  scale = 1,
  values,
  commandStates,
}) => {
  /** 获取某个自定义 zone 的指令状态 */
  const getCmd = (zone: CustomAirbagZone): AirbagCommandState => {
    return getCustomZoneCmd(zone, commandStates);
  };

  const isActive = (zone: CustomAirbagZone): boolean => {
    return activeZone === zone;
  };

  /** 获取气囊区域样式 */
  const getZoneStyle = (zone: CustomAirbagZone) => {
    return getZoneStyleByCommand(getCmd(zone), isActive(zone));
  };

  /** 渲染气囊箭头（仅在指令为 3 或 4 时显示） */
  const renderArrow = (zone: CustomAirbagZone, arrowSize: number) => {
    const cmd = getCmd(zone);
    if (cmd === 3) {
      return <ArrowIndicator direction="up" size={arrowSize} />;
    }
    if (cmd === 4) {
      return <ArrowIndicator direction="down" size={arrowSize} />;
    }
    return null;
  };

  const s = scale;

  // 基准尺寸（适配新座椅图 791×924px）
  const W = 280 * s;
  const H = 327 * s;

  return (
    <View style={[styles.container, {width: W, height: H}]}>
      {/* 座椅背景图 */}
      <Image
        source={SEAT_BG}
        style={[styles.bgImage, {width: W, height: H}]}
        resizeMode="contain"
      />

      {/* ─── 肩部气囊 (shoulder): 靠背上部左右两块 ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('shoulder'),
          {
            top: 72 * s,
            left: 87 * s,
            width: 52 * s,
            height: 25 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('shoulder', 8 * s)}
      </View>
      <View
        style={[
          styles.zone,
          getZoneStyle('shoulder'),
          {
            top: 72 * s,
            right: 85 * s,
            width: 51 * s,
            height: 25 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('shoulder', 8 * s)}
      </View>

      {/* ─── 侧翼气囊 (sideWing): 靠背中部左右两侧 ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('sideWing'),
          {
            top: 144 * s,
            left: 80 * s,
            width: 24 * s,
            height: 59 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('sideWing', 8 * s)}
      </View>
      <View
        style={[
          styles.zone,
          getZoneStyle('sideWing'),
          {
            top: 143 * s,
            right: 75 * s,
            width: 24 * s,
            height: 60 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('sideWing', 8 * s)}
      </View>

      {/* ─── 腰托气囊 (lumbar): 靠背中部中间上下两块 ─── */}
      <View
        style={{
          position: 'absolute',
          top: 144 * s,
          left: 110 * s,
          right: 105 * s,
          height: 59 * s,
        }}>
        {/* 上半部分 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('lumbar'),
            {
              width: '100%',
              height: '50%',
              borderTopLeftRadius: 8 * s,
              borderTopRightRadius: 8 * s,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}>
          {renderArrow('lumbar', 8 * s)}
        </View>
        {/* 虚线分隔 */}
        <View style={[styles.dashedLine, {height: 1 * s}]} />
        {/* 下半部分 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('lumbar'),
            {
              width: '100%',
              height: '50%',
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}>
          {renderArrow('lumbar', 8 * s)}
        </View>
      </View>

      {/* ─── 臀部软硬度气囊 (hipFirm): 坐垫后部左右两块 ─── */}
      <View
        style={{
          position: 'absolute',
          top: 221 * s,
          left: 85 * s,
          right: 78 * s,
          height: 43 * s,
          flexDirection: 'row',
        }}>
        {/* 左 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('hipFirm'),
            {
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 8 * s,
              borderBottomLeftRadius: 8 * s,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}>
          {renderArrow('hipFirm', 10 * s)}
        </View>
        {/* 竖向虚线分隔 */}
        <View style={[styles.dashedLineVertical, {width: 1 * s}]} />
        {/* 右 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('hipFirm'),
            {
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderTopRightRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}>
          {renderArrow('hipFirm', 10 * s)}
        </View>
      </View>

      {/* ─── 腿托气囊 (legRest): 坐垫前部左右两块 ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('legRest'),
          {
            top: 267 * s,
            left: 77 * s,
            width: 60 * s,
            height: 24 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('legRest', 8 * s)}
      </View>
      <View
        style={[
          styles.zone,
          getZoneStyle('legRest'),
          {
            top: 268 * s,
            right: 75 * s,
            width: 60 * s,
            height: 24 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('legRest', 8 * s)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  zone: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  zoneRelative: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  dashedLine: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 160, 180, 0.4)',
    borderStyle: 'dashed',
  },
  dashedLineVertical: {
    height: '100%',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(150, 160, 180, 0.4)',
    borderStyle: 'dashed',
  },
});

export default React.memo(CustomSeatDiagram);
