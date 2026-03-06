/**
 * SHROOM 应用颜色系统
 */
export const Colors = {
  // 主色
  primary: '#007AFF',
  primaryDark: '#0056CC',

  // 背景色
  background: '#000000',
  cardBackground: '#1C1C1E',
  cardBackgroundLight: '#2C2C2E',
  surfaceBackground: '#1C1C1E',

  // 文字色
  textWhite: '#FFFFFF',
  textGray: '#8E8E93',
  textLightGray: '#AEAEB2',
  textDark: '#333333',
  textSecondary: '#666666',

  // 弹窗
  modalBackground: '#FFFFFF',
  modalOverlay: 'rgba(0, 0, 0, 0.6)',

  // 边框
  borderGray: '#2C2C2E',
  borderLight: '#E5E5EA',
  borderBlue: '#007AFF',

  // 状态色
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',

  // 特殊
  transparent: 'transparent',
  seatHighlight: 'rgba(0, 122, 255, 0.3)',
  airbagActive: '#007AFF',
  airbagInactive: '#3A3A3C',

  // 按钮
  buttonBlue: '#007AFF',
  buttonGray: '#2C2C2E',
  buttonOutline: '#007AFF',

  // Toast
  toastBackground: '#FFFFFF',
  toastText: '#333333',
} as const;
