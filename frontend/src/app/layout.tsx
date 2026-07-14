import type { Metadata } from "next";
import { Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/** Font Newsreader — serif body + display (editorial, iA Writer lineage). */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

/** Font Inter — UI sans-serif cho interface elements. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Font JetBrains Mono — monospace cho code/meta. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "VateSpira",
  description: "Harness cho tác giả nghiêm túc — Raw Elegance writing workspace",
};

/**
 * Blocking script — set data-theme trước khi paint để ngăn flash of unstyled content (FOUC).
 * Đọc preference từ localStorage, fallback theo prefers-color-scheme của hệ thống.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

/**
 * Toggle script — gắn click listener cho nút toggle sau khi DOM render.
 * Đảo data-theme trên documentElement + lưu preference vào localStorage.
 */
const themeToggleScript = `(function(){var b=document.getElementById('theme-toggle');if(!b)return;b.addEventListener('click',function(){var h=document.documentElement;var c=h.getAttribute('data-theme');var n=c==='dark'?'light':'dark';h.setAttribute('data-theme',n);try{localStorage.setItem('theme',n);}catch(e){}});})();`;

/**
 * RootLayout — base layout shell cho toàn bộ ứng dụng VateSpira.
 * Header bar (logo + breadcrumb + theme toggle) + main content area.
 * @param children - Nội dung page được render bên trong main area.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-theme="light"
      suppressHydrationWarning
      className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <header className="flex items-center gap-3.5 px-6 h-[52px] border-b border-line text-xs">
          <span className="font-serif text-xl font-semibold text-vermilion dark:text-terracotta tracking-wide">
            VateSpira
          </span>
          <span className="text-line">›</span>
          <span className="font-serif italic text-[15px] text-ink-2">
            NovelWorkspace
          </span>
          <div className="flex-1" />
          <button
            id="theme-toggle"
            type="button"
            aria-label="Chuyển dark/light mode"
            className="relative w-[42px] h-[22px] bg-surface-2 border border-line rounded-full cursor-pointer transition-colors duration-300"
          >
            <span className="absolute top-[2px] left-[2px] w-4 h-4 bg-ink rounded-full transition-transform duration-300 dark:translate-x-[20px] dark:bg-terracotta" />
          </button>
        </header>
        <main className="flex-1">{children}</main>
        <script dangerouslySetInnerHTML={{ __html: themeToggleScript }} />
      </body>
    </html>
  );
}
