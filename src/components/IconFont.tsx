import React from 'react';
import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';

/**
 * Iconfont 图标映射表
 *
 * 使用前需要在项目中注册自定义字体 "iconfont"：
 *
 * Android: 将 iconfont.ttf 复制到 android/app/src/main/assets/fonts/
 * iOS: 将 iconfont.ttf 添加到 Xcode 项目中，并在 Info.plist 的 UIAppFonts 中注册
 *
 * 或者使用 react-native.config.js 自动链接：
 * module.exports = {
 *   assets: ['./src/assets/fonts'],
 * };
 * 然后执行 npx react-native-asset
 */

/** 图标名称到 Unicode 字符的映射 */
const ICON_MAP: Record<string, string> = {
  // 座椅相关
  'zaizuo': '\ue672',       // 在座
  'lizuo': '\ue66e',        // 离座
  'chengren': '\ue670',     // 成人
  'ertong': '\ue66d',       // 儿童
  'wupin': '\ue66f',        // 物品
  'anquan': '\ue671',       // 安全
  'qinang': '\ue66a',       // 气囊
  'qinang1': '\ue66c',      // 气囊(变体)

  // 编辑/操作
  'bianji': '\ue623',       // 编辑
  'bianji1': '\ue663',      // 编辑(变体)

  // 功能图标
  'plus-full': '\ue631',    // 加号(实心)
  'minus-full': '\ue632',   // 减号(实心)
  'bofang': '\ue634',       // 播放
  'zanting': '\ue635',      // 暂停
  'kaishi': '\ue61d',       // 开始
  'tingzhi': '\ue61e',      // 停止

  // 视图/导航
  'shituqiehuan': '\ue645', // 视图切换
  'yijianhuanyuan': '\ue644', // 一键还原
  'chakanjubu': '\ue643',   // 查看局部
  'yuyan': '\ue642',        // 语言
  'lishi': '\ue624',        // 历史
  'qiehuan': '\ue629',      // 切换
  'zhankai-2': '\ue621',    // 展开

  // 文件操作
  'shangchuan': '\ue62a',   // 上传
  'xiazai': '\ue60a',       // 下载
  'tuichu': '\ue60b',       // 退出
  'shanchu': '\ue60f',      // 删除

  // 工具
  'keshihuatiaojie': '\ue60d', // 可视化调节
  'liangchigongju': '\ue610',  // 量尺工具
  'huabufanzhuan': '\ue60c',   // 画布翻转
  'yuyalizhiling': '\ue604',   // 预压力置零
  'quxiaozhiling': '\ue648',   // 取消置零

  // 3D/图表
  'a-3Ddiantu': '\ue607',     // 3D点图
  'diantuqiehuanshijiao': '\ue606', // 点图切换视角
  'shijianshunxu': '\ue608',  // 时间顺序
  'tupianshangchuan': '\ue609', // 图片上传

  // 其他
  'vector': '\ue61f',
  'lujing': '\ue625',         // 路径
  'lujing1': '\ue669',        // 路径
  'lujing2': '\ue673',        // 路径
  'lujing-2': '\ue60e',       // 路径-2
  'lujing-21': '\ue666',      // 路径-2
  'a-zu148': '\ue647',        // 组 148
  'a-zu1175': '\ue665',       // 组 1175
  'a-zu1202': '\ue674',       // 组 1202
  'a-zu1215': '\ue668',       // 组 1215
  'a-zu1216': '\ue667',       // 组 1216
  'zu': '\ue66b',             // 组
  'tianchong24hui': '\ue62b', // 填充24灰
  'baogaoqianbiandexiaolanfangkuai': '\ue62e', // 报告前边的小蓝方块
  'a-yuanxing9': '\ue620',    // 圆形 9
  'a-yuanxing10': '\ue622',   // 圆形 10
};

interface IconFontProps {
  /** 图标名称（对应 iconfont.json 中的 font_class） */
  name: string;
  /** 图标大小，默认 16 */
  size?: number;
  /** 图标颜色，默认 #FFFFFF */
  color?: string;
  /** 额外样式 */
  style?: StyleProp<TextStyle>;
}

/**
 * IconFont 图标组件
 *
 * 使用 iconfont.ttf 字体文件渲染图标。
 *
 * @example
 * <IconFont name="zaizuo" size={24} color="#007AFF" />
 * <IconFont name="lizuo" size={24} color="#8E8E93" />
 * <IconFont name="plus-full" size={28} color="#FFFFFF" />
 */
const IconFont: React.FC<IconFontProps> = ({
  name,
  size = 16,
  color = '#FFFFFF',
  style,
}) => {
  const unicode = ICON_MAP[name];

  if (!unicode) {
    console.warn(`IconFont: unknown icon name "${name}"`);
    return null;
  }

  return (
    <Text
      style={[
        styles.icon,
        {
          fontSize: size,
          color,
        },
        style,
      ]}
    >
      {unicode}
    </Text>
  );
};

const styles = StyleSheet.create({
  icon: {
    fontFamily: 'iconfont',
    fontWeight: 'normal',
    fontStyle: 'normal',
  },
});

export { ICON_MAP };
export default IconFont;
