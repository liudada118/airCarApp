import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  ScrollView,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {
  TopBar,
  SeatDiagram,
  AirbagLabel,
  AdjustButtons,
  ConfirmModal,
  SavingModal,
  Toast,
} from '../components';
import IconFont from '../components/IconFont';
import type {
  AirbagZone,
  AirbagValues,
  AirbagZoneConfig,
  ModalType,
  ConnectionStatus,
} from '../types';
import {DEFAULT_AIRBAG_VALUES} from '../types';

const sm = NativeModules.SerialModule;

/** 气囊区域配置 - 10 个独立气囊 */
const AIRBAG_ZONES: AirbagZoneConfig[] = [
  // 左侧标签（靠背左 + 坐垫左）
  {key: 'shoulderL', label: '肩部左', side: 'left'},
  {key: 'sideWingL', label: '侧翼左', side: 'left'},
  {key: 'lumbarUp', label: '腰部上', side: 'left'},
  {key: 'cushionFL', label: '坐垫前左', side: 'left'},
  {key: 'cushionRL', label: '坐垫后左', side: 'left'},
  // 右侧标签（靠背右 + 坐垫右）
  {key: 'shoulderR', label: '肩部右', side: 'right'},
  {key: 'sideWingR', label: '侧翼右', side: 'right'},
  {key: 'lumbarDown', label: '腰部下', side: 'right'},
  {key: 'cushionFR', label: '坐垫前右', side: 'right'},
  {key: 'cushionRR', label: '坐垫后右', side: 'right'},
];

/** 气囊区域中文名 */
const ZONE_LABELS: Record<string, string> = {
  shoulderL: '肩部左',
  shoulderR: '肩部右',
  sideWingL: '侧翼左',
  sideWingR: '侧翼右',
  lumbarUp: '腰部上',
  lumbarDown: '腰部下',
  cushionFL: '坐垫前左',
  cushionFR: '坐垫前右',
  cushionRL: '坐垫后左',
  cushionRR: '坐垫后右',
};

const MAX_VALUE = 10;
const MIN_VALUE = 0;
const MAX_LOG_LINES = 50;

interface CmdLog {
  id: number;
  time: string;
  zone: string;
  action: string;
  hex: string;
  bytes: number;
}

interface CustomAirbagScreenProps {
  onClose: () => void;
  onSaveSuccess: () => void;
  initialValues?: AirbagValues;
  adaptiveEnabled?: boolean;
}

