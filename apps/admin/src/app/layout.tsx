import './global.css';

export const metadata = {
  title: 'DAX Admin',
  description: 'Users, roles and access control',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
