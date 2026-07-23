import React, {useEffect, useRef} from 'react';
import {Animated, View, Image, StyleSheet, StyleProp, ViewStyle} from 'react-native';

// 正视座椅底图
const BASE = require('../assets/seat/front/seatFront.png');
const BASE_AR = 5060 / 6132; // ≈0.825

// 每部位:关闭(白点)/ 开启(蓝点)/ 发光(渐变),全是 PNG
const IMG = {
  topL: {off: require('../assets/seat/front/topL_off.png'), on: require('../assets/seat/front/topL_on.png'), glow: require('../assets/seat/front/topL_glow.png')},
  topR: {off: require('../assets/seat/front/topR_off.png'), on: require('../assets/seat/front/topR_on.png'), glow: require('../assets/seat/front/topR_glow.png')},
  midL: {off: require('../assets/seat/front/midL_off.png'), on: require('../assets/seat/front/midL_on.png'), glow: require('../assets/seat/front/midL_glow.png')},
  midR: {off: require('../assets/seat/front/midR_off.png'), on: require('../assets/seat/front/midR_on.png'), glow: require('../assets/seat/front/midR_glow.png')},
  back: {off: require('../assets/seat/front/back_off.png'), on: require('../assets/seat/front/back_on.png'), glow: require('../assets/seat/front/back_glow.png')},
  cushion: {off: require('../assets/seat/front/cushion_off.png'), on: require('../assets/seat/front/cushion_on.png'), glow: require('../assets/seat/front/cushion_glow.png')},
  legL: {off: require('../assets/seat/front/legL_off.png'), on: require('../assets/seat/front/legL_on.png'), glow: require('../assets/seat/front/legL_glow.png')},
  legR: {off: require('../assets/seat/front/legR_off.png'), on: require('../assets/seat/front/legR_on.png'), glow: require('../assets/seat/front/legR_glow.png')},
};
type PartKey = keyof typeof IMG;
interface Zone {key: PartKey; left: number; top: number; width: number; ar: number}

// 点位置(on/off 同框重合)。ar=图片宽高比。位置跑起来目视微调。
const DOT_ZONES: Zone[] = [
  {key: 'topL', left: 33, top: 25, width: 15, ar: 1.64},
  {key: 'topR', left: 53, top: 25, width: 15, ar: 1.64},
  {key: 'midL', left: 28, top: 45, width: 7, ar: 0.35},
  {key: 'midR', left: 64, top: 45, width: 7, ar: 0.35},
  {key: 'back', left: 37, top: 47, width: 25, ar: 1.04},
  {key: 'cushion', left: 35, top: 69, width: 30, ar: 2.20},
  {key: 'legL', left: 33, top: 85, width: 14, ar: 2.11},
  {key: 'legR', left: 54, top: 85, width: 14, ar: 2.11},
];
// 发光位置(比点大、罩住点)。ar 用发光图自己的比例。位置跑起来目视微调。
const GLOW_ZONES: Zone[] = [
  {key: 'topL', left: 29, top: 22, width: 24, ar: 1.55},
  {key: 'topR', left: 49, top: 22, width: 24, ar: 1.54},
  {key: 'midL', left: 63, top: 40, width: 11, ar: 0.32},
  {key: 'midR', left: 26, top: 40, width: 11, ar: 0.31},
  {key: 'back', left: 34.5, top: 41, width: 30, ar: 0.91},
  {key: 'cushion', left: 26, top: 66, width: 48, ar: 1.99},
  {key: 'legL', left: 29, top: 83, width: 22, ar: 2.16},
  {key: 'legR', left: 49, top: 83, width: 22, ar: 2.16},
];