const CustomAirbagScreen: React.FC<CustomAirbagScreenProps> = ({
  onClose,
  onSaveSuccess,
  initialValues,
  adaptiveEnabled = true,
}) => {
  const [connectionStatus] = useState<ConnectionStatus>('connected');
  const [selectedZone, setSelectedZone] = useState<AirbagZone>('lumbarUp');
  const [airbagValues, setAirbagValues] = useState<AirbagValues>(
    initialValues || {
      shoulderL: 3,
      shoulderR: 3,
      sideWingL: 4,
      sideWingR: 4,
      lumbarUp: 5,
      lumbarDown: 5,
      cushionFL: 2,
      cushionFR: 2,
      cushionRL: 3,
      cushionRR: 3,
    },
  );
  const [modalType, setModalType] = useState<ModalType>(null);
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'error',
  });
  const [cmdLogs, setCmdLogs] = useState<CmdLog[]>([]);
  const [showLog, setShowLog] = useState(true);
  const logIdRef = useRef(0);
  const logScrollRef = useRef<ScrollView>(null);

  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 添加指令日志
  const addLog = useCallback(
    (zone: string, action: string, hex: string, bytes: number) => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
        .getMilliseconds()
        .toString()
        .padStart(3, '0')}`;
      logIdRef.current += 1;
      setCmdLogs(prev => {
        const newLogs = [
          ...prev,
          {
            id: logIdRef.current,
            time,
            zone: ZONE_LABELS[zone] || zone,
            action,
            hex,
            bytes,
          },
        ];
        // 限制最大行数
        if (newLogs.length > MAX_LOG_LINES) {
          return newLogs.slice(-MAX_LOG_LINES);
        }
        return newLogs;
      });
      // 自动滚动到底部
      setTimeout(() => {
        logScrollRef.current?.scrollToEnd({animated: true});
      }, 50);
    },
    [],
  );

  // 关闭页面时恢复算法模式
  const handleClose = useCallback(() => {
    if (adaptiveEnabled) {
      sm?.setAlgoMode?.(true);
      console.log('[AlgoMode] 退出自定义气囊调节，自适应已开启，恢复算法模式');
    } else {
      console.log('[AlgoMode] 退出自定义气囊调节，自适应已关闭，保持算法模式关闭');
    }
    onClose();
  }, [adaptiveEnabled, onClose]);

  // 保存成功时也恢复算法模式
  const handleSaveAndRestore = useCallback(() => {
    if (adaptiveEnabled) {
      sm?.setAlgoMode?.(true);
      console.log('[AlgoMode] 保存成功，自适应已开启，恢复算法模式');
    }
    onSaveSuccess();
  }, [adaptiveEnabled, onSaveSuccess]);

  // 监听 Native 端发送的气囊指令事件
  useEffect(() => {
    if (!sm) {
      return;
    }
    const emitter = new NativeEventEmitter(sm as never);
    const sub = emitter.addListener('onAirbagCommandSent', (event: any) => {
      addLog(
        event.zone || '',
        event.action || '',
        event.hex || '',
        event.bytes || 0,
      );
    });
    return () => sub.remove();
  }, [addLog]);

  // 发送气囊控制指令
  const sendAirbagCmd = useCallback(
    async (zone: AirbagZone, action: 'inflate' | 'deflate' | 'stop') => {
      if (!sm?.sendAirbagCommand) {
        console.warn('[AirbagCmd] sendAirbagCommand not available');
        addLog(zone, action, 'N/A (模块不可用)', 0);
        return;
      }
      try {
        await sm.sendAirbagCommand(zone, action);
      } catch (e: any) {
        console.warn('[AirbagCmd] Error:', e?.message || e);
        addLog(zone, `${action}(失败)`, e?.message || 'error', 0);
      }
    },
    [addLog],
  );

  // 选择气囊区域
  const handleSelectZone = useCallback((zone: AirbagZone) => {
    setSelectedZone(zone);
  }, []);

  // 增加气囊值（充气）
  const handleIncrease = useCallback(() => {
    if (!selectedZone) {
      return;
    }
    setAirbagValues(prev => ({
      ...prev,
      [selectedZone]: Math.min(prev[selectedZone] + 1, MAX_VALUE),
    }));
    // 发送充气指令
    sendAirbagCmd(selectedZone, 'inflate');
  }, [selectedZone, sendAirbagCmd]);

  // 减少气囊值（放气）
  const handleDecrease = useCallback(() => {
    if (!selectedZone) {
      return;
    }
    setAirbagValues(prev => ({
      ...prev,
      [selectedZone]: Math.max(prev[selectedZone] - 1, MIN_VALUE),
    }));
    // 发送放气指令
    sendAirbagCmd(selectedZone, 'deflate');
  }, [selectedZone, sendAirbagCmd]);

  // 点击保存按钮
  const handleSavePress = useCallback(() => {
    setModalType('confirmSave');
  }, []);

  // 确认保存
  const handleConfirmSave = useCallback(() => {
    setModalType('saving');

    // 模拟保存过程（5秒）
    savingTimerRef.current = setTimeout(() => {
      setModalType(null);
      handleSaveAndRestore();
    }, 5000);
  }, [handleSaveAndRestore]);

  // 取消保存
  const handleCancelSaving = useCallback(() => {
    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
      savingTimerRef.current = null;
    }
    setModalType(null);
  }, []);

  // 点击恢复默认
  const handleRestorePress = useCallback(() => {
    setModalType('confirmRestore');
  }, []);

  // 确认恢复默认 — 同时发送全部停止指令
  const handleConfirmRestore = useCallback(() => {
    setModalType(null);
    setAirbagValues({...DEFAULT_AIRBAG_VALUES});
    setSelectedZone('lumbarUp');
    // 发送停止指令给所有气囊
    AIRBAG_ZONES.forEach(z => sendAirbagCmd(z.key, 'stop'));
    setToast({
      visible: true,
      message: '已恢复默认参数，所有气囊已停止',
      type: 'info',
    });
  }, [sendAirbagCmd]);

  // 隐藏 Toast
  const hideToast = useCallback(() => {
    setToast(prev => ({...prev, visible: false}));
  }, []);

  // 清空日志
  const clearLogs = useCallback(() => {
    setCmdLogs([]);
  }, []);

  // 获取左侧和右侧的气囊区域
  const leftZones = AIRBAG_ZONES.filter(z => z.side === 'left');
  const rightZones = AIRBAG_ZONES.filter(z => z.side === 'right');

  const currentValue = selectedZone ? airbagValues[selectedZone] : 0;

  return (
    <View style={styles.container}>
      <TopBar connectionStatus={connectionStatus} />

      <View style={styles.mainContent}>
        {/* 标题栏 */}
        <View style={styles.titleBar}>
          <View style={styles.titleLeft}>
            <IconFont
              name="keshihuatiaojie"
              size={20}
              color={Colors.textWhite}
            />
            <Text style={styles.title}>自定义气囊调节</Text>
          </View>
          <View style={styles.titleRight}>
            <TouchableOpacity
              style={[styles.logToggle, showLog && styles.logToggleActive]}
              onPress={() => setShowLog(!showLog)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.logToggleText,
                  showLog && styles.logToggleTextActive,
                ]}>
                {showLog ? '隐藏日志' : '显示日志'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}>
              <View style={styles.closeIcon}>
                <View style={[styles.closeLine, styles.closeLine1]} />
                <View style={[styles.closeLine, styles.closeLine2]} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 主体内容 */}
        <View style={styles.bodyWrapper}>
          <View style={styles.body}>
            {/* 左侧 +/- 按钮 */}
            <View style={styles.adjustButtonsContainer}>
              <AdjustButtons
                onIncrease={handleIncrease}
                onDecrease={handleDecrease}
                canIncrease={currentValue < MAX_VALUE}
                canDecrease={currentValue > MIN_VALUE}
                disabled={!selectedZone}
              />
            </View>

            {/* 左侧标签 */}
            <View style={styles.leftLabels}>
              {leftZones.map(zone => (
                <AirbagLabel
                  key={zone.key}
                  zone={zone.key}
                  label={zone.label}
                  isActive={selectedZone === zone.key}
                  onPress={handleSelectZone}
                  lineDirection="left"
                />
              ))}
            </View>

            {/* 中间座椅图 */}
            <View style={styles.seatContainer}>
              <SeatDiagram
                activeZone={selectedZone}
                scale={0.85}
                values={airbagValues}
              />
            </View>

            {/* 右侧标签 */}
            <View style={styles.rightLabels}>
              {rightZones.map(zone => (
                <AirbagLabel
                  key={zone.key}
                  zone={zone.key}
                  label={zone.label}
                  isActive={selectedZone === zone.key}
                  onPress={handleSelectZone}
                  lineDirection="right"
                />
              ))}
            </View>
          </View>

          {/* 右侧日志面板 */}
          {showLog && (
            <View style={styles.logPanel}>
              <View style={styles.logHeader}>
                <Text style={styles.logTitle}>串口指令日志</Text>
                <TouchableOpacity onPress={clearLogs} activeOpacity={0.7}>
                  <Text style={styles.logClearText}>清空</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                ref={logScrollRef}
                style={styles.logScroll}
                showsVerticalScrollIndicator={true}>
                {cmdLogs.length === 0 ? (
                  <Text style={styles.logEmpty}>暂无指令记录</Text>
                ) : (
                  cmdLogs.map(log => (
                    <View key={log.id} style={styles.logItem}>
                      <Text style={styles.logTime}>{log.time}</Text>
                      <Text
                        style={[
                          styles.logAction,
                          log.action === 'inflate'
                            ? styles.logInflate
                            : log.action === 'deflate'
                            ? styles.logDeflate
                            : log.action === 'stop'
                            ? styles.logStop
                            : styles.logError,
                        ]}>
                        {log.action === 'inflate'
                          ? '充气'
                          : log.action === 'deflate'
                          ? '放气'
                          : log.action === 'stop'
                          ? '停止'
                          : log.action}
                      </Text>
                      <Text style={styles.logZone}>{log.zone}</Text>
                      <Text style={styles.logHex} numberOfLines={1}>
                        {log.hex}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* 底部按钮 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestorePress}
            activeOpacity={0.7}>
            <Text style={styles.restoreButtonText}>恢复默认</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSavePress}
            activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      {/* 确认保存弹窗 */}
      <ConfirmModal
        visible={modalType === 'confirmSave'}
        title="确认保存自定义参数？"
        description='保存后将应用当前座椅气囊设置，并覆盖本次调整前的参数。如需恢复，可在"恢复默认"中一键还原。'
        cancelText="取消"
        confirmText="保存"
        onCancel={() => setModalType(null)}
        onConfirm={handleConfirmSave}
      />

      {/* 确认恢复默认弹窗 */}
      <ConfirmModal
        visible={modalType === 'confirmRestore'}
        title="确认恢复默认参数？"
        description="恢复后将覆盖当前自定义参数，未保存的调整不会保留。"
        cancelText="取消"
        confirmText="恢复默认"
        onCancel={() => setModalType(null)}
        onConfirm={handleConfirmRestore}
      />

      {/* 正在保存弹窗 */}
      <SavingModal
        visible={modalType === 'saving'}
        onCancel={handleCancelSaving}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mainContent: {
    flex: 1,
    backgroundColor: Colors.surfaceBackground,
    marginHorizontal: Spacing.xxl,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textWhite,
  },
  logToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderGray,
  },
  logToggleActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0,122,255,0.1)',
  },
  logToggleText: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
  },
  logToggleTextActive: {
    color: Colors.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.textGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    width: 14,
    height: 14,
    position: 'relative',
  },
  closeLine: {
    position: 'absolute',
    width: 16,
    height: 1.5,
    backgroundColor: Colors.textGray,
    top: 6,
    left: -1,
  },
  closeLine1: {
    transform: [{rotate: '45deg'}],
  },
  closeLine2: {
    transform: [{rotate: '-45deg'}],
  },
  bodyWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonsContainer: {
    paddingRight: Spacing.xl,
  },
  leftLabels: {
    justifyContent: 'space-around',
    height: 320,
    paddingRight: Spacing.sm,
  },
  rightLabels: {
    justifyContent: 'space-around',
    height: 320,
    paddingLeft: Spacing.sm,
  },
  seatContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  // ─── 日志面板 ───
  logPanel: {
    width: 320,
    backgroundColor: '#0D1117',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderGray,
    marginLeft: Spacing.lg,
    padding: Spacing.md,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGray,
  },
  logTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  logClearText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
  logScroll: {
    flex: 1,
  },
  logEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: Spacing.sm,
  },
  logTime: {
    fontSize: 11,
    color: '#8B949E',
    fontFamily: 'monospace',
    width: 80,
  },
  logAction: {
    fontSize: 11,
    fontWeight: '600',
    width: 32,
    textAlign: 'center',
  },
  logInflate: {
    color: '#58A6FF',
  },
  logDeflate: {
    color: '#F0883E',
  },
  logStop: {
    color: '#8B949E',
  },
  logError: {
    color: '#F85149',
  },
  logZone: {
    fontSize: 11,
    color: '#C9D1D9',
    width: 50,
  },
  logHex: {
    fontSize: 10,
    color: '#6E7681',
    fontFamily: 'monospace',
    flex: 1,
  },
  // ─── 底部按钮 ───
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    paddingTop: Spacing.lg,
  },
  restoreButton: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderGray,
    backgroundColor: Colors.transparent,
  },
  restoreButtonText: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.buttonBlue,
  },
  saveButtonText: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '500',
  },
});

export default CustomAirbagScreen;
