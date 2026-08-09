import React, { useState } from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import {
  Pressable,
  useColorScheme,
  useWindowDimensions,
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Accueil</TabButton>
          </TabTrigger>
          <TabTrigger name="patients" href="/patients" asChild>
            <TabButton>Patients</TabButton>
          </TabTrigger>
          <TabTrigger name="rendezvous" href="/rendezvous" asChild>
            <TabButton>Rendez-vous</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton>Paramètres</TabButton>
          </TabTrigger>

          {/* Hidden triggers to register top-level stacks in expo-router/ui */}
          <TabTrigger name="consultations" href={"/consultations" as any} asChild>
            <Pressable style={{ display: 'none' }} />
          </TabTrigger>
          <TabTrigger name="ordonnances" href={"/ordonnances" as any} asChild>
            <Pressable style={{ display: 'none' }} />
          </TabTrigger>
          <TabTrigger name="certificats" href={"/certificats" as any} asChild>
            <Pressable style={{ display: 'none' }} />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, onClick, ...props }: TabTriggerSlotProps & { onClick?: () => void }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <Pressable
      {...props}
      onPress={(e) => {
        if (onClick) onClick();
        if (props.onPress) props.onPress(e);
      }}
      style={({ pressed }) => [styles.tabPressable, isMobile && styles.mobileTabPressable, pressed && styles.pressed]}
    >
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.tabButtonView, isMobile && styles.mobileTabButtonView]}
      >
        <ThemedText
          type="small"
          style={isMobile ? styles.mobileTabText : styles.desktopTabText}
          themeColor={isFocused ? 'text' : 'textSecondary'}
        >
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [menuOpen, setMenuOpen] = useState(false);

  if (isMobile) {
    return (
      <View {...props} style={styles.mobileTabListContainer}>
        <ThemedView type="backgroundElement" style={styles.mobileHeaderBar}>
          <ThemedText type="smallBold" style={styles.mobileBrandText}>
            MedRecord
          </ThemedText>

          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={() => setMenuOpen(!menuOpen)}
            accessibilityLabel="Menu de navigation"
          >
            <Ionicons
              name={menuOpen ? 'close' : 'menu'}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
        </ThemedView>

        {menuOpen && (
          <ThemedView type="backgroundElement" style={styles.mobileDropdownMenu}>
            <View style={styles.mobileDropdownContent}>
              {React.Children.map(props.children, (child) => {
                if (React.isValidElement(child)) {
                  return React.cloneElement(child, {
                    onClick: () => setMenuOpen(false),
                  } as any);
                }
                return child;
              })}
            </View>
          </ThemedView>
        )}
      </View>
    );
  }

  // Desktop / Tablet Layout (>= 768px)
  return (
    <View {...props} style={[styles.tabListContainer, { pointerEvents: 'box-none' }]}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          MedRecord
        </ThemedText>

        <View style={styles.desktopTabList}>
          {props.children}
        </View>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Mobile Navigation Styles (< 768px)
  mobileTabListContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 9999,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  mobileHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  mobileBrandText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28C2FF',
  },
  hamburgerBtn: {
    padding: 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileDropdownMenu: {
    marginTop: 8,
    borderRadius: 16,
    padding: 8,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  mobileDropdownContent: {
    flexDirection: 'column',
    gap: 6,
    width: '100%',
  },
  mobileTabPressable: {
    width: '100%',
  },
  mobileTabButtonView: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  mobileTabText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Desktop / Tablet Navigation Styles (>= 768px)
  tabListContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    zIndex: 999,
  },
  innerContainer: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    justifyContent: 'space-between',
  },
  brandText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28C2FF',
  },
  desktopTabList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabPressable: {},
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  desktopTabText: {
    fontSize: 14,
  },
});
