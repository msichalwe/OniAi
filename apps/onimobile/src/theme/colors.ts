/**
 * OniOS Mobile — Color palette matching the design reference.
 * Soft lavender/purple accent, warm neutral backgrounds.
 */

export const colors = {
  // Primary accent — soft lavender/purple
  primary: '#8B7EC8',
  primaryLight: '#C4B8F0',
  primaryMuted: '#E8E0F5',
  primaryBg: '#F0EBFA',

  // Warm backgrounds (matches desktop gradient-warm)
  warmBg: '#F5F0E8',
  warmCard: '#FAF7F2',
  warmBorder: '#E8E2D8',

  // Neutrals
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#EEECEC',
  borderLight: '#F5F3F3',

  // Text
  text: '#1A1A1A',
  textSecondary: '#6B6B6B',
  textTertiary: '#9A9A9A',
  textInverse: '#FFFFFF',

  // Dark mode
  darkBg: '#0F0F14',
  darkSurface: '#1A1A22',
  darkSurfaceElevated: '#222230',
  darkBorder: 'rgba(255,255,255,0.08)',
  darkText: '#F0F0F0',
  darkTextSecondary: 'rgba(255,255,255,0.6)',
  darkTextTertiary: 'rgba(255,255,255,0.35)',

  // Semantic
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Chat
  userBubble: '#2A2A2A',
  userBubbleText: '#FFFFFF',
  aiBubble: '#F5F0E8',
  aiBubbleText: '#1A1A1A',

  // Accent yellow (from design — "New" badge, highlights)
  yellow: '#F5D76E',
  yellowLight: '#FFF8E1',
};

export type ColorScheme = 'light' | 'dark';

export function getColors(scheme: ColorScheme) {
  if (scheme === 'dark') {
    return {
      bg: colors.darkBg,
      surface: colors.darkSurface,
      surfaceElevated: colors.darkSurfaceElevated,
      border: colors.darkBorder,
      text: colors.darkText,
      textSecondary: colors.darkTextSecondary,
      textTertiary: colors.darkTextTertiary,
      primary: colors.primary,
      primaryLight: colors.primaryLight,
      primaryMuted: 'rgba(139,126,200,0.15)',
      primaryBg: 'rgba(139,126,200,0.08)',
      userBubble: colors.primaryMuted,
      userBubbleText: colors.text,
      aiBubble: colors.darkSurfaceElevated,
      aiBubbleText: colors.darkText,
      card: colors.darkSurface,
    };
  }
  return {
    bg: colors.bg,
    surface: colors.surface,
    surfaceElevated: colors.surfaceElevated,
    border: colors.border,
    text: colors.text,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryMuted: colors.primaryMuted,
    primaryBg: colors.primaryBg,
    userBubble: colors.userBubble,
    userBubbleText: colors.userBubbleText,
    aiBubble: colors.warmCard,
    aiBubbleText: colors.text,
    card: colors.surface,
  };
}
