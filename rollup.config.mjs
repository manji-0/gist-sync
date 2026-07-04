import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const production = !process.env.ROLLUP_WATCH;

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/extension.ts",
  output: {
    file: "out/extension.js",
    format: "cjs",
    sourcemap: !production,
  },
  external: ["vscode"],
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    typescript({
      tsconfig: "./tsconfig.rollup.json",
      sourceMap: !production,
    }),
    production && terser(),
  ],
};
