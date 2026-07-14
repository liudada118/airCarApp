import React, {useEffect, useRef} from 'react';
import {Animated, Easing, View, Image, StyleSheet, StyleProp, ViewStyle} from 'react-native';

// 座椅底图(气垫图)
const SEAT_IMG = require('../assets/seat/seatCushion.png');
// 座椅底图原始像素 4452 x 7700 → 宽高比
const SEAT_AR = 4452 / 7700;
// 气囊合成图(所有发光+点合成的一张透明底 PNG,叠在座椅上)
const SEAT_COMPOSITE = require('../assets/seat/seatComposite.png');
// 合成图覆盖位置(相对座椅底图的百分比矩形框,图片在框内 contain 居中。跑起来目视微调这四个数)
const COMPOSITE_LAYOUT = {left: 13, top: 16.5, width: 70, height: 72};

// ─── 气囊图层(经 react-native-svg-transformer 变成组件)────────────────
// 每个部位分「发光底(path 渐变)」和「蓝点阵(circles)」两层。
import BackGlow from '../assets/seat/airbag/back2.svg';
import BackDots from '../assets/seat/airbag/back.svg';
import ShoulderGlowL from '../assets/seat/airbag/shoulder.svg';
import ShoulderGlowR from '../assets/seat/airbag/shoulder2.svg';
import ShoulderDotsL from '../assets/seat/airbag/shoulder1_1.svg';
import ShoulderDotsR from '../assets/seat/airbag/shoulder1_2.svg';
import WingGlowL from '../assets/seat/airbag/wing1_1.svg';
import WingGlowR from '../assets/seat/airbag/wing1_2.svg';
import WingDotsL from '../assets/seat/airbag/wing1.svg';
import WingDotsR from '../assets/seat/airbag/wing2.svg';
import CushionGlow from '../assets/seat/airbag/base.svg';
import CushionDots from '../assets/seat/airbag/cushion.svg';

// ─── 8 部位「点」图层(开启=蓝点 SVG / 关闭=白点 PNG,同框重合)──────
import TopLOn from '../assets/seat/dots/topL_on.svg';
import TopROn from '../assets/seat/dots/topR_on.svg';
import MidLOn from '../assets/seat/dots/midL_on.svg';
import MidROn from '../assets/seat/dots/midR_on.svg';
import BackOn from '../assets/seat/dots/back_on.svg';
import CushionOn from '../assets/seat/dots/cushion_on.svg';
import LegLOn from '../assets/seat/dots/legL_on.svg';
import LegROn from '../assets/seat/dots/legR_on.svg';
const DOT_OFF = {
  topL: require('../assets/seat/dots/topL_off.png'),
  topR: require('../assets/seat/dots/topR_off.png'),
  midL: require('../assets/seat/dots/midL_off.png'),
  midR: require('../assets/seat/dots/midR_off.png'),
  back: require('../assets/seat/dots/back_off.png'),
  cushion: require('../assets/seat/dots/cushion_off.png'),
  legL: require('../assets/seat/dots/legL_off.png'),
  legR: require('../assets/seat/dots/legR_off.png'),
};
// 8 部位:位置(相对座椅底图百分比)+ 宽高比(on/off 已配对,同框重合)。位置跑起来目视微调。
interface DotZone {
  key: keyof typeof DOT_OFF;
  On: React.FC<{width?: any; height?: any}>;
  left: number;
  top: number;
  width: number;
  ar: number;
}
const DOT_ZONES: DotZone[] = [
  {key: 'topL', On: TopLOn, left: 21, top: 27, width: 16, ar: 1.58},
  {key: 'topR', On: TopROn, left: 45, top: 26, width: 16, ar: 1.56},
  {key: 'midL', On: MidLOn, left: 17, top: 45, width: 10, ar: 0.43},
  {key: 'midR', On: MidROn, left: 60, top: 42, width: 10, ar: 0.43},
  {key: 'back', On: BackOn, left: 31, top: 47, width: 28, ar: 1.03},
  {key: 'cushion', On: CushionOn, left: 32, top: 64, width: 37, ar: 1.95},
  {key: 'legL', On: LegLOn, left: 44, top: 77, width: 16, ar: 1.62},
  {key: 'legR', On: LegROn, left: 65, top: 74, width: 16, ar: 1.62},
];

