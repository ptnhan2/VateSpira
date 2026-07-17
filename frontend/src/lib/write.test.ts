import { beforeEach, describe, expect, it, vi } from "vitest";

import { resumeWrite, streamWrite } from "@/lib/write";

/**
 * Tạo mock SSE Response từ danh sách events — mô phỏng output của route handler.
 *
 * @param events - Danh sách SSE events (event + data).
 * @returns Response với ReadableStream body chứa SSE-formatted text.
 */
function mockSSEResponse(
  events: Array<{ event: string; data: unknown }>,
): Response {
  const encoder = new TextEncoder();
  const chunks = events.map((e) =>
    encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`),
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamWrite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatch metadata + state + complete callbacks đúng thứ tự", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        mockSSEResponse([
          {
            event: "metadata",
            data: { threadId: "t1", runId: "r1" },
          },
          {
            event: "state",
            data: {
              messages: [
                { role: "human", content: "viết chương 1" },
                { role: "ai", content: "Đang viết..." },
              ],
            },
          },
          {
            event: "complete",
            data: {
              rubricStatus: "satisfied",
              chapterId: "c1",
              chapterStatus: "final",
              wordCount: 100,
            },
          },
        ]),
      );
    vi.stubGlobal("fetch", mockFetch);

    const callbacks = {
      onMetadata: vi.fn(),
      onState: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await streamWrite("novel-1", "viết chương 1", undefined, callbacks);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/novels/novel-1/write",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(callbacks.onMetadata).toHaveBeenCalledWith({
      threadId: "t1",
      runId: "r1",
    });
    expect(callbacks.onState).toHaveBeenCalledWith([
      { role: "human", content: "viết chương 1" },
      { role: "ai", content: "Đang viết..." },
    ]);
    expect(callbacks.onComplete).toHaveBeenCalledWith({
      rubricStatus: "satisfied",
      chapterId: "c1",
      chapterStatus: "final",
      wordCount: 100,
    });
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("dispatch interrupt callback khi agent đề xuất write_file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockSSEResponse([
          {
            event: "metadata",
            data: { threadId: "t1", runId: "r1" },
          },
          {
            event: "interrupt",
            data: {
              threadId: "t1",
              runId: "r1",
              toolName: "write_file",
              path: "/manuscript/chapters/test.md",
              content: "Nội dung prose đề xuất...",
              description: "approve write_file",
            },
          },
        ]),
      ),
    );

    const onInterrupt = vi.fn();
    await streamWrite("novel-1", "test", undefined, { onInterrupt });

    expect(onInterrupt).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "write_file",
        path: "/manuscript/chapters/test.md",
        content: "Nội dung prose đề xuất...",
      }),
    );
  });

  it("dispatch error callback khi fetch trả status không OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Server lỗi" }), {
          status: 500,
        }),
      ),
    );

    const onError = vi.fn();
    await streamWrite("novel-1", "test", undefined, { onError });

    expect(onError).toHaveBeenCalledWith("Server lỗi");
  });
});

describe("resumeWrite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("gửi body đúng với threadId + decision=approve", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockSSEResponse([
        {
          event: "complete",
          data: {
            rubricStatus: null,
            chapterId: null,
            chapterStatus: null,
            wordCount: null,
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);

    await resumeWrite("novel-1", "t1", "approve", undefined, {});

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/novels/novel-1/write/resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          threadId: "t1",
          decision: "approve",
          userId: undefined,
        }),
      }),
    );
  });

  it("gửi body đúng với decision=reject", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockSSEResponse([
        {
          event: "complete",
          data: {
            rubricStatus: null,
            chapterId: null,
            chapterStatus: null,
            wordCount: null,
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);

    await resumeWrite("novel-1", "t1", "reject", undefined, {});

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/novels/novel-1/write/resume",
      expect.objectContaining({
        body: JSON.stringify({
          threadId: "t1",
          decision: "reject",
          userId: undefined,
        }),
      }),
    );
  });
});
