import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rivi Care Coach",
  description: "Family-friendly care guidance with guardian setup and caregiver playback"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
