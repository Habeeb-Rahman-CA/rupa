import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // esbuild (Vitest's default TS transform) does not emit `design:paramtypes`,
    // so Nest's ValidationPipe never sees DTO metaclasses in tests and silently
    // skips validation for controllers without a method-level `expectedType`
    // pipe. SWC emits the decorator metadata that `tsc` would, so tests exercise
    // the same validation path as the production build. Production builds use
    // `nest build` (tsc) and are unaffected.
    swc.vite(),
  ],
  test: {
    include: ['test/**/*.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    hookTimeout: 30000,
    // Every e2e spec drops/truncates tables in the same shared test database,
    // so test files must never run concurrently — parallel runs race on the
    // schema and produce spurious failures.
    fileParallelism: false,
  },
});
