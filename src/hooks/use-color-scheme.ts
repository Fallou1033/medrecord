import { useThemePreference } from '../theme/ThemePreferenceContext';

export function useColorScheme() {
  try {
    const { resolvedTheme } = useThemePreference();
    return resolvedTheme;
  } catch (e) {
    return 'light';
  }
}
