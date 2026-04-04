import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'shared/binary-reader',
      'packages/gmt-parser',
      'packages/three-gmt',
      'packages/par-parser',
      'packages/gmd-parser',
      'packages/three-gmd',
    ],
  },
});
