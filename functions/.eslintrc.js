module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    // Relax some rules to be less strict
    "object-curly-spacing": "off",
    "indent": "off",
    "max-len": "off",
    "quotes": ["error", "double"],
    "comma-dangle": ["error", "never"],
    "no-unused-vars": "off",
    "require-jsdoc": "off",
  },
};
