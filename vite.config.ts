import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // One entry, one stylesheet. (A second entry shipped with cssCodeSplit:false
    // once leaked `main { max-width }` into another page — keep this honest.)
    cssCodeSplit: true,
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Two workers share one temp directory for transformed modules and race on the
    // same file name; on Windows the loser gets EPERM and its test file dies. The
    // suite is 30 assertions, so serialising it costs nothing and buys determinism.
    fileParallelism: false,
  },
});
