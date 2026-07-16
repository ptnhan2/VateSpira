import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Cấu hình Vitest cho frontend.
 *
 * Môi trường jsdom giả lập DOM cho component test; setupFiles nạp matcher
 * jest-dom + cleanup testing-library; plugin React biên dịch JSX; alias `@`
 * trỏ về `./src` khớp với paths trong tsconfig.json. `globals: false` ép import
 * tường minh `{ describe, it, expect }` khỏi phải sửa tsconfig (Fence Editing).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    pool: "threads", // Windows: vitest 4 forks pool timeout — threads pool stable
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
