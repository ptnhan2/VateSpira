import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Beat } from "@/lib/beats";
import type { Scene } from "@/lib/scenes";

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

const { listScenesMock, createSceneMock, updateSceneMock } = vi.hoisted(() => ({
  listScenesMock: vi.fn(),
  createSceneMock: vi.fn(),
  updateSceneMock: vi.fn(),
}));

vi.mock("@/lib/scenes", () => ({
  listScenes: listScenesMock,
  createScene: createSceneMock,
  updateScene: updateSceneMock,
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

// Mock next/link → <a> (jsdom không có Next App Router runtime).
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import PlotContent from "../plot-content";

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

/**
 * Tạo Scene mẫu đã có trong DB cho test.
 */
function makeScene(
  id: string,
  beatId: string,
  sceneNumber: number,
  title: string,
  summary: string,
): Scene {
  return {
    id,
    novel_id: "novel-test",
    beat_id: beatId,
    scene_number: sceneNumber,
    title,
    summary,
    outline: null,
    status: "empty",
    sort_order: sceneNumber,
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
  };
}

describe("PlotContent (beat sheet Save the Cat)", () => {
  beforeEach(() => {
    listBeatsMock.mockReset();
    updateBeatMock.mockReset();
    createBeatMock.mockReset();
    listScenesMock.mockReset();
    createSceneMock.mockReset();
    updateSceneMock.mockReset();
    // Existing tests không quan tâm scenes → mặc định rỗng giữ xanh.
    listScenesMock.mockResolvedValue([]);
  });

  it("render beat sheet content (không còn header/back link — layout cung cấp nav)", async () => {
    listBeatsMock.mockResolvedValue([]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("Opening Image")).toBeInTheDocument(),
    );
    // Header + back link đã remove — layout NovelWorkspace cung cấp tab nav
    expect(
      screen.queryByRole("heading", { name: "Beat Sheet" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Quay lại/ }),
    ).not.toBeInTheDocument();
  });

  it("render đủ 15 textarea beat", async () => {
    listBeatsMock.mockResolvedValue([]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() => expect(listBeatsMock).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("textbox")).toHaveLength(15);
    expect(screen.getByText("Opening Image")).toBeInTheDocument();
    expect(screen.getByText("Final Image")).toBeInTheDocument();
  });

  it("render 3 nhãn hồi (Hồi 1/2/3)", async () => {
    listBeatsMock.mockResolvedValue([]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() => expect(listBeatsMock).toHaveBeenCalled());
    expect(screen.getByText(/Hồi 1 · Khởi/)).toBeInTheDocument();
    expect(screen.getByText(/Hồi 2 · Đối đầu/)).toBeInTheDocument();
    expect(screen.getByText(/Hồi 3 · Giải quyết/)).toBeInTheDocument();
  });

  it("hiển thị loading khi đang tải", () => {
    listBeatsMock.mockReturnValue(new Promise(() => {}));
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    expect(screen.getByText(/Đang tải/)).toBeInTheDocument();
  });

  it("fetch lỗi → hiện notice + vẫn render 15 slot rỗng", async () => {
    listBeatsMock.mockRejectedValue(new Error("Lỗi mạng"));
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Lỗi mạng/)).toBeInTheDocument());
    expect(screen.getAllByRole("textbox")).toHaveLength(15);
  });

  it("data: slot có DB row hiển thị content, slot thiếu rỗng", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "Elena đứng trước tháp."),
      filledBeat(9, "Midpoint", "Elena gặp Oracle."),
    ]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
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
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
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
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
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
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
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

  // === Scene expansion tests (UF-3b) ===

  it("expand beat → hiển thị scenes thuộc beat đó", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "nội dung"),
    ]);
    listScenesMock.mockResolvedValue([
      makeScene("s1", "b1", 1, "Sương mù", "Elena đi bộ"),
      makeScene("s2", "b1", 2, "Bức thư", "Mực nhòe"),
    ]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Nội dung Opening Image")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("expand-1"));

    expect(screen.getByLabelText("Tiêu đề scene 1")).toHaveValue("Sương mù");
    expect(screen.getByLabelText("Tiêu đề scene 2")).toHaveValue("Bức thư");
  });

  it("chevron hiển thị số scene thuộc beat", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "nội dung"),
    ]);
    listScenesMock.mockResolvedValue([
      makeScene("s1", "b1", 1, "Scene 1", ""),
      makeScene("s2", "b1", 2, "Scene 2", ""),
    ]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() => expect(listBeatsMock).toHaveBeenCalled());
    expect(screen.getByTestId("expand-1")).toHaveTextContent("2");
    expect(screen.getByTestId("expand-2")).toHaveTextContent("0");
  });

  it("add scene → gọi createScene + hiện SceneCard mới", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "nội dung"),
    ]);
    listScenesMock.mockResolvedValue([]);
    createSceneMock.mockResolvedValue(makeScene("s1", "b1", 1, "", ""));
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Nội dung Opening Image")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("expand-1"));
    fireEvent.click(screen.getByText("+ Thêm scene"));

    await waitFor(() =>
      expect(createSceneMock).toHaveBeenCalledWith(
        "novel-test",
        "b1",
        1,
        "",
        "",
      ),
    );
    expect(screen.getByLabelText("Tiêu đề scene 1")).toBeInTheDocument();
  });

  it("edit scene title + blur → gọi updateScene", async () => {
    listBeatsMock.mockResolvedValue([
      filledBeat(1, "Opening Image", "nội dung"),
    ]);
    listScenesMock.mockResolvedValue([
      makeScene("s1", "b1", 1, "cũ", "tóm tắt cũ"),
    ]);
    updateSceneMock.mockResolvedValue(
      makeScene("s1", "b1", 1, "mới", "tóm tắt cũ"),
    );
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Nội dung Opening Image")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("expand-1"));
    const titleInput = screen.getByLabelText("Tiêu đề scene 1");
    fireEvent.change(titleInput, { target: { value: "mới" } });
    fireEvent.blur(titleInput);

    await waitFor(() =>
      expect(updateSceneMock).toHaveBeenCalledWith("s1", "mới", "tóm tắt cũ", ""),
    );
  });

  it("beat KHÔNG có id → expand không có nút Add scene", async () => {
    listBeatsMock.mockResolvedValue([]);
    listScenesMock.mockResolvedValue([]);
    render(<PlotContent novelId="novel-test" onWriteChapter={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Nội dung Theme Stated")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("expand-2"));
    expect(screen.queryByText("+ Thêm scene")).not.toBeInTheDocument();
    expect(screen.getByText(/Viết nội dung beat/)).toBeInTheDocument();
  });
});
