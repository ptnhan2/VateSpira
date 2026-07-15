import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Setup chung chạy trước mọi test file.
 *
 * Import side-effect nạp bộ matcher jest-dom (toBeInTheDocument, toBeDisabled,
 * toHaveValue...) vào Vitest. `afterEach(cleanup)` tháo component khỏi DOM sau
 * mỗi test để tránh state leak giữa các case.
 */
afterEach(() => {
  cleanup();
});
