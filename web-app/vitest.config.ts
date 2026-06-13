import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/testing-library.ts'],
    // Run test files sequentially — DB integration tests share the same test database
    // and parallel execution causes beforeEach resets to race across files
    fileParallelism: false,
    alias: {
      '@': path.resolve(__dirname, './'),
      // Neutralize Next.js server-only guard in test environments
      'server-only': path.resolve(__dirname, './tests/setup/server-only-mock.ts'),
    },
  },
})
