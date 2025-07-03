#!/bin/bash

# Exit on any error
set -e

BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/dist"
COMBINED_FILE="${BUILD_DIR}/xslt_polyfill_complete.js"
OUTPUT_FILE="${BUILD_DIR}/xslt_polyfill.min.js"

# Concatenate the polyfill and the WASM output
cat "${BUILD_DIR}/xslt_wasm.js" "${BASE_DIR}/src/xslt_polyfill.js" > "${COMBINED_FILE}"

# Minify the combined file
terser "${COMBINED_FILE}" --compress --mangle --output --comments "${OUTPUT_FILE}"

echo "--- Minified output to ${OUTPUT_FILE} ---"
