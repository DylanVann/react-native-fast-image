import path from 'node:path'
import { fileURLToPath } from 'node:url'
import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    input: 'src/index.tsx',
    output: [
        {
            file: 'dist/index.cjs.js',
            format: 'cjs',
            exports: 'default',
            interop: 'default',
        },
        {
            file: 'dist/index.js',
            format: 'esm',
        },
    ],
    external: ['react', 'react-native'],
    plugins: [
        babel({
            babelHelpers: 'bundled',
            configFile: false,
            babelrc: false,
            extensions: ['.ts', '.tsx', '.js', '.jsx'],
            presets: [
                [
                    '@babel/preset-env',
                    {
                        targets: { node: '18' },
                        modules: false,
                        bugfixes: true,
                    },
                ],
                ['@babel/preset-react', { runtime: 'classic' }],
                '@babel/preset-typescript',
            ],
            root: __dirname,
        }),
        nodeResolve({
            extensions: ['.ts', '.tsx', '.js', '.jsx'],
        }),
        commonjs(),
    ],
}