// ─── 发光底(蓝色渐变圈,垫在点下面。整层透明度 0↔1 淡入淡出,随数据/按钮)──
import TopLGlow from '../assets/seat/dots/topL_glow.svg';
import TopRGlow from '../assets/seat/dots/topR_glow.svg';
import MidLGlow from '../assets/seat/dots/midL_glow.svg';
import MidRGlow from '../assets/seat/dots/midR_glow.svg';
import BackGlow2 from '../assets/seat/dots/back_glow.svg';
import CushionGlow2 from '../assets/seat/dots/cushion_glow.svg';
import LegLGlow from '../assets/seat/dots/legL_glow.svg';
import LegRGlow from '../assets/seat/dots/legR_glow.svg';
// 发光底位置(比点稍大、罩住点。位置跑起来目视微调)
interface GlowZone {
  key: string;
  Comp: React.FC<{width?: any; height?: any}>;
  left: number;
  top: number;
  width: number;
  ar: number;
}
const GLOW_ZONES: GlowZone[] = [
  {key: 'topL', Comp: TopLGlow, left: 16, top: 25, width: 24, ar: 1.55},
  {key: 'topR', Comp: TopRGlow, left: 41, top: 24, width: 24, ar: 1.50},
  {key: 'midL', Comp: MidLGlow, left: 16, top: 39, width: 13, ar: 0.32},
  {key: 'midR', Comp: MidRGlow, left: 58, top: 37, width: 13, ar: 0.34},
  {key: 'back', Comp: BackGlow2, left: 27, top: 42, width: 35, ar: 0.85},
  {key: 'cushion', Comp: CushionGlow2, left: 27, top: 62, width: 47, ar: 1.88},
  {key: 'legL', Comp: LegLGlow, left: 39, top: 76, width: 24, ar: 1.91},
  {key: 'legR', Comp: LegRGlow, left: 60, top: 73, width: 24, ar: 1.79},
];

interface Overlay {
  key: string;
  Comp: React.FC<{width?: any; height?: any}>;
  left: number;
  top: number;
  width: number;
  ar: number;
  zone: string;
}

const OVERLAYS: Overlay[] = [
  {key: 'backGlow', Comp: BackGlow, left: 25, top: 30, width: 44, ar: 0.85, zone: 'back'},
  {key: 'backDots', Comp: BackDots, left: 31, top: 25, width: 38, ar: 1.03, zone: 'back'},
  {key: 'shLGlow', Comp: ShoulderGlowL, left: 13, top: 27, width: 28, ar: 1.55, zone: 'shoulderL'},
  {key: 'shLDots', Comp: ShoulderDotsL, left: 24, top: 16, width: 18, ar: 1.58, zone: 'shoulderL'},
  {key: 'shRGlow', Comp: ShoulderGlowR, left: 45, top: 27, width: 26, ar: 1.50, zone: 'shoulderR'},
  {key: 'shRDots', Comp: ShoulderDotsR, left: 48, top: 17, width: 17, ar: 1.56, zone: 'shoulderR'},
  {key: 'wLGlow', Comp: WingGlowL, left: 16, top: 36, width: 13, ar: 0.32, zone: 'wingL'},
  {key: 'wLDots', Comp: WingDotsL, left: 18, top: 39, width: 9, ar: 0.43, zone: 'wingL'},
  {key: 'wRGlow', Comp: WingGlowR, left: 56, top: 40, width: 13, ar: 0.34, zone: 'wingR'},
  {key: 'wRDots', Comp: WingDotsR, left: 58, top: 43, width: 9, ar: 0.43, zone: 'wingR'},
  {key: 'cushionGlow', Comp: CushionGlow, left: 25, top: 64, width: 50, ar: 1.88, zone: 'cushion'},
  {key: 'cushionDots', Comp: CushionDots, left: 27, top: 66, width: 46, ar: 1.95, zone: 'cushion'},
];

