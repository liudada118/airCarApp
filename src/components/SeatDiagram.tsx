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
 * 10 个气囊的座椅示意图
 *
 * 布局参照用户提供的设计稿截图：
 *   靠背上部: 1(shoulderL)  2(shoulderR)
 *   靠背中部: 3(sideWingL)  5(lumbarUp)/6(lumbarDown)  4(sideWingR)
 *   坐垫前部: 7(cushionFL)  8(cushionFR)
 *   坐垫后部: 9(cushionRL)  10(cushionRR)
 *
 * 气囊状态由 commandStates 驱动：
 *   指令 3 → 蓝色背景 + ↑ 箭头（充气）
 *   指令 4 → 蓝色背景 + ↓ 箭头（放气）
 *   指令 0 → 无背景 + 无箭头（空闲）
 *
 * 基准尺寸适配新座椅图 (791×924px, 宽高比 0.856:1)
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

      {/* ─── 靠背上部: 1(shoulderL) 2(shoulderR) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('shoulderL'),
          {
            top: 72 * s,
            left: 87 * s,
            width: 52 * s,
            height: 25 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('shoulderL', 8 * s)}
      </View>
      <View
        style={[
          styles.zone,
          getZoneStyle('shoulderR'),
          {
            top: 72 * s,
            right: 85 * s,
            width: 51 * s,
            height: 25 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('shoulderR', 8 * s)}
      </View>

      {/* ─── 靠背中部: 3(sideWingL) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('sideWingL'),
          {
            top: 144 * s,
            left: 80 * s,
            width: 24 * s,
            height: 59 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('sideWingL', 8 * s)}
      </View>

      {/* ─── 靠背中部: 4(sideWingR) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('sideWingR'),
          {
            top: 143 * s,
            right: 75 * s,
            width: 24 * s,
            height: 60 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('sideWingR', 8 * s)}
      </View>

      {/* ─── 靠背中部: 5(lumbarUp) 6(lumbarDown) ─── */}
      <View
        style={{
          position: 'absolute',
          top: 144 * s,
          left: 110 * s,
          right: 105 * s,
          height: 59 * s,
        }}>
        {/* 5: lumbarUp - 上半部分 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('lumbarUp'),
            {
              width: '100%',
              height: '50%',
              borderTopLeftRadius: 8 * s,
              borderTopRightRadius: 8 * s,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}>
          {renderArrow('lumbarUp', 8 * s)}
        </View>
        {/* 虚线分隔 */}
        <View style={[styles.dashedLine, {height: 1 * s}]} />
        {/* 6: lumbarDown - 下半部分 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('lumbarDown'),
            {
              width: '100%',
              height: '50%',
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}>
          {renderArrow('lumbarDown', 8 * s)}
        </View>
      </View>

      {/* ─── 坐垫后部: 6(cushionRL) + 6(cushionRR) ─── */}
      <View
        style={{
          position: 'absolute',
          top: 221 * s,
          left: 85 * s,
          right: 78 * s,
          height: 43 * s,
          flexDirection: 'row',
        }}>
        {/* cushionRL */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('cushionRL'),
            {
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 8 * s,
              borderBottomLeftRadius: 8 * s,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}>
          {renderArrow('cushionRL', 10 * s)}
        </View>
        {/* 竖向虚线分隔 */}
        <View style={[styles.dashedLineVertical, {width: 1 * s}]} />
        {/* cushionRR */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle('cushionRR'),
            {
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderTopRightRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}>
          {renderArrow('cushionRR', 10 * s)}
        </View>
      </View>

      {/* ─── 坐垫前端: 7(cushionFL) 8(cushionFR) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('cushionFL'),
          {
            top: 267 * s,
            left: 77 * s,
            width: 60 * s,
            height: 24 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('cushionFL', 8 * s)}
      </View>
      <View
        style={[
          styles.zone,
          getZoneStyle('cushionFR'),
          {
            top: 268 * s,
            right: 75 * s,
            width: 60 * s,
            height: 24 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {renderArrow('cushionFR', 8 * s)}
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
