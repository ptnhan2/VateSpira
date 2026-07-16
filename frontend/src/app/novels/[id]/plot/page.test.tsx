import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Beat } from "@/lib/beats";

/**
 * Holder hoisted — mock 3 hàm async của @/lib/beats. Constants (STC_BEATS,
 * ACT_LABELS, deriveStatus) lấy real qua vi.importActual để test dùng cấu trúc
 * thật. Phải dùng vi.hoisted vì vi.mock factory bị hoist lên đầu file.
 */
const { listBeatsMock, updateBeatMock, createBeatMock } = vi.hoisted(() => ({
  listBeatsMock: vi.fn(),
  updateBeatMock: vi.fn(),
  createBeatMock: vi.fn(),
}));

vi.mock("@/lib/beats", async () => {
  const actual = await vi.importActual<typeof import("@/lib/beats")>(
    "@/lib/beats",
  );
  return {
    ...actual,
    listBeats: listBeatsMock,
    updateBeat: updateBeatMock,
    createBeat: createBeatMock,
  };
});

// Mock next/navigation.useParams — page lấy novelId từ dynamic route.
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "novel-test" }),
}));

// Mock next/link → <a> (jsdom không có Next App Router runtime).
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import PlotPage from "./page";

/**
 * Tạo Beat mẫu đã có trong DB (đã điền content) cho test.
 */
function filledBeat(n: number, name: string, content: string): Beat {
  return {
    id: `b${n}`,
    novel_id: "novel-test",
    beat_number: n,
    beat_name: name,
    content,
    status: "filled",
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
  };
}

describe("Plot page (beat sheet Save the Cat)", () => {
  beforeEach(() => {
    listBeatsMock.mockReset();
    updateBeatMock.mockReset();
    createBeatMock.mockReset();
  });

  it("render header + back link về dashboard", async () => {
    listBeatsMock.mockResolvedValue([]);
    render(<PlotPage />);
    expect(
      screen.getByRole("heading", { name: "Beat Sheet" }),
    ).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /Quay lại/ });
    expect(back).toHaveAttribute("href", "/");
  });

  it("render đủ 15 textarea beat", async () => {
    listBeatsMock.mockResolvedValue([]);
    render(<PlotPage />);
    await waitFor(() => expect(listBeatsMock).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("textbox")).toHaveLength(15);
    expect(screen.getByText("Opening Image")).toBeInTheDocument();
    expect(screen.getByText("Final Image")).toBeInTheDocument();
  });

  it("render 3 nhãn hồi (Hồi 1/2/3)", async () => {
    listBeatsMock.mockResolvedValue([]);
    render(<PlotPage />);
    await waitFor(() => expect(listBeatsMock).toHaveBeenCalled());
    expect(screen.getByText(/Hồi 1 · Khởi/)).toBeInTheDocument();
    expect(screen.getByText(/Hồi 2 · Đối đầu/)).toBeInTheDocument();
    expect(screen.getByText(/Hồi 3 · Giải quyết/)).toBeInTheDocument();
  });

  it("hiển thị loading khi đang tải", () => {
    listBeatsMock.mockReturnValue(new Promise(() => {}));
    render(<PlotPage />);
    expect(screen.getByText(/Đang tải/)).toBeInTheDocument();
  });

  it("fetch lỗi → hiện notice + vẫn render 15 slot rỗng", async () => {
    listBeatsMock.mockRejectedValue(new Error("Lỗi mạng"));
    render(<PlotPage />);
    await waitFor(() => expect(screen.getByText(/Lỗi mạng/)).toBeInTheDocument());
    expect(screen.getAllByRole("textbox")).toHaveLength(15);
  });

  it("data: slot có DB row hiển thị content, slot thiếu rỗng", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "Elena đứng trước tháp."),
      filledBeat(9, "Midpoint", "Elena gặp Oracle."),
    ]);
    render(<PlotPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Nội dung Opening Image")).toHaveValue(
        "Elena đứng trước tháp.",
      ),
    );
    expect(screen.getByLabelText("Nội dung Midpoint")).toHaveValue(
      "Elena gặp Oracle.",
    );
    expect(screen.getByLabelText("Nội dung Theme Stated")).toHaveValue("");
  });

  it("edit + blur slot CÓ id → gọi updateBeat(id, content)", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "nội dung cũ"),
    ]);
    updateBeatMock.mockResolvedValue(
      filledBeat(1, "Opening Image", "nội dung mới"),
    );
    render(<PlotPage />);
    const ta = await screen.findByLabelText("Nội dung Opening Image");
    fireEvent.change(ta, { target: { value: "nội dung mới" } });
    fireEvent.blur(ta);
    await waitFor(() =>
      expect(updateBeatMock).toHaveBeenCalledWith("b1", "nội dung mới"),
    );
    expect(createBeatMock).not.toHaveBeenCalled();
  });

  it("edit + blur slot KHÔNG có id → gọi createBeat", async () => {
    listBeatsMock.mockResolvedValue([]);
    createBeatMock.mockResolvedValue(filledBeat(2, "Theme Stated", "chủ đề tin"));
    render(<PlotPage />);
    const ta = await screen.findByLabelText("Nội dung Theme Stated");
    fireEvent.change(ta, { target: { value: "chủ đề tin" } });
    fireEvent.blur(ta);
    await waitFor(() =>
      expect(createBeatMock).toHaveBeenCalledWith(
        "novel-test",
        2,
        "Theme Stated",
        "chủ đề tin",
      ),
    );
    expect(updateBeatMock).not.toHaveBeenCalled();
  });

  it("status dot: filled cho slot có content, empty cho slot rỗng", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "đã điền"),
    ]);
    render(<PlotPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Nội dung Opening Image")).toBeInTheDocument(),
    );
    const dot1 = document.querySelector(
      '[data-testid="beat-1"] [data-status]',
    );
    const dot2 = document.querySelector(
      '[data-testid="beat-2"] [data-status]',
    );
    expect(dot1?.getAttribute("data-status")).toBe("filled");
    expect(dot2?.getAttribute("data-status")).toBe("empty");
  });
});