// ─── 新功能:14 个「大涟漪点」(独立于上面的点/光)。上 8 靠背正圆 / 下 6 坐垫横椭圆。──
// 开启:中心实心点固定,外圈从中心向外扩张 + 慢慢淡出,持续循环。
const BIGDOT_COLOR = '#B4D4FB';
// squashY: 竖向压扁系数,1=正圆(靠背),<1=横椭圆(坐垫,越小越扁)。
// 用「圆 + scaleY 压扁」得到平滑真椭圆(RN 的 borderRadius 在宽高不等时会变成胶囊/方角)。
interface BigDot {left: number; top: number; w: number; squashY: number}
const BIGDOTS_TOP: BigDot[] = [
  {left: 32, top: 34, w: 10, squashY: 1},
  {left: 48.5, top: 33.5, w: 10, squashY: 1},
  {left: 34, top: 43, w: 10, squashY: 1},
  {left: 50, top: 42.5, w: 10, squashY: 1},
  {left: 35.5, top: 51.5, w: 10, squashY: 1},
  {left: 51.5, top: 51, w: 10, squashY: 1},
  {left: 37, top: 60, w: 10, squashY: 1},
  {left: 53, top: 59.5  , w: 10, squashY: 1},
];
const BIGDOTS_BOTTOM: BigDot[] = [
  {left: 40, top: 70, w: 10, squashY: 0.62},
  {left: 56, top: 68.7, w: 10, squashY: 0.62},
  {left: 44, top: 76, w: 10, squashY: 0.62},
  {left: 62, top: 74.7, w: 10, squashY: 0.62},
  {left: 48.5 , top: 82, w: 10, squashY: 0.62},
  {left: 68, top: 80.5, w: 10, squashY: 0.62},
];
const BIGDOTS: BigDot[] = [...BIGDOTS_TOP, ...BIGDOTS_BOTTOM];

// animate=true:外圈涟漪扩散淡出(循环);false:外圈静止大圈(不动)。中心实心点始终固定显示。
const RippleDot: React.FC<{dot: BigDot; index: number; animate: boolean}> = ({dot, index, animate}) => {
  const {left, top, w, squashY} = dot;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) {
      return; // 关闭:不跑动画,渲染静止大圈
    }
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1800,
        delay: index * 130,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, index, animate]);
  const scale = anim.interpolate({inputRange: [0, 1], outputRange: [0.5, 1.5]});
  const ringOpacity = anim.interpolate({inputRange: [0, 0.12, 1], outputRange: [0, 0.85, 0]});
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: `${w}%`,
        aspectRatio: 1, // 方形布局的「圆」,再靠 scaleY 压扁成椭圆
        marginLeft: `${-w / 2}%`,
        marginTop: `${-w / 2}%`,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{scaleY: squashY}],
      }}>
      {animate ? (
        // 开启:涟漪外圈(扩散 + 淡出)
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: 999,
            borderWidth: 2,
            borderColor: BIGDOT_COLOR,
            transform: [{scale}],
            opacity: ringOpacity,
          }}
        />
      ) : (
        // 关闭:静止大圈(不动)
        <View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: 999,
            borderWidth: 2,
            borderColor: BIGDOT_COLOR,
            opacity: 0.85,
          }}
        />
      )}
      {/* 中心实心点:始终固定显示 */}
      <View style={{width: '48%', height: '48%', borderRadius: 999, backgroundColor: BIGDOT_COLOR}} />
    </View>
  );
};

