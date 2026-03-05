import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StatusBar, View, StyleSheet, NativeModules } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from './theme';
import { HomeScreen, CustomAirbagScreen } from './screens';
import { Toast } from './components';
import type { ConnectionStatus, CustomAirbagValues } from './types';
import { DEFAULT_CUSTOM_AIRBAG_VALUES } from './types';

const sm = NativeModules.SerialModule;

type Screen = 'home' | 'customAirbag';

/**
 * SHROOM 座椅气囊控制应用
 *
 * 页面导航:
 * - HomeScreen: 首页，显示座椅状态、气囊状态、3D座椅
 * - CustomAirbagScreen: 自定义气囊调节页面
 *
 * 气囊设置持久化:
 * - 通过 SerialModule 的 SharedPreferences 存储
 * - 保存时写入，进入自定义页面时读取
 */
const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [homeToast, setHomeToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'error',
  });

  // 持久化的气囊设置值
  const [savedAirbagValues, setSavedAirbagValues] = useState<CustomAirbagValues | null>(null);
  const savedAirbagValuesRef = useRef<CustomAirbagValues | null>(null);

  // 应用启动时从 SharedPreferences 加载已保存的气囊设置
  useEffect(() => {
    if (sm?.loadAirbagSettings) {
      sm.loadAirbagSettings()
        .then((json: string | null) => {
          if (json) {
            try {
              const parsed = JSON.parse(json) as CustomAirbagValues;
              setSavedAirbagValues(parsed);
              savedAirbagValuesRef.current = parsed;
              console.log('[AirbagStorage] 已加载保存的气囊设置:', parsed);
            } catch (e) {
              console.warn('[AirbagStorage] 解析保存的气囊设置失败:', e);
            }
          } else {
            console.log('[AirbagStorage] 无已保存的气囊设置，使用默认值');
          }
        })
        .catch((e: any) => {
          console.warn('[AirbagStorage] 加载气囊设置失败:', e?.message || e);
        });
    }
  }, []);

  // 导航到自定义气囊调节页面
  const navigateToCustomize = useCallback(() => {
    setCurrentScreen('customAirbag');
  }, []);

  // 关闭自定义气囊调节页面，返回首页
  const navigateToHome = useCallback(() => {
    setCurrentScreen('home');
  }, []);

  // 保存成功后：持久化气囊值 → 返回首页 → 显示 Toast
  const handleSaveSuccess = useCallback((values: CustomAirbagValues) => {
    // 更新内存中的保存值
    setSavedAirbagValues(values);
    savedAirbagValuesRef.current = values;

    // 持久化到 SharedPreferences
    if (sm?.saveAirbagSettings) {
      const jsonStr = JSON.stringify(values);
      sm.saveAirbagSettings(jsonStr)
        .then(() => {
          console.log('[AirbagStorage] 气囊设置已保存:', values);
        })
        .catch((e: any) => {
          console.warn('[AirbagStorage] 保存气囊设置失败:', e?.message || e);
        });
    }

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
              connectionStatus={connectionStatus}
              onConnectionStatusChange={setConnectionStatus}
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
            initialValues={savedAirbagValues || undefined}
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
