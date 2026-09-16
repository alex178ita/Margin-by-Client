import "./globals.css";

export const metadata = {
  title: "Margin by Client — Kleecks",
  description: "Revenue against the real cost of the team, per end client.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