/** 气囊部位 → SeatFront 图层部位。用于「闪烁」映射。 */
export const AIRBAG_ZONE_TO_PARTS: Record<string, PartKey[]> = {
  shoulder: ['topL', 'topR'], // 肩部→最上两个
  sideWing: ['midL', 'midR'], // 侧翼→中左中右
  lumbar: ['back'],           // 腰托→中(靠背)
  hipFirm: ['cushion'],       // 臀部→中下(坐垫)
  legRest: ['legL', 'legR'],  // 腿托→最下两个
};

interface SeatFrontProps {
  style?: StyleProp<ViewStyle>;
  /** 8 部位点:true=蓝点 / false=白点 */
  dotsOn?: boolean;
  /** 发光底(整层):true=淡入显示 / false=淡出透明。保留给「首页整体发光」等场景 */
  glowOn?: boolean;
  /** 闪烁信号:{parts, seq}。seq 每次变化触发一次这些部位的渐入→渐出闪烁。 */
  flash?: {parts: PartKey[]; seq: number} | null;
}

/**
 * 自定义气囊弹窗里的「正视座椅」:底图 + 发光底(整层淡入淡出) + 逐部位闪烁 + 8 部位点(开/关)。
 * 纯展示,全 PNG。
 */
const SeatFront: React.FC<SeatFrontProps> = ({style, dotsOn = false, glowOn = false, flash = null}) => {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(glow, {toValue: glowOn ? 1 : 0, duration: 700, useNativeDriver: true}).start();
  }, [glowOn, glow]);

  // 每个部位一个独立 opacity,用于「闪烁」(渐入→渐出)
  const partOpacity = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(GLOW_ZONES.map(z => [z.key, new Animated.Value(0)])),
  ).current;

  useEffect(() => {
    if (!flash || !flash.parts?.length) return;
    flash.parts.forEach(key => {
      const v = partOpacity[key];
      if (!v) return;
      v.stopAnimation();
      Animated.sequence([
        Animated.timing(v, {toValue: 1, duration: 300, useNativeDriver: true}),   // 渐入
        Animated.delay(900),                                                       // 停留(加长)
        Animated.timing(v, {toValue: 0, duration: 800, useNativeDriver: true}),   // 渐出
      ]).start();
    });
    // 依赖 seq:每次序号变化触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.seq]);

  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Image source={BASE} style={styles.fill} resizeMode="contain" />

      {/* 发光底:整层淡入淡出(glowOn) */}
      <Animated.View style={[StyleSheet.absoluteFill, {opacity: glow}]} pointerEvents="none">
        {GLOW_ZONES.map(z => (
          <View key={z.key} style={{position: 'absolute', left: `${z.left}%`, top: `${z.top}%`, width: `${z.width}%`, aspectRatio: z.ar}}>
            <Image source={IMG[z.key].glow} style={styles.fill} resizeMode="contain" resizeMethod="resize" />
          </View>
        ))}
      </Animated.View>

      {/* 逐部位闪烁层:各自独立 opacity */}
      {GLOW_ZONES.map(z => (
        <Animated.View
          key={`flash-${z.key}`}
          pointerEvents="none"
          style={{position: 'absolute', left: `${z.left}%`, top: `${z.top}%`, width: `${z.width}%`, aspectRatio: z.ar, opacity: partOpacity[z.key]}}>
          <Image source={IMG[z.key].glow} style={styles.fill} resizeMode="contain" resizeMethod="resize" />
        </Animated.View>
      ))}

      {/* 点:开=蓝点 / 关=白点,同框重合 */}
      {DOT_ZONES.map(z => (
        <View key={z.key} style={{position: 'absolute', left: `${z.left}%`, top: `${z.top}%`, width: `${z.width}%`, aspectRatio: z.ar}}>
          <Image source={dotsOn ? IMG[z.key].on : IMG[z.key].off} style={styles.fill} resizeMode="contain" resizeMethod="resize" />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {aspectRatio: BASE_AR, height: '100%', alignSelf: 'center'},
  fill: {...StyleSheet.absoluteFillObject, width: '100%', height: '100%'},
});

export default SeatFront;
