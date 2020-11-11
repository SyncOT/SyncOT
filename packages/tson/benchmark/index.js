import Benchmark from 'benchmark'
import { encode, decode } from '@syncot/tson'
import { assert } from '@syncot/util'

// See https://github.com/babel/babel/issues/1468
global.encode = encode
global.decode = decode
global.assert = assert
global.input = Array.from(Array(100), (_, i) => ({
    ssssss: 'value' + i + '\u{10ffff}\u{10def}\u{565}',
    nnnnnn: 12345.3 + i,
    bbbbbb: !!(i % 2),
    n: null,
    o: { key: 'value' },
    a: [1, 2, 3],
}))
global.encoded
global.output

new Benchmark.Suite()
    .add('TSON', {
        setup() {},
        fn: function () {
            output = decode(encode(input))
        },
        teardown() {
            assert(output.length === input.length)
        },

        // setup() {},
        // fn: function() {
        //     encoded = encode(input)
        // },
        // teardown() {
        //     output = decode(encoded)
        //     assert(output.length === input.length)
        // },

        // setup() {
        //     encoded = encode(input)
        // },
        // fn: function() {
        //     output = decode(encoded)
        // },
        // teardown() {
        //     assert(output.length === input.length)
        // },
    })
    .add('JSON', {
        setup() {},
        fn: function () {
            output = JSON.parse(JSON.stringify(input))
        },
        teardown() {
            assert(output.length === input.length)
        },

        // setup() {},
        // fn: function() {
        //     encoded = JSON.stringify(input)
        // },
        // teardown() {
        //     output = JSON.parse(encoded)
        //     assert(output.length === input.length)
        // },

        // setup() {
        //     encoded = JSON.stringify(input)
        // },
        // fn: function() {
        //     output = JSON.parse(encoded)
        // },
        // teardown() {
        //     assert(output.length === input.length)
        // },
    })

    .on('cycle', function (event) {
        console.info(event.target.error || String(event.target))
    })
    .on('complete', function () {
        console.info(`The fastest is ${this.filter('fastest').map('name')}.`)
    })

    .run({ async: true })
