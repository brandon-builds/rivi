import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Care Coach Rivi — Guardian Protocol Edition",
  description: "MVP for guardian protocol playback and caregiver clarification"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
