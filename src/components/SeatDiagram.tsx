import React from 'react';
import {View, Image, StyleSheet} from 'react-native';
import type {AirbagZone, AirbagValues, AirbagCommandStates, AirbagCommandState} from '../types';

// 座椅背景图
const SEAT_BG = require('../assets/images/seat_bg.png');

interface SeatDiagramProps {
  activeZone: AirbagZone | null;
  /** 缩放比例，默认 1 */
  scale?: number;
  /** 是否显示所有气囊激活状态（首页缩略图用） */
  showAllActive?: boolean;
  /** 各气囊的数值，用于判断是否激活 */
  values?: Partial<AirbagValues>;
  /** 气囊指令状态（来自 airbag_command 解析结果） */
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
 * 根据 command 状态获取气囊区域的样式
 *
 * 指令 3 = 充气：蓝色背景 + 向上箭头
 * 指令 4 = 放气：蓝色背景 + 向下箭头
 * 指令 0 = 空闲：无背景色 + 无箭头
 */
function getZoneStyleByCommand(cmd: AirbagCommandState) {
  if (cmd === 3 || cmd === 4) {
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
 * 5 组气囊的座椅示意图
 *
 * 布局参照用户提供的设计稿截图：
 *   靠背上部: shoulder（肩部气囊 1,2）- 左右两块
 *   靠背中部: sideWing（侧翼气囊 3,4）- 左右两块
 *             lumbar（腰托气囊 5,6）- 中间两块
 *   坐垫区域: hipFirm（臀部软硬度 7,8）- 左右两块
 *   坐垫前部: legRest（腿托气囊 9,10）- 左右两块
 *
 * 气囊状态由 commandStates 驱动：
 *   指令 3 → 蓝色背景 + ↑ 箭头（充气）
 *   指令 4 → 蓝色背景 + ↓ 箭头（放气）
 *   指令 0 → 无背景 + 无箭头（空闲）
 */
const SeatDiagram: React.FC<SeatDiagramProps> = ({
  activeZone,
  scale = 1,
  showAllActive = false,
  values,
  commandStates,
}) => {
  /** 获取某个气囊的指令状态 */
  const getCmd = (zone: AirbagZone): AirbagCommandState => {
    if (commandStates) {
      return commandStates[zone] ?? 0;
    }
    // 无 commandStates 时，使用 showAllActive/activeZone 的旧逻辑做 fallback
    if (showAllActive && values && (values[zone] ?? 0) > 0) {
      return 3; // 模拟充气状态
    }
    if (activeZone === zone) {
      return 3;
    }
    return 0;
  };

  /** 获取气囊区域样式 */
  const getZoneStyle = (zone: AirbagZone) => {
    return getZoneStyleByCommand(getCmd(zone));
  };

  /** 渲染气囊箭头（仅在指令为 3 或 4 时显示） */
  const renderArrow = (zone: AirbagZone, arrowSize: number) => {
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

  // 基准尺寸（设计稿中座椅图的参考尺寸）
  const W = 240 * s;
  const H = 380 * s;

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
            top: 52 * s,
            left: 48 * s,
            width: 62 * s,
            height: 30 * s,
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
            top: 52 * s,
            right: 48 * s,
            width: 62 * s,
            height: 30 * s,
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
            top: 120 * s,
            left: 28 * s,
            width: 26 * s,
            height: 60 * s,
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
            top: 120 * s,
            right: 28 * s,
            width: 26 * s,
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
          top: 112 * s,
          left: 62 * s,
          right: 62 * s,
          height: 76 * s,
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
          top: 248 * s,
          left: 52 * s,
          right: 52 * s,
          height: 42 * s,
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
            top: 298 * s,
            left: 52 * s,
            width: 58 * s,
            height: 28 * s,
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
            top: 298 * s,
            right: 52 * s,
            width: 58 * s,
            height: 28 * s,
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

export default SeatDiagram;
