import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { DJPlayerProvider } from "@/components/dj/DJPlayerProvider";
import { Footer } from "@/components/Footer";
import { TwemojiRoot } from "@/components/TwemojiRoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura-board",
  description: "나만의 Aura-board — Notion inspired MVP",
  icons: {
    icon: "/aura-app-icon-512.png",
    apple: "/aura-app-icon-512.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <TwemojiRoot />
        <AuthProvider>
          <DJPlayerProvider>{children}</DJPlayerProvider>
        </AuthProvider>
        <Footer />
      </body>
    </html>
  );
}
