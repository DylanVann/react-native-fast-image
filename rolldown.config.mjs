import path from 'node:path'
import { defineConfig } from 'rolldown'

// Builds dist/index.cjs.js (main) and dist/index.js (module) from src, for
// tools other than Metro (which uses src, see package.json's react-native). tsc writes the type declarations (see package.json).
export default defineConfig({
    input: 'src/index.tsx',
    // Dependencies (react, react-native) come from the app.
    external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
    transform: {
        jsx: 'react',
        // The old Babel build targeted Node 12; keep newer syntax (such as
        // ?. and ??) out of the output for older React Native toolchains.
        target: 'es2019',
    },
    output: [
        { file: 'dist/index.cjs.js', format: 'cjs', exports: 'named' },
        { file: 'dist/index.js', format: 'esm' },
    ],
})
