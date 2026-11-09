import '@mantine/core/styles.css';
import './global.css';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import { DaxProvider } from '@dax/web-shell';
import { PRODUCT } from '../lib/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: PRODUCT,
  description: 'Users and settings',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <DaxProvider>{children}</DaxProvider>
      </body>
    </html>
  );
}
