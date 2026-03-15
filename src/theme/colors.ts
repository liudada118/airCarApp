/**
 * SHROOM 应用颜色系统
 */
export const Colors = {
  // 主色
  primary: '#007AFF',
  primaryDark: '#0056CC',

  // 背景色
  background: '#1A1A2E',
  cardBackground: '#2A2A3E',
  cardBackgroundLight: '#333350',
  surfaceBackground: '#252540',

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
  borderGray: '#3A3A4E',
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
  airbagInactive: '#4A4A5E',

  // 按钮
  buttonBlue: '#007AFF',
  buttonGray: '#3A3A4E',
  buttonOutline: '#007AFF',

  // Toast
  toastBackground: '#FFFFFF',
  toastText: '#333333',
} as const;
