import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { reactCompilerBabelPlugin } from "./react-compiler-plugin";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [reactCompilerBabelPlugin()],
      },
    }),
  ],
  test: {
    restoreMocks: true,
    environment: "./vitest.environment.ts",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
