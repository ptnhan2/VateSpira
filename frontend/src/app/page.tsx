"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/** Dữ liệu tiểu thuyết hiển thị trên Dashboard — subset của novels table. */
interface Novel {
  id: string;
  title: string;
  genre: string | null;
  language: string | null;
  created_at: string;
}

/**
 * Trang chủ — Dashboard hiển thị danh sách tiểu thuyết, thống kê và nút tạo novel mới.
 *
 * Flow: kiểm tra cấu hình Supabase → fetch novels (nếu đã cấu hình) → render
 * lưới thẻ novel + thẻ "+ mới" + hàng thống kê. Khi chưa có novel hoặc chưa
 * cấu hình Supabase, hiển thị trạng thái phù hợp.
 */
export default function DashboardPage() {
  const configured = isSupabaseConfigured;
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("novels")
          .select("id, title, genre, language, created_at")
          .order("created_at", { ascending: false });
        if (fetchError) throw fetchError;
        if (!cancelled) {
          setNovels((data ?? []) as Novel[]);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Không thể tải danh sách tiểu thuyết.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-vermilion dark:text-terracotta">
          Workspace
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">
          Tiểu thuyết của tôi
        </h1>
        <p className="mt-1 text-sm text-muted">
          Chọn một tiểu thuyết để tiếp tục, hoặc tạo dự án mới.
        </p>
      </header>

      {/* Stats row */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Từ hôm nay" value="0" />
        <StatCard label="Chuỗi ngày viết" value="0 ngày" />
        <StatCard label="Hoạt động gần đây" value="—" />
      </section>

      {/* Not configured notice */}
      {!configured && (
        <div className="mb-6 rounded-lg border border-vermilion/20 bg-vermilion-soft p-4 text-sm text-ink-2">
          <p className="font-medium text-vermilion dark:text-terracotta">Cần cấu hình Supabase</p>
          <p className="mt-1">
            Đặt <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            và{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            trong <code className="font-mono text-xs">frontend/.env.local</code>{" "}
            để kích hoạt lưu trữ tiểu thuyết.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-vermilion/20 bg-vermilion-soft p-4 text-sm text-vermilion dark:text-terracotta">
          {error}
        </div>
      )}

      {/* Novel grid */}
      <section>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-lg border border-line bg-surface-2"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {novels.map((novel) => (
              <NovelCard key={novel.id} novel={novel} />
            ))}
            <NewNovelCard />
          </div>
        )}
      </section>

      {/* Empty state */}
      {!loading && novels.length === 0 && (
        <div className="mt-8 text-center">
          <p className="font-serif text-xl text-ink-2">
            Chưa có tiểu thuyết
          </p>
          <p className="mt-1 text-sm text-muted">
            Tạo novel đầu tiên để bắt đầu hành trình sáng tác.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Thẻ thống kê — hiển thị một chỉ số với nhãn uppercase.
 * @param label - Nhãn chỉ số (uppercase, muted).
 * @param value - Giá trị hiển thị (font-serif, lớn).
 */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-2 font-serif text-2xl font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}

/**
 * Thẻ tiểu thuyết — hiển thị tiêu đề, thể loại, ngôn ngữ và ngày tạo.
 * @param novel - Dữ liệu novel từ Supabase.
 */
function NovelCard({ novel }: { novel: Novel }) {
  const created = new Date(novel.created_at);
  const dateLabel = isNaN(created.getTime())
    ? "—"
    : created.toLocaleDateString("vi-VN");

  return (
    <Link
      href={`/novels/${novel.id}`}
      className="flex flex-col justify-between rounded-lg border border-line bg-surface p-5 transition-colors hover:border-vermilion dark:hover:border-terracotta"
    >
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink">
          {novel.title}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {novel.genre && <Tag>{novel.genre}</Tag>}
          {novel.language && <Tag>{novel.language}</Tag>}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">Tạo ngày {dateLabel}</p>
    </Link>
  );
}

/**
 * Thẻ tạo novel mới — viền nét đứt vermilion, link đến /novels/new.
 */
function NewNovelCard() {
  return (
    <Link
      href="/novels/new"
      className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line p-5 text-vermilion dark:text-terracotta transition-colors hover:border-vermilion dark:hover:border-terracotta"
    >
      <span className="font-serif text-3xl font-light leading-none">+</span>
      <span className="text-sm font-medium">Tạo tiểu thuyết mới</span>
    </Link>
  );
}

/**
 * Nhãn nhỏ dạng pill — hiển thị thể loại/ngôn ngữ.
 * @param children - Nội dung nhãn.
 */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-vermilion/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-vermilion dark:text-terracotta">
      {children}
    </span>
  );
}
