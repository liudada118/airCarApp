import React from 'react';
import {View, Image, StyleSheet} from 'react-native';
import {Colors} from '../theme';
import type {AirbagZone, AirbagValues} from '../types';

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
}

/**
 * 箭头指示器（三角形）
 */
const ArrowIndicator: React.FC<{
  direction: 'up' | 'down' | 'left' | 'right';
  size?: number;
}> = ({direction, size = 10}) => {
  const rotations: Record<string, string> = {
    up: '0deg',
    right: '90deg',
    down: '180deg',
    left: '270deg',
  };

  return (
    <View style={[arrowStyles.container, {width: size, height: size}]}>
      <View
        style={[
          arrowStyles.arrow,
          {
            borderLeftWidth: size * 0.35,
            borderRightWidth: size * 0.35,
            borderBottomWidth: size * 0.5,
            borderBottomColor: 'rgba(255,255,255,0.7)',
            transform: [{rotate: rotations[direction]}],
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
 * 10 个气囊的座椅示意图
 *
 * 布局参照用户提供的设计稿截图：
 *   靠背上部: 1(shoulderL)  2(shoulderR)
 *   靠背中部: 3(sideWingL)  5(lumbarUp)/6(lumbarDown)  4(sideWingR)
 *   坐垫前部: 7(cushionFL)  8(cushionFR)
 *   坐垫后部: 9(cushionRL)  10(cushionRR)
 */
const SeatDiagram: React.FC<SeatDiagramProps> = ({
  activeZone,
  scale = 1,
  showAllActive = false,
  values,
}) => {
  const isZoneActive = (zone: AirbagZone) => {
    if (showAllActive && values) {
      return (values[zone] ?? 0) > 0;
    }
    return activeZone === zone;
  };

  const getZoneStyle = (zone: AirbagZone) => {
    const active = isZoneActive(zone);
    return {
      backgroundColor: active
        ? 'rgba(0, 150, 255, 0.45)'
        : 'rgba(100, 120, 160, 0.15)',
      borderColor: active
        ? 'rgba(0, 150, 255, 0.6)'
        : 'rgba(150, 160, 180, 0.25)',
    };
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

      {/* ─── 靠背上部: 1(shoulderL) 2(shoulderR) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('shoulderL'),
          {
            top: 52 * s,
            left: 48 * s,
            width: 62 * s,
            height: 30 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {isZoneActive('shoulderL') && <ArrowIndicator direction="up" size={8 * s} />}
      </View>
      <View
        style={[
          styles.zone,
          getZoneStyle('shoulderR'),
          {
            top: 52 * s,
            right: 48 * s,
            width: 62 * s,
            height: 30 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {isZoneActive('shoulderR') && <ArrowIndicator direction="up" size={8 * s} />}
      </View>

      {/* ─── 靠背中部: 3(sideWingL) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('sideWingL'),
          {
            top: 120 * s,
            left: 28 * s,
            width: 26 * s,
            height: 60 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {isZoneActive('sideWingL') && <ArrowIndicator direction="right" size={8 * s} />}
      </View>

      {/* ─── 靠背中部: 4(sideWingR) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('sideWingR'),
          {
            top: 120 * s,
            right: 28 * s,
            width: 26 * s,
            height: 60 * s,
            borderRadius: 10 * s,
          },
        ]}>
        {isZoneActive('sideWingR') && <ArrowIndicator direction="left" size={8 * s} />}
      </View>

      {/* ─── 靠背中部: 5(lumbarUp) 6(lumbarDown) ─── */}
      {/* 外框容器 */}
      <View
        style={{
          position: 'absolute',
          top: 112 * s,
          left: 62 * s,
          right: 62 * s,
          height: 76 * s,
        }}>
        {/* 5: lumbarUp - 上半部分 */}
        <View
          style={[
            styles.zone,
            getZoneStyle('lumbarUp'),
            {
              position: 'relative',
              width: '100%',
              height: '50%',
              borderTopLeftRadius: 8 * s,
              borderTopRightRadius: 8 * s,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}
        />
        {/* 虚线分隔 */}
        <View style={[styles.dashedLine, {height: 1 * s}]} />
        {/* 6: lumbarDown - 下半部分 */}
        <View
          style={[
            styles.zone,
            getZoneStyle('lumbarDown'),
            {
              position: 'relative',
              width: '100%',
              height: '50%',
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}
        />
      </View>

      {/* ─── 坐垫前部: 7(cushionFL) 8(cushionFR) ─── */}
      <View
        style={{
          position: 'absolute',
          top: 248 * s,
          left: 52 * s,
          right: 52 * s,
          height: 42 * s,
          flexDirection: 'row',
        }}>
        {/* 7: cushionFL */}
        <View
          style={[
            styles.zone,
            getZoneStyle('cushionFL'),
            {
              position: 'relative',
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 8 * s,
              borderBottomLeftRadius: 8 * s,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}>
          <ArrowIndicator direction="up" size={10 * s} />
        </View>
        {/* 竖向虚线分隔 */}
        <View style={[styles.dashedLineVertical, {width: 1 * s}]} />
        {/* 8: cushionFR */}
        <View
          style={[
            styles.zone,
            getZoneStyle('cushionFR'),
            {
              position: 'relative',
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderTopRightRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}>
          <ArrowIndicator direction="up" size={10 * s} />
        </View>
      </View>

      {/* ─── 坐垫后部: 9(cushionRL) 10(cushionRR) ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle('cushionRL'),
          {
            top: 298 * s,
            left: 52 * s,
            width: 58 * s,
            height: 28 * s,
            borderRadius: 10 * s,
          },
        ]}
      />
      <View
        style={[
          styles.zone,
          getZoneStyle('cushionRR'),
          {
            top: 298 * s,
            right: 52 * s,
            width: 58 * s,
            height: 28 * s,
            borderRadius: 10 * s,
          },
        ]}
      />
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
