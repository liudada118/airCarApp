import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, BorderRadius } from '../theme';
import type { AirbagZone } from '../types';

interface SeatDiagramProps {
  activeZone: AirbagZone | null;
  /** 缩放比例，默认 1 */
  scale?: number;
  /** 是否显示所有气囊激活状态（首页缩略图用） */
  showAllActive?: boolean;
  /** 各气囊的数值，用于判断是否激活 */
  values?: Record<AirbagZone, number>;
}

/**
 * 箭头指示器
 */
const ArrowIndicator: React.FC<{
  direction: 'up' | 'down' | 'left' | 'right';
  active: boolean;
  size?: number;
}> = ({ direction, active, size = 14 }) => {
  const color = active ? Colors.primary : Colors.airbagInactive;
  const rotations: Record<string, string> = {
    up: '0deg',
    right: '90deg',
    down: '180deg',
    left: '270deg',
  };

  return (
    <View
      style={[
        arrowStyles.container,
        { width: size, height: size },
      ]}
    >
      <View
        style={[
          arrowStyles.arrow,
          {
            borderBottomColor: color,
            borderLeftWidth: size * 0.35,
            borderRightWidth: size * 0.35,
            borderBottomWidth: size * 0.5,
            transform: [{ rotate: rotations[direction] }],
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

const SeatDiagram: React.FC<SeatDiagramProps> = ({
  activeZone,
  scale = 1,
  showAllActive = false,
  values,
}) => {
  const isZoneActive = (zone: AirbagZone) => {
    if (showAllActive && values) {
      return values[zone] > 0;
    }
    return activeZone === zone;
  };

  const getZoneColor = (zone: AirbagZone) => {
    return isZoneActive(zone) ? Colors.seatHighlight : 'rgba(100, 100, 120, 0.2)';
  };

  const s = scale;

  return (
    <View style={[styles.container, { width: 220 * s, height: 340 * s }]}>
      {/* 头枕 */}
      <View
        style={[
          styles.headrest,
          {
            width: 60 * s,
            height: 40 * s,
            borderRadius: 12 * s,
            top: 0,
          },
        ]}
      >
        {/* 头枕开口 */}
        <View
          style={[
            styles.headrestSlot,
            {
              width: 30 * s,
              height: 6 * s,
              borderRadius: 3 * s,
            },
          ]}
        />
      </View>

      {/* 靠背 */}
      <View
        style={[
          styles.backrest,
          {
            width: 160 * s,
            height: 180 * s,
            borderRadius: 16 * s,
            top: 35 * s,
          },
        ]}
      >
        {/* 肩部气囊区域 */}
        <View style={[styles.shoulderRow, { top: 20 * s, gap: 8 * s }]}>
          <View
            style={[
              styles.airbagZone,
              {
                width: 50 * s,
                height: 24 * s,
                borderRadius: 8 * s,
                backgroundColor: getZoneColor('shoulder'),
              },
            ]}
          >
            {isZoneActive('shoulder') && (
              <ArrowIndicator direction="up" active size={10 * s} />
            )}
          </View>
          <View
            style={[
              styles.airbagZone,
              {
                width: 50 * s,
                height: 24 * s,
                borderRadius: 8 * s,
                backgroundColor: getZoneColor('shoulder'),
              },
            ]}
          >
            {isZoneActive('shoulder') && (
              <ArrowIndicator direction="up" active size={10 * s} />
            )}
          </View>
        </View>

        {/* 腰托气囊区域 */}
        <View style={[styles.lumbarRow, { top: 70 * s, gap: 4 * s }]}>
          <View
            style={[
              styles.airbagZoneSide,
              {
                width: 22 * s,
                height: 50 * s,
                borderRadius: 8 * s,
                backgroundColor: getZoneColor('lumbar'),
              },
            ]}
          >
            {isZoneActive('lumbar') && (
              <ArrowIndicator direction="right" active size={10 * s} />
            )}
          </View>
          <View style={{ flexDirection: 'column', gap: 4 * s }}>
            <View
              style={[
                styles.airbagZone,
                {
                  width: 45 * s,
                  height: 22 * s,
                  borderRadius: 6 * s,
                  backgroundColor: getZoneColor('lumbar'),
                },
              ]}
            />
            <View
              style={[
                styles.airbagZone,
                {
                  width: 45 * s,
                  height: 22 * s,
                  borderRadius: 6 * s,
                  backgroundColor: getZoneColor('lumbar'),
                },
              ]}
            />
          </View>
          <View style={{ flexDirection: 'column', gap: 4 * s }}>
            <View
              style={[
                styles.airbagZone,
                {
                  width: 45 * s,
                  height: 22 * s,
                  borderRadius: 6 * s,
                  backgroundColor: getZoneColor('lumbar'),
                },
              ]}
            />
            <View
              style={[
                styles.airbagZone,
                {
                  width: 45 * s,
                  height: 22 * s,
                  borderRadius: 6 * s,
                  backgroundColor: getZoneColor('lumbar'),
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.airbagZoneSide,
              {
                width: 22 * s,
                height: 50 * s,
                borderRadius: 8 * s,
                backgroundColor: getZoneColor('lumbar'),
              },
            ]}
          >
            {isZoneActive('lumbar') && (
              <ArrowIndicator direction="left" active size={10 * s} />
            )}
          </View>
        </View>
      </View>

      {/* 坐垫 */}
      <View
        style={[
          styles.cushion,
          {
            width: 180 * s,
            height: 70 * s,
            borderRadius: 14 * s,
            top: 220 * s,
          },
        ]}
      >
        {/* 侧翼气囊 */}
        <View style={[styles.sideWingRow, { gap: 60 * s }]}>
          <View
            style={[
              styles.airbagZone,
              {
                width: 28 * s,
                height: 40 * s,
                borderRadius: 8 * s,
                backgroundColor: getZoneColor('sideWing'),
              },
            ]}
          >
            {isZoneActive('sideWing') && (
              <ArrowIndicator direction="right" active size={8 * s} />
            )}
          </View>
          <View
            style={[
              styles.airbagZone,
              {
                width: 28 * s,
                height: 40 * s,
                borderRadius: 8 * s,
                backgroundColor: getZoneColor('sideWing'),
              },
            ]}
          >
            {isZoneActive('sideWing') && (
              <ArrowIndicator direction="left" active size={8 * s} />
            )}
          </View>
        </View>

        {/* 臀部软硬度气囊 */}
        <View style={[styles.hipRow, { bottom: -2 * s }]}>
          <View
            style={[
              styles.airbagZone,
              {
                width: 50 * s,
                height: 18 * s,
                borderRadius: 6 * s,
                backgroundColor: getZoneColor('hipFirmness'),
              },
            ]}
          >
            {isZoneActive('hipFirmness') && (
              <ArrowIndicator direction="down" active size={8 * s} />
            )}
          </View>
          <View
            style={[
              styles.airbagZone,
              {
                width: 50 * s,
                height: 18 * s,
                borderRadius: 6 * s,
                backgroundColor: getZoneColor('hipFirmness'),
              },
            ]}
          >
            {isZoneActive('hipFirmness') && (
              <ArrowIndicator direction="down" active size={8 * s} />
            )}
          </View>
        </View>
      </View>

      {/* 腿托 */}
      <View
        style={[
          styles.legRest,
          {
            width: 160 * s,
            height: 45 * s,
            borderRadius: 10 * s,
            top: 290 * s,
          },
        ]}
      >
        <View style={[styles.legRestRow, { gap: 6 * s }]}>
          <View
            style={[
              styles.airbagZone,
              {
                width: 60 * s,
                height: 22 * s,
                borderRadius: 6 * s,
                backgroundColor: getZoneColor('legRest'),
              },
            ]}
          >
            {isZoneActive('legRest') && (
              <ArrowIndicator direction="up" active size={8 * s} />
            )}
          </View>
          <View
            style={[
              styles.airbagZone,
              {
                width: 60 * s,
                height: 22 * s,
                borderRadius: 6 * s,
                backgroundColor: getZoneColor('legRest'),
              },
            ]}
          >
            {isZoneActive('legRest') && (
              <ArrowIndicator direction="up" active size={8 * s} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
  },
  headrest: {
    position: 'absolute',
    backgroundColor: 'rgba(140, 140, 160, 0.3)',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headrestSlot: {
    backgroundColor: 'rgba(30, 30, 50, 0.6)',
  },
  backrest: {
    position: 'absolute',
    backgroundColor: 'rgba(120, 120, 140, 0.25)',
    alignSelf: 'center',
  },
  shoulderRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  lumbarRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cushion: {
    position: 'absolute',
    backgroundColor: 'rgba(140, 140, 160, 0.2)',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideWingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hipRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
  },
  legRest: {
    position: 'absolute',
    backgroundColor: 'rgba(140, 140, 160, 0.15)',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legRestRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  airbagZone: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 170, 0.3)',
    borderStyle: 'dashed',
  },
  airbagZoneSide: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(150, 150, 170, 0.3)',
    borderStyle: 'dashed',
  },
});

export default SeatDiagram;
