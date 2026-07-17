import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

/**
 * Holder hoisted — mock listChapters + streamWrite + resumeWrite.
 * Phải dùng vi.hoisted vì vi.mock factory bị hoist (fe-dev-memory: quy tắc hoisting).
 */
const { listChaptersMock } = vi.hoisted(() => ({
  listChaptersMock: vi.fn(),
}));

const { streamWriteMock, resumeWriteMock } = vi.hoisted(() => ({
  streamWriteMock: vi.fn(),
  resumeWriteMock: vi.fn(),
}));

vi.mock("@/lib/chapters", () => ({
  listChapters: listChaptersMock,
}));

vi.mock("@/lib/write", () => ({
  streamWrite: streamWriteMock,
  resumeWrite: resumeWriteMock,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "novel-test" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import WritingTab from "./page";

describe("WritingTab", () => {
  beforeEach(() => {
    listChaptersMock.mockReset();
    streamWriteMock.mockReset();
    resumeWriteMock.mockReset();
    listChaptersMock.mockResolvedValue([]);
    // jsdom không implement scrollIntoView — mock để tránh TypeError
    Element.prototype.scrollIntoView = vi.fn();
    // Mock fetch cho manuscript route (gọi on mount)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: null,
        json: async () => ({ files: [] }),
      }),
    );
  });

  it("render chat panel + editor panel khi mount", async () => {
    render(createElement(WritingTab));
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Viết tin nhắn…"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Danh sách chương"),
    ).toBeInTheDocument();
  });

  it("render empty state khi không có chapters", async () => {
    render(createElement(WritingTab));
    await waitFor(() => {
      expect(
        screen.getByText(/Chưa có chương/),
      ).toBeInTheDocument();
    });
  });

  it("render chapter list khi có chapters", async () => {
    listChaptersMock.mockResolvedValue([
      {
        id: "c1",
        novel_id: "n1",
        number: 1,
        title: "Khởi đầu",
        status: "draft",
        word_count: 500,
        created_at: "",
        updated_at: "",
      },
    ]);
    render(createElement(WritingTab));
    await waitFor(() => {
      expect(screen.getByText("Khởi đầu")).toBeInTheDocument();
    });
  });

  it("gọi streamWrite khi gửi tin nhắn", async () => {
    streamWriteMock.mockResolvedValue(undefined);
    render(createElement(WritingTab));
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Viết tin nhắn…"),
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(
      "Viết tin nhắn…",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "viết chương 1" } });
    fireEvent.click(screen.getByText("Gửi"));

    await waitFor(() => {
      expect(streamWriteMock).toHaveBeenCalledWith(
        "novel-test",
        "viết chương 1",
        undefined,
        expect.objectContaining({
          onMetadata: expect.any(Function),
          onState: expect.any(Function),
          onInterrupt: expect.any(Function),
          onComplete: expect.any(Function),
        }),
      );
    });
  });

  it("hiện HITL approve/reject buttons khi interrupt", async () => {
    streamWriteMock.mockImplementation(
      async (
        _id: string,
        _msg: string,
        _uid: string | undefined,
        cb: {
          onInterrupt?: (i: unknown) => void;
        },
      ) => {
        cb.onInterrupt?.({
          threadId: "t1",
          runId: "r1",
          toolName: "write_file",
          path: "/manuscript/test.md",
          content: "prose đề xuất",
          description: "approve",
        });
      },
    );

    render(createElement(WritingTab));
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Viết tin nhắn…"),
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(
      "Viết tin nhắn…",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "viết chương 1" } });
    fireEvent.click(screen.getByText("Gửi"));

    await waitFor(() => {
      expect(screen.getByText("Duyệt")).toBeInTheDocument();
      expect(screen.getByText("Từ chối")).toBeInTheDocument();
    });
  });

  it("hiện proposed prose trong editor khi interrupt", async () => {
    streamWriteMock.mockImplementation(
      async (
        _id: string,
        _msg: string,
        _uid: string | undefined,
        cb: { onInterrupt?: (i: unknown) => void },
      ) => {
        cb.onInterrupt?.({
          threadId: "t1",
          runId: "r1",
          toolName: "write_file",
          path: "/manuscript/test.md",
          content: "Đây là prose đề xuất cho chương.",
          description: "approve",
        });
      },
    );

    render(createElement(WritingTab));
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Viết tin nhắn…"),
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(
      "Viết tin nhắn…",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "viết" } });
    fireEvent.click(screen.getByText("Gửi"));

    await waitFor(() => {
      expect(
        screen.getByText("Đây là prose đề xuất cho chương."),
      ).toBeInTheDocument();
    });
  });
});
