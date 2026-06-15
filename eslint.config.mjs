import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "visualizer/**",
      "out/**",
      "node_modules/**",
      ".next/**",
    ],
  },
  {
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
