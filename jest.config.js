/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    // Same alias as tsconfig.json: `@/x` -> `src/x`.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // jest-expo's setup imports expo-modules-core, which npm installs inside
  // node_modules/expo/ (it cannot be hoisted: a peer conflict elsewhere in the
  // tree). Let tests resolve it there instead of changing the app's dependencies.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules/expo/node_modules'],
};
