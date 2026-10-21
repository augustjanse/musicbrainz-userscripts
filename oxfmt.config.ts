import { defineConfig } from 'oxfmt';

export default defineConfig({
    printWidth: 140,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    tabWidth: 4,
    useTabs: false,
    bracketSpacing: true,
    arrowParens: 'avoid',
    endOfLine: 'lf',
    insertFinalNewline: true,
    proseWrap: 'preserve',
    // Saved VGMdb pages are kept byte for byte as served
    ignorePatterns: ['pnpm-lock.yaml', 'tests/vgmdb/fixtures/**'],
    sortImports: true,
    overrides: [
        {
            files: ['**/*.yml', '**/*.yaml'],
            options: { tabWidth: 2 },
        },
    ],
});
