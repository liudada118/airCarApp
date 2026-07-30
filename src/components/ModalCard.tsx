import React from 'react';
import {
  ImageBackground,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * 统一弹窗卡片：尺寸对齐「自定义气囊调节」进入时的 Loading 框，
 * 所有用户弹窗(确认保存/恢复默认/归零、正在保存、连接异常、进入加载)长宽完全一致。
 *
 * 固定长宽 440×300 + 圆角 24;背景用 modal_bg.png(上白→下浅蓝渐变),cover 填充。
 */
// 背景图(3276×2022,上白下浅蓝)。用 ASCII 文件名规避 Metro 中文路径坑。
const MODAL_BG = require('../assets/images/modal_bg.png');

// 参照 Loading 框:固定长宽 + 圆角。所有弹窗统一用这套尺寸。
export const MODAL_CARD_WIDTH = 440;
export const MODAL_CARD_HEIGHT = 300;
export const MODAL_CARD_RADIUS = 24;

interface ModalCardProps {
  children: React.ReactNode;
  /** 额外样式(内边距、对齐等由调用方决定) */
  style?: StyleProp<ViewStyle>;
}

const ModalCard: React.FC<ModalCardProps> = ({children, style}) => {
  return (
    <ImageBackground
      source={MODAL_BG}
      resizeMode="cover"
      imageStyle={styles.bgImage}
      style={[styles.card, style]}>
      {children}
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  card: {
    width: MODAL_CARD_WIDTH,
    height: MODAL_CARD_HEIGHT,
    borderRadius: MODAL_CARD_RADIUS,
    overflow: 'hidden', // 让背景图跟随圆角裁切
    justifyContent: 'center', // 固定高度,内容垂直居中
  },
  bgImage: {
    borderRadius: MODAL_CARD_RADIUS,
  },
});

export default ModalCard;
