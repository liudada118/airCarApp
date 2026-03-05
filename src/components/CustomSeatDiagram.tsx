import React from 'react';
import {View, Image, StyleSheet} from 'react-native';
import type {CustomAirbagZone, CustomAirbagValues} from '../types';
import type {AirbagCommandState} from '../types';

// 座椅背景图
const SEAT_BG = require('../assets/images/seat_bg.png');

interface CustomSeatDiagramProps {
  activeZone: CustomAirbagZone | null;
  /** 缩放比例，默认 1 */
  scale?: number;
  /** 各气囊的数值，用于判断是否激活 */
  values?: Partial<CustomAirbagValues>;
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
 * 根据是否选中获取气囊区域的样式
 */
function getZoneStyle(isActive: boolean) {
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
 */
const CustomSeatDiagram: React.FC<CustomSeatDiagramProps> = ({
  activeZone,
  scale = 1,
  values,
}) => {
  const isActive = (zone: CustomAirbagZone): boolean => {
    return activeZone === zone;
  };

  const s = scale;

  // 基准尺寸
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
          getZoneStyle(isActive('shoulder')),
          {
            top: 52 * s,
            left: 48 * s,
            width: 62 * s,
            height: 30 * s,
            borderRadius: 10 * s,
          },
        ]}
      />
      <View
        style={[
          styles.zone,
          getZoneStyle(isActive('shoulder')),
          {
            top: 52 * s,
            right: 48 * s,
            width: 62 * s,
            height: 30 * s,
            borderRadius: 10 * s,
          },
        ]}
      />

      {/* ─── 侧翼气囊 (sideWing): 靠背中部左右两侧 ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle(isActive('sideWing')),
          {
            top: 120 * s,
            left: 28 * s,
            width: 26 * s,
            height: 60 * s,
            borderRadius: 10 * s,
          },
        ]}
      />
      <View
        style={[
          styles.zone,
          getZoneStyle(isActive('sideWing')),
          {
            top: 120 * s,
            right: 28 * s,
            width: 26 * s,
            height: 60 * s,
            borderRadius: 10 * s,
          },
        ]}
      />

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
            getZoneStyle(isActive('lumbar')),
            {
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
        {/* 下半部分 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle(isActive('lumbar')),
            {
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
            getZoneStyle(isActive('hipFirm')),
            {
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 8 * s,
              borderBottomLeftRadius: 8 * s,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}
        />
        {/* 竖向虚线分隔 */}
        <View style={[styles.dashedLineVertical, {width: 1 * s}]} />
        {/* 右 */}
        <View
          style={[
            styles.zoneRelative,
            getZoneStyle(isActive('hipFirm')),
            {
              flex: 1,
              height: '100%',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderTopRightRadius: 8 * s,
              borderBottomRightRadius: 8 * s,
            },
          ]}
        />
      </View>

      {/* ─── 腿托气囊 (legRest): 坐垫前部左右两块 ─── */}
      <View
        style={[
          styles.zone,
          getZoneStyle(isActive('legRest')),
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
          getZoneStyle(isActive('legRest')),
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

export default CustomSeatDiagram;
