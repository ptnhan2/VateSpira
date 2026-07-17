// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock @langchain/langgraph-sdk Client — threads.create/getState + runs.stream.
 * Factory bị hoist nên dùng vi.hoisted cho vi.fn (fe-dev-memory: quy tắc hoisting).
 */
const { runsStream, threadsCreate, threadsGetState } = vi.hoisted(() => ({
  runsStream: vi.fn(),
  threadsCreate: vi.fn(),
  threadsGetState: vi.fn(),
}));

vi.mock("@langchain/langgraph-sdk", () => ({
  Client: class MockClient {
    /** Threads client — create() trả thread_id, getState() trả thread state. */
    threads = { create: threadsCreate, getState: threadsGetState };
    /** Runs client — stream() trả async generator. */
    runs = { stream: runsStream };
  },
}));

/** Mock @supabase/supabase-js createClient — trả mock client với chainable methods. */
const { supabaseCreateClient } = vi.hoisted(() => ({
  supabaseCreateClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseCreateClient,
}));

import { POST } from "./route";
import type { NextRequest } from "next/server";

/** Tạo request giả với body JSON (chỉ cần .json()). */
function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** Tạo async generator yield các stream chunk (giả lập LangGraph SDK stream). */
function makeStream(
  chunks: Array<{ event: string; data: unknown }>,
): AsyncGenerator<{ event: string; data: unknown }> {
  async function* gen() {
    for (const c of chunks) yield c;
  }
  return gen();
}

/**
 * Đọc SSE events từ Response body — parse `event: <type>\ndata: <json>\n\n`.
 *
 * @param res - SSE Response từ route handler.
 * @returns Mảng parsed events.
 */
async function readSSE(
  res: Response,
): Promise<Array<{ event: string; data: unknown }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text
    .split("\n\n")
    .filter((s) => s.trim())
    .map((part) => {
      const lines = part.split("\n");
      let event = "";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataStr += line.slice(6);
      }
      return { event, data: JSON.parse(dataStr) };
    });
}

describe("POST /api/novels/[id]/write", () => {
  beforeEach(() => {
    runsStream.mockReset();
    threadsCreate.mockReset();
    threadsGetState.mockReset();
    threadsCreate.mockResolvedValue({ thread_id: "t1" });
    process.env.LANGSMITH_API_URL = "http://localhost:2024";
    process.env.LANGSMITH_API_KEY = "test-key";
    process.env.VATESPIRA_DEV_USER_ID = "dev-uuid";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });

  it("400 khi thiếu message", async () => {
    const res = await POST(makeReq({}), {
      params: Promise.resolve({ id: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 khi không có userId + không có dev fallback", async () => {
    delete process.env.VATESPIRA_DEV_USER_ID;
    const res = await POST(makeReq({ message: "test" }), {
      params: Promise.resolve({ id: "test" }),
    });
    expect(res.status).toBe(401);
  });

  it("500 khi thiếu LANGSMITH env", async () => {
    delete process.env.LANGSMITH_API_URL;
    const res = await POST(
      makeReq({ message: "test", userId: "u1" }),
      { params: Promise.resolve({ id: "test" }) },
    );
    expect(res.status).toBe(500);
  });

  it("emit interrupt SSE khi agent HITL pause (write_file đề xuất)", async () => {
    runsStream.mockReturnValue(
      makeStream([
        { event: "metadata", data: { run_id: "r1", thread_id: "t1" } },
        {
          event: "values",
          data: {
            messages: [{ type: "human", content: "viết chương 1" }],
          },
        },
      ]),
    );
    threadsGetState.mockResolvedValue({
      next: ["model"],
      tasks: [
        {
          interrupts: [
            {
              value: {
                action_requests: [
                  {
                    name: "write_file",
                    args: {
                      file_path: "/manuscript/chapters/test.md",
                      content: "Nội dung prose đề xuất",
                    },
                    description: "approve write_file",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const res = await POST(
      makeReq({ message: "viết chương 1", userId: "u1" }),
      { params: Promise.resolve({ id: "test" }) },
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readSSE(res);
    const interruptEvent = events.find((e) => e.event === "interrupt");
    expect(interruptEvent).toBeDefined();
    expect(
      (interruptEvent!.data as { content: string }).content,
    ).toBe("Nội dung prose đề xuất");
    expect(
      (interruptEvent!.data as { toolName: string }).toolName,
    ).toBe("write_file");
  });

  it("emit complete SSE + update DB khi agent hoàn thành (_rubric_status satisfied)", async () => {
    runsStream.mockReturnValue(
      makeStream([
        { event: "metadata", data: { run_id: "r1", thread_id: "t1" } },
        {
          event: "values",
          data: {
            messages: [
              { type: "human", content: "viết chương 1" },
              {
                type: "tool",
                content: JSON.stringify({
                  id: "c1",
                  number: 1,
                  title: "Chương 1",
                  word_count: 500,
                }),
                name: "save_chapter_metadata",
              },
            ],
            _rubric_status: "satisfied",
            _rubric_evaluations: [
              {
                result: "satisfied",
                criteria: [],
                explanation: "Tốt",
              },
            ],
          },
        },
      ]),
    );
    threadsGetState.mockResolvedValue({ next: [] });

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "c1",
          word_count: 500,
          novels: { user_id: "u1" },
        },
      }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: {} }),
    };
    supabaseCreateClient.mockReturnValue({
      from: vi.fn(() => mockChain),
    });

    const res = await POST(
      makeReq({ message: "viết chương 1", userId: "u1" }),
      { params: Promise.resolve({ id: "test" }) },
    );
    const events = await readSSE(res);
    const completeEvent = events.find((e) => e.event === "complete");
    expect(completeEvent).toBeDefined();
    expect(
      (completeEvent!.data as { rubricStatus: string }).rubricStatus,
    ).toBe("satisfied");
    expect(
      (completeEvent!.data as { chapterStatus: string }).chapterStatus,
    ).toBe("final");
    expect(
      (completeEvent!.data as { chapterId: string }).chapterId,
    ).toBe("c1");
  });
});
