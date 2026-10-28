import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bao.Dumpling 点餐与经营管理",
  description: "跨设备统一价格的收银与自助点餐系统。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
