import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    tseslint.configs.recommended,
    prettier,
    {
        rules: {
            curly: ["error", "all"],
            "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        ignores: ["out/**", "node_modules/**"],
    },
);
