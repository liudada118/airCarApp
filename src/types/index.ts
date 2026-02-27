/**
 * Airbag zone type
 */
export type AirbagZone =
  | 'shoulder'
  | 'lumbar'
  | 'sideWing'
  | 'hipFirmness'
  | 'legRest';

/**
 * Airbag zone config
 */
export interface AirbagZoneConfig {
  key: AirbagZone;
  label: string;
  side: 'left' | 'right';
}

/**
 * Airbag values (0-10)
 */
export type AirbagValues = Record<AirbagZone, number>;

/**
 * Seat status
 */
export type SeatStatus = 'seated' | 'away';

/**
 * Connection status
 */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

/**
 * Modal type
 */
export type ModalType =
  | 'confirmSave'
  | 'confirmRestore'
  | 'saving'
  | 'connectionError'
  | null;

/**
 * Toast type
 */
export interface ToastConfig {
  visible: boolean;
  message: string;
  type: 'success' | 'info' | 'error';
}

/**
 * Body type
 */
export type BodyType = '轻盈型' | '标准型' | '健壮型';
