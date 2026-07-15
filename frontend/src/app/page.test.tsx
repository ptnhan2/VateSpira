import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

/**
 * Holder hoisted — cung cấp giá trị mock cho `isSupabaseConfigured` (const export
 * nên phải đổi qua getter) và chuỗi supabase `from().select().order()`. Bắt buộc
 * dùng `vi.hoisted` vì vi.mock factory bị hoist lên đầu file, trước mọi biến top-level.
 */
const { supabaseState, supabaseMock } = vi.hoisted(() => {
  /** Trạng thái mock có thể thay đổi per-test: cờ cấu hình + kết quả fetch. */
  const supabaseState = {
    configured: true,
    fetchResult: { data: [] as unknown[], error: null as unknown },
  };

  // Chuỗi from().select().order() → { data, error }, đọc fetchResult lúc gọi
  // để phản ánh trạng thái mới nhất do test thiết lập trước khi render.
  const order = vi.fn(() => ({
    data: supabaseState.fetchResult.data,
    error: supabaseState.fetchResult.error,
  }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { supabaseState, supabaseMock: { from, select, order } };
});

// Mock @/lib/supabase — `isSupabaseConfigured` là getter để đổi per-test;
// `supabase` là client mock với chuỗi query giả lập.
vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  supabase: supabaseMock,
}));

// Mock next/link → <a> đơn giản: jsdom không có Next App Router runtime.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import DashboardPage from "./page";

describe("Dashboard page", () => {
  beforeEach(() => {
    supabaseState.configured = true;
    supabaseState.fetchResult = { data: [], error: null };
    supabaseMock.from.mockClear();
    supabaseMock.select.mockClear();
    supabaseMock.order.mockClear();
  });

  it('hiển thị heading "Tiểu thuyết của tôi"', () => {
    render(<DashboardPage />);
    expect(
      screen.getByRole("heading", { name: /Tiểu thuyết của tôi/ }),
    ).toBeInTheDocument();
  });

  it('hiển thị thẻ "Tạo tiểu thuyết mới" link đến /novels/new', async () => {
    render(<DashboardPage />);
    // Card chỉ render sau khi loading=false (useEffect fetch xong) → dùng findByRole.
    const link = await screen.findByRole("link", {
      name: /Tạo tiểu thuyết mới/,
    });
    expect(link).toHaveAttribute("href", "/novels/new");
  });

  it('hiển thị empty state "Chưa có tiểu thuyết" khi không có novel', async () => {
    render(<DashboardPage />);
    expect(await screen.findByText("Chưa có tiểu thuyết")).toBeInTheDocument();
  });

  it('hiển thị "Cần cấu hình Supabase" khi chưa cấu hình env', () => {
    supabaseState.configured = false;
    render(<DashboardPage />);
    expect(screen.getByText("Cần cấu hình Supabase")).toBeInTheDocument();
  });
});
