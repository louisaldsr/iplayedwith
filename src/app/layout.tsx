import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'I Played With',
  description: 'Rugby six degrees of separation game',
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
