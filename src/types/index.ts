/**
 * 气囊区域类型
 */
export type AirbagZone =
  | 'shoulder'   // 肩部气囊
  | 'lumbar'     // 腰托气囊
  | 'sideWing'   // 侧翼气囊
  | 'hipFirmness' // 臀部软硬度气囊
  | 'legRest';    // 腿托气囊

/**
 * 气囊区域配置
 */
export interface AirbagZoneConfig {
  key: AirbagZone;
  label: string;
  side: 'left' | 'right';
}

/**
 * 气囊参数值 (0-10)
 */
export type AirbagValues = Record<AirbagZone, number>;

/**
 * 座椅状态
 */
export type SeatStatus = 'seated' | 'away';

/**
 * 连接状态
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

/**
 * 弹窗类型
 */
export type ModalType =
  | 'confirmSave'
  | 'confirmRestore'
  | 'saving'
  | 'connectionError'
  | null;

/**
 * Toast 类型
 */
export interface ToastConfig {
  visible: boolean;
  message: string;
  type: 'success' | 'info' | 'error';
}

/**
 * 体型类型
 */
export type BodyType = '轻盈型' | '标准型' | '健壮型';
