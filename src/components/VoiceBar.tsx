import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import Svg, {Defs, RadialGradient, Stop, Circle, Ellipse} from 'react-native-svg';

const ORB = 74; // 彩球直径
const AURA = ORB * 1.24; // 外层波浪光环尺寸(贴着球一圈;改大=波浪更大)
const BAR_W = 352; // 语音条完全展开时的宽度(够放下整句)

// ─── 彩球(用 SVG 径向渐变近似 Spline 的 Siri 球 + 缓慢旋转的高光)──────
const Orb: React.FC = () => {
  const spin = useRef(new Animated.Value(0)).current;
  // 外层波浪:三圈椭圆各自不停旋转(速度/方向不同),叠加起来就是一直变动的波浪
  const w1 = useRef(new Animated.Value(0)).current;
  const w2 = useRef(new Animated.Value(0)).current;
  const w3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const mk = (v: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.timing(v, {toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true}),
      );
    const loops = [mk(spin, 6000), mk(w1, 9000), mk(w2, 13000), mk(w3, 11000)];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [spin, w1, w2, w3]);
  const rotate = spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  const rot1 = w1.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  const rot2 = w2.interpolate({inputRange: [0, 1], outputRange: ['360deg', '0deg']}); // 反向
  const rot3 = w3.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']});
  const auraOffset = (ORB - AURA) / 2; // 光环比球大,居中偏移(负值,向外扩)

  return (
    <View style={{width: ORB, height: ORB}}>
      {/* 外层波浪光环(比球大,几圈椭圆各自旋转 → 波浪一直变动) */}
      <View
        style={{position: 'absolute', top: auraOffset, left: auraOffset, width: AURA, height: AURA}}
        pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, {transform: [{rotate: rot1}]}]}>
          <Svg width={AURA} height={AURA} viewBox="0 0 100 100">
            <Ellipse cx="50" cy="50" rx="47" ry="41" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.6" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, {transform: [{rotate: rot2}]}]}>
          <Svg width={AURA} height={AURA} viewBox="0 0 100 100">
            <Ellipse cx="50" cy="50" rx="41" ry="47" fill="none" stroke="#dcefff" strokeOpacity="0.1" strokeWidth="1.4" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, {transform: [{rotate: rot3}]}]}>
          <Svg width={AURA} height={AURA} viewBox="0 0 100 100">
            <Ellipse cx="50" cy="50" rx="46" ry="43" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.3" />
          </Svg>
        </Animated.View>
      </View>

      <Svg width={ORB} height={ORB} viewBox="0 0 100 100">
        <Defs>
          {/* 白底球体:更亮更实(磨砂感降低) */}
          <RadialGradient id="orbBase" cx="48" cy="44" r="44" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
            <Stop offset="0.55" stopColor="#eaf5ff" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#cfe3ff" stopOpacity="0.5" />
          </RadialGradient>
          {/* 左下一团蓝:更亮更鲜 */}
          <RadialGradient id="orbBlue" cx="41" cy="58" r="30" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0a8bff" stopOpacity="0.95" />
            <Stop offset="0.5" stopColor="#4fb0ff" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#4fb0ff" stopOpacity="0" />
          </RadialGradient>
          {/* 右上淡淡的紫粉 */}
          <RadialGradient id="orbPurple" cx="60" cy="40" r="26" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#c58cff" stopOpacity="0.42" />
            <Stop offset="0.6" stopColor="#e092ff" stopOpacity="0.14" />
            <Stop offset="1" stopColor="#e092ff" stopOpacity="0" />
          </RadialGradient>
          {/* 外圈白 aura:很淡(磨砂感降低) */}
          <RadialGradient id="orbSoft" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
            <Stop offset="0.84" stopColor="#ffffff" stopOpacity="0.14" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#orbSoft)" />
        <Circle cx="50" cy="50" r="38" fill="url(#orbBase)" />
        <Circle cx="50" cy="50" r="38" fill="url(#orbPurple)" />
        <Circle cx="50" cy="50" r="38" fill="url(#orbBlue)" />
      </Svg>
      {/* 缓慢旋转的高光,让球"活"起来 */}
      <Animated.View style={[StyleSheet.absoluteFill, {transform: [{rotate}]}]} pointerEvents="none">
        <Svg width={ORB} height={ORB} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="orbSwirl" cx="44" cy="34" r="24" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.4" />
              <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx="44" cy="34" rx="16" ry="12" fill="url(#orbSwirl)" />
        </Svg>
      </Animated.View>
    </View>
  );
};

interface VoiceBarProps {
  visible: boolean;
  text: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 右下角语音提示:彩球 + 文字条。
 * 动画:球先弹出(spring),再从球里滑出文字条(宽度展开 + 淡入)。
 * 目前纯 UI:由 visible 控制显隐,text 写死传入;以后有数据时改成按数据 setVisible/setText 即可。
 */
const VoiceBar: React.FC<VoiceBarProps> = ({visible, text, style}) => {
  const orb = useRef(new Animated.Value(0)).current; // 0 隐藏 / 1 显示(球缩放)
  const bar = useRef(new Animated.Value(0)).current; // 0 收起 / 1 展开(条宽度)

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        // 球:固定时长弹出(用 timing 不用 spring;spring 收敛时间不固定,会让条时快时慢)
        Animated.timing(orb, {toValue: 1, duration: 280, easing: Easing.out(Easing.back(1.5)), useNativeDriver: false}),
        // 条:球完整出来后,慢慢拉出
        Animated.timing(bar, {toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false}),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(bar, {toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: false}),
        Animated.timing(orb, {toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: false}),
      ]).start();
    }
  }, [visible, orb, bar]);

  const barWidth = bar.interpolate({inputRange: [0, 1], outputRange: [0, BAR_W]});
  const barOpacity = bar.interpolate({inputRange: [0, 0.35, 1], outputRange: [0, 0, 1]});

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      {/* 文字条:宽度 0→BAR_W 从球里展开;内容右对齐,所以是"从球那侧"抽出来 */}
      <Animated.View style={[styles.barClip, {width: barWidth, opacity: barOpacity}]}>
        <View style={styles.barInner}>
          <LinearGradient
            colors={['rgba(48,56,92,0.92)', 'rgba(82,58,120,0.92)']}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
            style={styles.barBg}>
            <Text style={styles.barText} numberOfLines={1}>
              {text}
            </Text>
          </LinearGradient>
        </View>
      </Animated.View>
      {/* 彩球(压在条的右端上面,看起来条从球里出来) */}
      <Animated.View style={{transform: [{scale: orb}]}}>
        <Orb />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barClip: {
    height: 40,
    overflow: 'hidden',
    marginRight: -ORB * 0.42, // 右端塞到球下面
    justifyContent: 'center',
  },
  barInner: {
    position: 'absolute',
    right: 0,
    width: BAR_W,
  },
  barBg: {
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    paddingLeft: 18,
    paddingRight: ORB * 0.5 + 12, // 右侧留出球的位置
  },
  barText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default VoiceBar;
