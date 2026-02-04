module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  rules: {
    // Unused variables
    "@typescript-eslint/no-unused-vars": "warn",
    "no-unused-vars": "off", // Disable base rule to avoid duplicates
    
    // Prefer const over let
    "prefer-const": "error",
    
    // Additional useful rules
    "no-console": "off", // Allow console.log in Lambdas for logging
    "no-debugger": "error",
    "eqeqeq": "error",
    "curly": "error",
  },
  ignorePatterns: [".eslintrc.js", "jest.config.js", "dist/**/*"],
};
