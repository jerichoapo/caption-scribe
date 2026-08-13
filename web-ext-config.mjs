// Keep the shipped package to the add-on itself.
//
// Without this, the build carries the test suite, fixtures, the planning
// document, and a 148KB lockfile. None of it runs in the browser, and all of it
// is extra surface a reviewer has to read through.

export default {
  ignoreFiles: [
    'test/**',
    'fixtures/**',
    'fixtures-raw/**',
    'docs/**',
    'scripts/**',
    'screenshots/**',
    'plan-*.md',
    'package-lock.json',
    'web-ext-config.mjs',
    '.web-extension-id',
  ],
};
