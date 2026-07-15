import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNovelViaAgent } from "./agent";

/**
 * Mock fetch cho createNovelViaAgent. Dùng object giả lập Response (ok, status,
 * json) thay vì constructor `Response` để tránh phụ thuộc môi trường.
 */
function mockFetch(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response);
}

describe("createNovelViaAgent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POST đúng endpoint + body, trả success khi API ok", async () => {
    mockFetch({
      success: true,
      novelId: "novel-uuid",
      scaffold: [{ path: "/manuscript/outline.md", ok: true }],
    });
    const result = await createNovelViaAgent({
      title: "Tiểu thuyết",
      genre: "fantasy",
      language: "vi",
      pov: "1st",
      tense: "past",
      technique: "save-the-cat",
      userId: "u1",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/novels/create",
      expect.objectContaining({ method: "POST" }),
    );
    const callBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.title).toBe("Tiểu thuyết");
    expect(callBody.genre).toBe("fantasy");
    expect(callBody.userId).toBe("u1");
    expect(result.success).toBe(true);
    expect(result.novelId).toBe("novel-uuid");
    expect(result.scaffold).toHaveLength(1);
  });

  it("trả error khi API trả 401 (chưa đăng nhập)", async () => {
    mockFetch(
      { error: "Đăng nhập để tạo tiểu thuyết." },
      { ok: false, status: 401 },
    );
    const result = await createNovelViaAgent({
      title: "T",
      genre: "fantasy",
      language: "vi",
      pov: "1st",
      tense: "past",
      technique: "save-the-cat",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Đăng nhập để tạo tiểu thuyết.");
  });

  it("trả error generic khi API fail không có error field", async () => {
    mockFetch({}, { ok: false, status: 500 });
    const result = await createNovelViaAgent({
      title: "T",
      genre: "fantasy",
      language: "vi",
      pov: "1st",
      tense: "past",
      technique: "save-the-cat",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
