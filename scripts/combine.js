const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const isDebug = process.argv.includes('--debug');
const baseDir = path.join(__dirname, '..');
const buildDir = path.join(baseDir, 'dist');
const wasmFile = path.join(buildDir, isDebug ? 'xslt-wasm-debug.js' : 'xslt-wasm.js');
const nowasmJsFile = path.join(buildDir, isDebug ? 'xslt-polyfill-debug.js' : 'xslt-polyfill.js');
const nowasmWasmFile = path.join(buildDir, isDebug ? 'xslt-polyfill-debug.wasm' : 'xslt-polyfill.wasm');
const polyfillSrc = path.join(baseDir, 'src', 'xslt-polyfill-src.js');
const outputFile = path.join(baseDir, 'xslt-polyfill.min.js');
const nowasmOutputFile = path.join(baseDir, 'xslt-polyfill.nowasm.min.js');
const wasmOutputFile = path.join(baseDir, 'xslt-polyfill.wasm');
const copyrightFile = path.join(baseDir, 'COPYRIGHT');
const { version } = require('../package.json');

async function build() {
    console.log('--- Building in ' + (isDebug ? 'DEBUG' : 'RELEASE') + ' mode (v' + version + ') ---');
    const wasmContent = fs.readFileSync(wasmFile, 'utf8');
    let polyfillContent = fs.readFileSync(polyfillSrc, 'utf8');
    const versionRegex = /const xsltPolyfillVersion = '[^']*';/;
    if (!versionRegex.test(polyfillContent)) {
        throw new Error('Could not find xsltPolyfillVersion declaration in ' + polyfillSrc);
    }
    const updatedPolyfillContent = polyfillContent.replace(
        versionRegex,
        `const xsltPolyfillVersion = '${version}';`
    );
    if (updatedPolyfillContent !== polyfillContent) {
        fs.writeFileSync(polyfillSrc, updatedPolyfillContent);
        polyfillContent = updatedPolyfillContent;
        console.log('--- Updated version in ' + polyfillSrc + ' to ' + version + ' ---');
    }
    const copyright = fs.readFileSync(copyrightFile, 'utf8');

    const combinedContent = wasmContent + '\n' + polyfillContent;
    const minified = await minify(combinedContent, {
        compress: true,
        mangle: true
    });
    fs.writeFileSync(outputFile, copyright + '\n' + minified.code);
    console.log('--- Minified output to ' + outputFile + ' ---');

    if (fs.existsSync(nowasmJsFile) && fs.existsSync(nowasmWasmFile)) {
        const nowasmJsContent = fs.readFileSync(nowasmJsFile, 'utf8');
        const nowasmCombined = nowasmJsContent + '\n' + polyfillContent;
        const nowasmMinified = await minify(nowasmCombined, {
            compress: true,
            mangle: true
        });
        fs.writeFileSync(nowasmOutputFile, copyright + '\n' + nowasmMinified.code);
        fs.copyFileSync(nowasmWasmFile, wasmOutputFile);
        console.log('--- Minified output to ' + nowasmOutputFile + ' and ' + wasmOutputFile + ' ---');
    }
}

build().catch(err => {
    console.error(err);
    process.exit(1);
});
