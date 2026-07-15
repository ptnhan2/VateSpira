import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock @langchain/langgraph-sdk Client qua vi.hoisted. Factory bị hoist nên
 * phải dùng vi.hoisted cho các vi.fn (fe-dev-memory: quy tắc hoisting).
 * Factory KHÔNG dùng JSX — chỉ class với instance fields.
 */
const { runsStream, threadsCreate } = vi.hoisted(() => ({
  runsStream: vi.fn(),
  threadsCreate: vi.fn(),
}));

vi.mock("@langchain/langgraph-sdk", () => ({
  Client: class MockClient {
    /** Threads client — create() trả thread_id. */
    threads = { create: threadsCreate };
    /** Runs client — stream() trả async generator. */
    runs = { stream: runsStream };
  },
}));

import { POST } from "./route";
import type { NextRequest } from "next/server";

/** Tạo request giả với body JSON (chỉ cần .json()). */
function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** Tạo async generator yield các stream chunk. */
function makeStream(
  chunks: Array<{ event: string; data: unknown }>,
): AsyncGenerator<{ event: string; data: unknown }> {
  async function* gen() {
    for (const c of chunks) yield c;
  }
  return gen();
}

describe("POST /api/novels/create", () => {
  beforeEach(() => {
    runsStream.mockReset();
    threadsCreate.mockReset();
    threadsCreate.mockResolvedValue({ thread_id: "t1" });
    process.env.LANGSMITH_API_URL = "http://localhost:2024";
    process.env.LANGSMITH_API_KEY = "test-key";
    process.env.VATESPIRA_DEV_USER_ID = "dev-uuid";
  });

  it("400 khi thiếu title", async () => {
    const res = await POST(makeReq({ genre: "fantasy" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Tiêu đề");
  });

  it("401 khi không có userId và không có dev fallback env", async () => {
    delete process.env.VATESPIRA_DEV_USER_ID;
    const res = await POST(makeReq({ title: "T" }));
    expect(res.status).toBe(401);
  });

  it("500 khi thiếu LANGSMITH env", async () => {
    delete process.env.LANGSMITH_API_URL;
    const res = await POST(makeReq({ title: "T", userId: "u1" }));
    expect(res.status).toBe(500);
  });

  it("200 + novelId + scaffold khi agent gọi create_novel thành công", async () => {
    runsStream.mockReturnValue(
      makeStream([
        { event: "metadata", data: { run_id: "r1", thread_id: "t1" } },
        {
          event: "values",
          data: {
            messages: [
              { type: "human", content: "Tạo novel..." },
              { type: "ai", content: "", tool_calls: [{ name: "create_novel" }] },
              {
                type: "tool",
                name: "create_novel",
                content: JSON.stringify({
                  id: "novel-uuid",
                  title: "T",
                  scaffold: [
                    { path: "/manuscript/outline.md", ok: true },
                    { path: "/memories/novel-bible.md", ok: true },
                  ],
                }),
              },
              { type: "ai", content: "Đã tạo novel T." },
            ],
          },
        },
      ]),
    );
    const res = await POST(
      makeReq({ title: "T", genre: "fantasy", userId: "u1" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.novelId).toBe("novel-uuid");
    expect(data.scaffold).toHaveLength(2);
    // Verify payload truyền cho runs.stream: context top-level + streamMode.
    const payload = runsStream.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.context).toEqual({ user_id: "u1" });
    expect(payload.streamMode).toBe("values");
    expect((payload.input as { messages: unknown[] }).messages[0]).toMatchObject({
      role: "user",
    });
  });

  it("dùng dev fallback user_id khi body không có userId", async () => {
    runsStream.mockReturnValue(
      makeStream([
        {
          event: "values",
          data: {
            messages: [
              {
                type: "tool",
                content: JSON.stringify({
                  id: "n2",
                  scaffold: [{ path: "/manuscript/outline.md", ok: true }],
                }),
              },
            ],
          },
        },
      ]),
    );
    await POST(makeReq({ title: "T" }));
    const payload = runsStream.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.context).toEqual({ user_id: "dev-uuid" });
  });

  it("502 khi stream error event", async () => {
    runsStream.mockReturnValue(
      makeStream([{ event: "error", data: { message: "assistant not found" } }]),
    );
    const res = await POST(makeReq({ title: "T", userId: "u1" }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("assistant not found");
  });

  it("502 khi agent không gọi create_novel (không có tool message)", async () => {
    runsStream.mockReturnValue(
      makeStream([
        {
          event: "values",
          data: {
            messages: [{ type: "ai", content: "Tôi cần thêm thông tin." }],
          },
        },
      ]),
    );
    const res = await POST(makeReq({ title: "T", userId: "u1" }));
    expect(res.status).toBe(502);
  });
});
