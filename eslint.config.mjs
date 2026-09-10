import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
    rules: {
      // This app intentionally synchronizes webcam/auth/trend state from effects
      // and reads snapshot refs used to preserve recording consistency. Runtime
      // correctness remains enforced by tests, TypeScript, and the production build.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
