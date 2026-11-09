'use client';

import { createTheme, MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';

export const daxTheme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});

export function DaxProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={daxTheme} defaultColorScheme="light">
      {children}
    </MantineProvider>
  );
}
