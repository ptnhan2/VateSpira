import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

/** Mock PlotContent — tránh cần mock beats/scenes dependencies. */
vi.mock("./plot-content", () => ({
  default: ({ novelId, onWriteChapter }: {
    novelId: string;
    onWriteChapter: (scene: unknown) => void;
    onEditChapter?: (scene: unknown) => void;
    refreshKey?: number;
  }) =>
    createElement(
      "div",
      { "data-testid": "plot-content" },
      `PlotContent novelId=${novelId}`,
      createElement(
        "button",
        {
          "data-testid": "write-chapter-btn",
          onClick: () =>
            onWriteChapter({
              id: "s1",
              scene_number: 1,
              title: "Test Scene",
              summary: "Sum",
              outline: "Outline text",
            }),
        },
        "Viết chương",
      ),
    ),
}));

const { streamWriteMock, resumeWriteMock } = vi.hoisted(() => ({
  streamWriteMock: vi.fn(),
  resumeWriteMock: vi.fn(),
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

import WritingWorkspace from "./page";

describe("WritingWorkspace (2-panel: Plot + Chat)", () => {
  beforeEach(() => {
    streamWriteMock.mockReset();
    resumeWriteMock.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("render PlotContent (center) + Chat panel (right)", async () => {
    render(createElement(WritingWorkspace));
    await waitFor(() => {
      expect(screen.getByTestId("plot-content")).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("Viết tin nhắn…"),
    ).toBeInTheDocument();
  });

  it("click 'Viết chương' → gọi streamWrite + hiện Editor", async () => {
    streamWriteMock.mockResolvedValue(undefined);
    render(createElement(WritingWorkspace));
    await waitFor(() => {
      expect(screen.getByTestId("write-chapter-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("write-chapter-btn"));

    await waitFor(() => {
      expect(streamWriteMock).toHaveBeenCalledWith(
        "novel-test",
        expect.stringContaining("Viết chương"),
        undefined,
        expect.objectContaining({
          onMetadata: expect.any(Function),
          onInterrupt: expect.any(Function),
        }),
      );
    });
    // Editor panel hiện (loading state)
    expect(screen.getByText("Đang viết…")).toBeInTheDocument();
  });

  it("hiện HITL approve/reject + proposed prose khi interrupt", async () => {
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
          content: "Nội dung prose đề xuất từ agent.",
          description: "approve",
        });
      },
    );

    render(createElement(WritingWorkspace));
    await waitFor(() => {
      expect(screen.getByTestId("write-chapter-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("write-chapter-btn"));

    await waitFor(() => {
      expect(screen.getByText("Duyệt")).toBeInTheDocument();
      expect(screen.getByText("Từ chối")).toBeInTheDocument();
    });
    // Proposed prose trong editor
    expect(
      screen.getByText("Nội dung prose đề xuất từ agent."),
    ).toBeInTheDocument();
  });

  it("đóng editor → hiện lại PlotContent", async () => {
    streamWriteMock.mockResolvedValue(undefined);
    render(createElement(WritingWorkspace));
    await waitFor(() => {
      expect(screen.getByTestId("write-chapter-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("write-chapter-btn"));
    await waitFor(() => {
      expect(screen.getByText("✕ Đóng")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("✕ Đóng"));
    expect(screen.getByTestId("plot-content")).toBeInTheDocument();
  });
});
