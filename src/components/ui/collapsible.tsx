import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();

  return (
    <ThemedView style={[styles.container, Platform.OS === 'web' && ({ boxSizing: 'border-box', overflow: 'hidden' } as any)]}>
      <Pressable
        style={({ pressed }) => [styles.heading, pressed && styles.pressedHeading]}
        onPress={() => setIsOpen((value) => !value)}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            weight="bold"
            tintColor={theme.text}
            style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}
          />
        </ThemedView>

        <ThemedText
          type="small"
          style={[
            styles.titleText,
            Platform.OS === 'web' && ({ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' } as any),
          ]}
        >
          {title}
        </ThemedText>
      </Pressable>
      {isOpen && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.animContainer, Platform.OS === 'web' && ({ boxSizing: 'border-box', maxWidth: '100%' } as any)]}
        >
          <ThemedView
            type="backgroundElement"
            style={[styles.content, Platform.OS === 'web' && ({ boxSizing: 'border-box', maxWidth: '100%', overflow: 'hidden' } as any)]}
          >
            {children}
          </ThemedView>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: '100%',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
    paddingVertical: 6,
  },
  pressedHeading: {
    opacity: 0.7,
  },
  button: {
    width: Spacing.four,
    height: Spacing.four,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  titleText: {
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  animContainer: {
    width: '100%',
  },
  content: {
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    width: '100%',
    maxWidth: '100%',
  },
});