interface SeatCushionProps {
  style?: StyleProp<ViewStyle>;
  /**
   * 需要「点亮」的气囊区。默认 undefined = 全部常亮。
   */
  activeZones?: string[];
  /**
   * 8 部位「点」的开/关。true=蓝点(开启), false=白点(关闭)。
   */
  dotsOn?: boolean;
  /**
   * 发光底(蓝色渐变圈)开/关。true=淡入到完全显示, false=淡出到透明。
   */
  glowOn?: boolean;
  /**
   * 新功能:14 个「大涟漪点」全局开/关(演示用,一键控制全部)。
   */
  bigDotsOn?: boolean;
  /**
   * 每个大涟漪点单独开/关(长度 14 的布尔数组,顺序 = 上8 + 下6)。
   * 传了它就按每个点单独控制;不传则用 bigDotsOn 全局控制。以后接数据用这个。
   */
  bigDotStates?: boolean[];
}

/**
 * 中间固定座椅:座椅底图 + 发光底 + 8 部位「点」图层 + (新)14 个大涟漪点。
 * 本组件是纯展示、不可交互(pointerEvents=none)。
 */
const SeatCushion: React.FC<SeatCushionProps> = ({style, activeZones, dotsOn = false, glowOn = false, bigDotsOn = false, bigDotStates}) => {
  // 发光底整层透明度:glowOn 变化时 0↔1 淡入淡出
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(glow, {
      toValue: glowOn ? 1 : 0,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, [glowOn, glow]);

  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Image source={SEAT_IMG} style={styles.seat} resizeMode="contain" />

      {/* 发光底(蓝色渐变圈):整层透明度淡入淡出,垫在点下面 */}
      <Animated.View style={[StyleSheet.absoluteFill, {opacity: glow}]} pointerEvents="none">
        {GLOW_ZONES.map(g => (
          <View
            key={g.key}
            style={{
              position: 'absolute',
              left: `${g.left}%`,
              top: `${g.top}%`,
              width: `${g.width}%`,
              aspectRatio: g.ar,
            }}>
            <g.Comp width="100%" height="100%" />
          </View>
        ))}
      </Animated.View>

      {/* 8 部位「点」:开启=蓝点 SVG,关闭=白点 PNG,同一个框里重合 */}
      {DOT_ZONES.map(z => (
        <View
          key={z.key}
          style={{
            position: 'absolute',
            left: `${z.left}%`,
            top: `${z.top}%`,
            width: `${z.width}%`,
            aspectRatio: z.ar,
          }}>
          {dotsOn ? (
            <z.On width="100%" height="100%" />
          ) : (
            <Image source={DOT_OFF[z.key]} style={styles.seat} resizeMode="contain" resizeMethod="resize" />
          )}
        </View>
      ))}

      {/* 新功能:14 个大涟漪点。每个点单独开关:传了 bigDotStates 就按数组、否则用全局 bigDotsOn */}
      {BIGDOTS.map((dot, i) => {
        const animate = bigDotStates ? !!bigDotStates[i] : bigDotsOn;
        return <RippleDot key={`big-${i}`} dot={dot} index={i} animate={animate} />;
      })}

      {/* 气囊合成图(旧,先关掉不渲染,保留代码) */}
      {false && (
        <Image
          source={SEAT_COMPOSITE}
          style={{
            position: 'absolute',
            left: `${COMPOSITE_LAYOUT.left}%`,
            top: `${COMPOSITE_LAYOUT.top}%`,
            width: `${COMPOSITE_LAYOUT.width}%`,
            height: `${COMPOSITE_LAYOUT.height}%`,
          }}
          resizeMode="contain"
        />
      )}

      {/* ↓↓ 旧的逐块 SVG 叠加:已改用上面的合成图,先保留代码不删,用 false 关掉不渲染 ↓↓ */}
      {false &&
        OVERLAYS.map(o => {
          const dimmed =
            activeZones !== undefined && !activeZones.includes(o.zone);
          return (
            <View
              key={o.key}
              style={{
                position: 'absolute',
                left: `${o.left}%`,
                top: `${o.top}%`,
                width: `${o.width}%`,
                aspectRatio: o.ar,
                opacity: dimmed ? 0.18 : 1,
              }}>
              <o.Comp width="100%" height="100%" />
            </View>
          );
        })}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    aspectRatio: SEAT_AR,
    height: '100%',
    alignSelf: 'center',
  },
  seat: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});

export default SeatCushion;
