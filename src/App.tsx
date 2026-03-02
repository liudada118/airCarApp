import React, { useState, useCallback } from 'react';
import { StatusBar, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from './theme';
import { HomeScreen, CustomAirbagScreen } from './screens';
import { Toast } from './components';

type Screen = 'home' | 'customAirbag';

/**
 * SHROOM 座椅气囊控制应用
 *
 * 页面导航:
 * - HomeScreen: 首页，显示座椅状态、气囊状态、3D座椅
 * - CustomAirbagScreen: 自定义气囊调节页面
 *
 * 弹窗组件:
 * - ConfirmModal: 确认保存 / 确认恢复默认
 * - SavingModal: 正在保存（带加载动画）
 * - ConnectionErrorModal: 连接异常提示
 * - Toast: 操作成功/恢复默认提示
 */
const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [homeToast, setHomeToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'error',
  });

  // 导航到自定义气囊调节页面
  const navigateToCustomize = useCallback(() => {
    setCurrentScreen('customAirbag');
  }, []);

  // 关闭自定义气囊调节页面，返回首页
  const navigateToHome = useCallback(() => {
    setCurrentScreen('home');
  }, []);

  // 保存成功后返回首页并显示 Toast
  const handleSaveSuccess = useCallback(() => {
    setCurrentScreen('home');
    setHomeToast({
      visible: true,
      message: '自定义气囊调节保存成功，并应用到当前座椅。',
      type: 'success',
    });
  }, []);

  const hideHomeToast = useCallback(() => {
    setHomeToast(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {currentScreen === 'home' ? (
          <View style={styles.screenContainer}>
            <HomeScreen
              onNavigateToCustomize={navigateToCustomize}
              adaptiveEnabled={adaptiveEnabled}
              onAdaptiveChange={setAdaptiveEnabled}
            />
            {/* 首页级别的 Toast（保存成功后显示） */}
            <Toast
              visible={homeToast.visible}
              message={homeToast.message}
              type={homeToast.type}
              onHide={hideHomeToast}
            />
          </View>
        ) : (
          <CustomAirbagScreen
            onClose={navigateToHome}
            onSaveSuccess={handleSaveSuccess}
            adaptiveEnabled={adaptiveEnabled}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContainer: {
    flex: 1,
    position: 'relative',
  },
});

export default App;
