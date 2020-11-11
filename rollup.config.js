import commonjs from '@rollup/plugin-commonjs'
import html from '@rollup/plugin-html'
import nodeResolve from '@rollup/plugin-node-resolve'
import liveReload from 'rollup-plugin-livereload'
import postcss from 'rollup-plugin-postcss'
import serve from 'rollup-plugin-serve'

const isWatchMode = process.env.ROLLUP_WATCH === 'true'
const shouldIncludeSourceMaps = process.env.SOURCEMAPS === 'true'
const src = 'demo/client'
const dst = 'demo/client-dist'

export default {
    input: `${src}/index.js`,
    output: {
        dir: dst,
        sourcemap: shouldIncludeSourceMaps,
        format: 'esm',
    },
    plugins: [
        commonjs(),
        nodeResolve({ browser: true, preferBuiltins: false }),
        postcss({ extract: true }),
        html({ title: 'SyncOT demo' }),
        isWatchMode && liveReload({ watch: dst }),
        isWatchMode && serve(dst),
    ],
    watch: {
        clearScreen: false,
    },
}
