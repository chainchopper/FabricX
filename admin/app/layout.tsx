import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fabric Admin",
  description: "Fabric administration — config, AI routes, health.",
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
