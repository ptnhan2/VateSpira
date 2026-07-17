"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

/** Định nghĩa 4 tab — Plot là entry point. Chapters tab riêng (tách khỏi Plot). */
const TABS = [
  { label: "Plot", suffix: "" },
  { label: "Chapters", suffix: "/chapters" },
  { label: "Codex", suffix: "/codex" },
  { label: "Review", suffix: "/review" },
] as const;

/**
 * NovelWorkspace layout — shell cho tất cả pages trong /novels/[id]/.
 *
 * Render tab nav (Writing | Plot | Codex | Review) + main content area.
 * Active tab dựa trên `usePathname()`. Tab style: minimal underline (active =
 * border-b vermilion), KHÔNG pill/background (Direction A · Raw Elegance).
 *
 * @param children - Page content (Writing tab / Plot tab / Codex / Review).
 */
export default function NovelWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const base = `/novels/${params.id}`;

  return (
    <div className="mx-auto max-w-6xl px-6">
      <nav
        className="flex gap-6 border-b border-line"
        aria-label="Novel workspace tabs"
      >
        {TABS.map((tab) => {
          const href = `${base}${tab.suffix}`;
          const active =
            tab.suffix === ""
              ? pathname === base
              : pathname === href;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`-mb-px border-b-2 pb-3 pt-1 text-sm transition-colors ${
                active
                  ? "border-vermilion font-medium text-ink dark:border-terracotta"
                  : "border-transparent text-muted hover:text-ink"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="py-6">{children}</div>
    </div>
  );
}
