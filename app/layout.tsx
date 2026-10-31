import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "法律与信念 · 维多利亚3倾向测评",
  description: "排列你理想社会的法律，发现与你接近的意识形态与利益集团。",
  metadataBase: new URL('https://victoria3-laws-and-convictions.mkp872087265.chatgpt.site'),
  openGraph: {
    title: '法律与信念 · Laws & Convictions',
    description: '基于维多利亚3的法律倾向测评：你的思想接近哪些意识形态与利益集团？',
    type: 'website',
    locale: 'zh_CN',
    alternateLocale: 'en_US',
  },
  icons: {
    icon: "/game/law_monarchy.webp",
    shortcut: "/game/law_monarchy.webp",
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
