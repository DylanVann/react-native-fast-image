import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'rolldown'

// Copies the Flow types next to each output file (e.g. dist/index.cjs.js.flow),
// where Flow looks for them, whichever file it resolves to.
const flowTypes = {
    name: 'flow-types',
    writeBundle(options) {
        copyFileSync('src/index.js.flow', `${options.file}.flow`)
    },
}

const shared = {
    // Dependencies (react, react-native) come from the app.
    external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
    transform: {
        jsx: 'react',
        // The old Babel build targeted Node 12; keep newer syntax (such as
        // ?. and ??) out of the output for older React Native toolchains.
        target: 'es2019',
    },
    plugins: [flowTypes],
}

// Builds dist/index.cjs.js (main) and dist/index.js (module) from src, and the
// web versions next to them (index.cjs.web.js, index.web.js), which resolvers
// that try `.web.js` first, and the `browser` field, pick on the web, each with
// the Flow types next to it. tsc writes the type declarations (see
// package.json).
//
// dist is for Jest and Node: the Codegen specs (src/specs) are bundled in, as
// plain JavaScript, so React Native's Jest preset (which doesn't transform
// node_modules) can load it, and codegenNativeComponent finds the view at
// runtime (the preset mocks it). Metro loads src instead, through
// package.json's `react-native` field, which Jest doesn't read: React Native's
// Babel plugin builds the view config from the typed
// codegenNativeComponent<NativeProps>(...) call, which a bundle doesn't keep.
// An `exports` map can't split them this way: React Native's Jest environment
// also uses the `react-native` condition.
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
