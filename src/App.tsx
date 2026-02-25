import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Toast } from './components';
import { HomeScreen, CustomAirbagScreen } from './screens';
import { SerialProvider } from './serial';
import { Colors } from './theme';

type Screen = 'home' | 'customAirbag';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [homeToast, setHomeToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'error',
  });

  const navigateToCustomize = useCallback(() => {
    setCurrentScreen('customAirbag');
  }, []);

  const navigateToHome = useCallback(() => {
    setCurrentScreen('home');
  }, []);

  const handleSaveSuccess = useCallback(() => {
    setCurrentScreen('home');
    setHomeToast({
      visible: true,
      message: 'Custom airbag settings were saved and applied.',
      type: 'success',
    });
  }, []);

  const hideHomeToast = useCallback(() => {
    setHomeToast(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <SerialProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {currentScreen === 'home' ? (
            <View style={styles.screenContainer}>
              <HomeScreen onNavigateToCustomize={navigateToCustomize} />
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
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </SerialProvider>
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
