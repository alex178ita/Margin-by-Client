import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Weekly Hours — Kleecks',
  description: 'Hours logged each week by the Kleecks team across Zoho Projects, People and Sprints.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
