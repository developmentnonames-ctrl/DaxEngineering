'use client';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  createTheme,
  type MantineColorsTuple,
  MantineProvider,
  Modal,
  MultiSelect,
  NavLink,
  NumberInput,
  Paper,
  PasswordInput,
  PinInput,
  SegmentedControl,
  Switch,
  Select,
  Table,
  Tabs,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import type { ReactNode } from 'react';

const ink: MantineColorsTuple = [
  '#eef0f8',
  '#d8dcef',
  '#b1b9df',
  '#8893cc',
  '#6672bb',
  '#4c59ad',
  '#3a479e',
  '#2b3988',
  '#202e77',
  '#162568',
];

const ember: MantineColorsTuple = [
  '#fff2e5',
  '#ffe2c7',
  '#fdc48f',
  '#f9a455',
  '#f48a2b',
  '#ee7a12',
  '#d46a0b',
  '#b05607',
  '#8d4406',
  '#6e3504',
];

const ok: MantineColorsTuple = [
  '#e3f5ec',
  '#c4ead7',
  '#93d8b5',
  '#5fc491',
  '#38b275',
  '#24a567',
  '#1d9a60',
  '#168150',
  '#106841',
  '#0a4f31',
];

const field = { radius: 'lg' as const, size: 'md' as const };

export const daxTheme = createTheme({
  primaryColor: 'ink',
  primaryShade: { light: 9, dark: 1 },
  autoContrast: true,
  colors: { ink, ember, ok },
  fontFamily: 'var(--dax-f-body)',
  fontFamilyMonospace: 'var(--dax-f-mono)',
  defaultRadius: 'lg',
  radius: { xs: '6px', sm: '10px', md: '14px', lg: '18px', xl: '28px' },
  shadows: {
    xs: '0 1px 2px rgba(16,24,32,.05)',
    sm: 'var(--dax-shadow-card)',
    md: 'var(--dax-shadow-card)',
    lg: 'var(--dax-shadow-card)',
    xl: 'var(--dax-shadow)',
  },
  headings: {
    fontFamily: 'var(--dax-f-body)',
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '44px', lineHeight: '1.05' },
      h2: { fontSize: '30px', lineHeight: '1.1' },
      h3: { fontSize: '22px', lineHeight: '1.2', fontWeight: '600' },
      h4: { fontSize: '18px', lineHeight: '1.25', fontWeight: '600' },
      h5: { fontSize: '15px', lineHeight: '1.3', fontWeight: '600' },
    },
  },
  components: {
    Title: Title.extend({
      styles: { root: { letterSpacing: '-0.025em' } },
    }),
    Button: Button.extend({
      defaultProps: { radius: 'xl' },
      styles: { root: { fontWeight: 600 } },
    }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'xl' } }),
    Paper: Paper.extend({
      defaultProps: { radius: 'xl', shadow: 'md' },
      classNames: { root: 'dax-paper' },
    }),
    Card: Card.extend({
      defaultProps: { radius: 'xl', shadow: 'md', padding: 'lg' },
      classNames: { root: 'dax-paper' },
    }),
    Badge: Badge.extend({
      defaultProps: { radius: 'xl', variant: 'light' },
      styles: { root: { textTransform: 'none', fontWeight: 600 } },
    }),
    Alert: Alert.extend({ defaultProps: { radius: 'lg' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'xl', centered: true } }),
    TextInput: TextInput.extend({ defaultProps: field }),
    PasswordInput: PasswordInput.extend({ defaultProps: field }),
    NumberInput: NumberInput.extend({ defaultProps: field }),
    Textarea: Textarea.extend({ defaultProps: field }),
    Select: Select.extend({ defaultProps: field }),
    MultiSelect: MultiSelect.extend({ defaultProps: field }),
    // Six equal boxes across the full width, with no "○" placeholder.
    PinInput: PinInput.extend({
      defaultProps: { radius: 'md', size: 'lg', placeholder: '', gap: 'xs' },
      styles: {
        // Wrapper and box share one height so the row doesn't spill into
        // whatever sits below it.
        root: { width: '100%', flexWrap: 'nowrap', minHeight: 52 },
        pinInput: { flex: 1, minWidth: 0, height: 52 },
        input: {
          width: '100%',
          height: 52,
          fontSize: 22,
          fontWeight: 600,
          textAlign: 'center',
        },
      },
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: 'xl' },
    }),
    Switch: Switch.extend({
      defaultProps: { withThumbIndicator: false, size: 'md', color: 'ok' },
      classNames: { track: 'dax-switch-track', thumb: 'dax-switch-thumb' },
    }),
    Tabs: Tabs.extend({ defaultProps: { variant: 'pills', radius: 'xl' } }),
    NavLink: NavLink.extend({ styles: { root: { borderRadius: 14 } } }),
    Table: Table.extend({
      defaultProps: {
        verticalSpacing: 'sm',
        horizontalSpacing: 'md',
        highlightOnHover: true,
      },
    }),
  },
});

export function DaxProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={daxTheme} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  );
}
