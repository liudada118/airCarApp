import React, {useState, useCallback, useRef} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
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

const MAX_VALUE = 10;
const MIN_VALUE = 0;

interface CustomAirbagScreenProps {
  onClose: () => void;
  onSaveSuccess: () => void;
  initialValues?: AirbagValues;
}

const CustomAirbagScreen: React.FC<CustomAirbagScreenProps> = ({
  onClose,
  onSaveSuccess,
  initialValues,
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

  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 选择气囊区域
  const handleSelectZone = useCallback((zone: AirbagZone) => {
    setSelectedZone(zone);
  }, []);

  // 增加气囊值
  const handleIncrease = useCallback(() => {
    if (!selectedZone) {
      return;
    }
    setAirbagValues(prev => ({
      ...prev,
      [selectedZone]: Math.min(prev[selectedZone] + 1, MAX_VALUE),
    }));
  }, [selectedZone]);

  // 减少气囊值
  const handleDecrease = useCallback(() => {
    if (!selectedZone) {
      return;
    }
    setAirbagValues(prev => ({
      ...prev,
      [selectedZone]: Math.max(prev[selectedZone] - 1, MIN_VALUE),
    }));
  }, [selectedZone]);

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
      onSaveSuccess();
    }, 5000);
  }, [onSaveSuccess]);

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

  // 确认恢复默认
  const handleConfirmRestore = useCallback(() => {
    setModalType(null);
    setAirbagValues({...DEFAULT_AIRBAG_VALUES});
    setSelectedZone('lumbarUp');
    setToast({
      visible: true,
      message: '已恢复默认参数',
      type: 'info',
    });
  }, []);

  // 隐藏 Toast
  const hideToast = useCallback(() => {
    setToast(prev => ({...prev, visible: false}));
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
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}>
            <View style={styles.closeIcon}>
              <View style={[styles.closeLine, styles.closeLine1]} />
              <View style={[styles.closeLine, styles.closeLine2]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 主体内容 */}
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
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textWhite,
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
