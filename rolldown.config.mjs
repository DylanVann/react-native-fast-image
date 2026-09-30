import path from 'node:path'
import { defineConfig } from 'rolldown'

const shared = {
    // Dependencies (react, react-native) come from the app.
    external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
    transform: {
        jsx: 'react',
        // The old Babel build targeted Node 12; keep newer syntax (such as
        // ?. and ??) out of the output for older React Native toolchains.
        target: 'es2019',
    },
}

// Builds dist/index.cjs.js (main, which Metro uses) and dist/index.js (module)
// from src, and the web versions next to them (index.cjs.web.js,
// index.web.js), which resolvers that try `.web.js` first, and the `browser`
// field, pick on the web. tsc writes the type declarations (see package.json).
export default defineConfig([
    {
        ...shared,
        input: 'src/index.tsx',
        output: [
            { file: 'dist/index.cjs.js', format: 'cjs' },
            { file: 'dist/index.js', format: 'esm' },
        ],
    },
    {
        ...shared,
        input: 'src/index.web.tsx',
        output: [
            { file: 'dist/index.cjs.web.js', format: 'cjs' },
            { file: 'dist/index.web.js', format: 'esm' },
        ],
    },
])
