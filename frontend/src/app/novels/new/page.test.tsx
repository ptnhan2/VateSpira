import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

/**
 * Holder hoisted — mock `isSupabaseConfigured`, supabase client (auth.getUser +
 * from().insert()) và `router.push` của next/navigation. Phải dùng `vi.hoisted`
 * vì vi.mock factory bị hoist lên đầu file.
 */
const { supabaseState, supabaseMock, routerPush } = vi.hoisted(() => {
  /** Cờ cấu hình Supabase, đổi per-test qua getter. */
  const supabaseState = { configured: true };
  const routerPush = vi.fn();
  const supabaseMock = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({ insert: vi.fn() })),
  };
  return { supabaseState, supabaseMock, routerPush };
});

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  supabase: supabaseMock,
}));

// Mock next/navigation.useRouter — form dùng router.push("/") sau khi submit.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

// Mock next/link → <a> (jsdom không có Next App Router runtime).
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import NewNovelPage from "./page";

describe("Novel form (trang tạo tiểu thuyết mới)", () => {
  beforeEach(() => {
    supabaseState.configured = true;
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    supabaseMock.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    routerPush.mockClear();
  });

  it("render đủ 5 trường: Tiêu đề, Thể loại, Ngôn ngữ, Điểm nhìn, Thì", () => {
    render(<NewNovelPage />);
    expect(screen.getByLabelText("Tiêu đề")).toBeInTheDocument();
    expect(screen.getByLabelText("Thể loại")).toBeInTheDocument();
    expect(screen.getByLabelText("Ngôn ngữ")).toBeInTheDocument();
    expect(screen.getByLabelText("Điểm nhìn")).toBeInTheDocument();
    expect(screen.getByLabelText("Thì")).toBeInTheDocument();
  });

  it('technique selector mặc định "Save the Cat"', () => {
    render(<NewNovelPage />);
    const technique = screen.getByLabelText(
      "Kỹ thuật cấu trúc",
    ) as HTMLSelectElement;
    expect(technique).toHaveValue("save-the-cat");
    expect(
      screen.getByRole("option", { name: "Save the Cat" }),
    ).toBeInTheDocument();
  });

  it("submit button disabled khi title rỗng", () => {
    render(<NewNovelPage />);
    expect(
      screen.getByRole("button", { name: "Tạo tiểu thuyết" }),
    ).toBeDisabled();
  });

  it("submit button enabled khi đã nhập title", () => {
    render(<NewNovelPage />);
    fireEvent.change(screen.getByLabelText("Tiêu đề"), {
      target: { value: "Tiểu thuyết thử nghiệm" },
    });
    expect(
      screen.getByRole("button", { name: "Tạo tiểu thuyết" }),
    ).toBeEnabled();
  });
});
