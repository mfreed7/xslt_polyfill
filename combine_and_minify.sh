#!/bin/bash

# Exit on any error
set -e

BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/dist"
COMBINED_FILE="${BUILD_DIR}/xslt-polyfill-complete.js"
MINIFIED_FILE="${BUILD_DIR}/xslt-polyfill-complete.min.js"
OUTPUT_FILE="${BASE_DIR}/xslt-polyfill.min.js"

# --- Build Configuration ---
BUILD_MODE="release"
if [ "$1" == "--debug" ]; then
  BUILD_MODE="debug"
fi

WASM_FILE="${BUILD_DIR}/xslt-wasm.js"

if [ "$BUILD_MODE" == "debug" ]; then
  WASM_FILE="${BUILD_DIR}/xslt-wasm-debug.js"
  echo "--- Building in DEBUG mode ---"
else
  echo "--- Building in RELEASE mode (default) ---"
fi

# Concatenate the polyfill and the WASM output
cat "${WASM_FILE}" "${BASE_DIR}/src/xslt-polyfill-src.js" > "${COMBINED_FILE}"

# Minify the combined file
terser "${COMBINED_FILE}" --compress --mangle --output "${MINIFIED_FILE}"

cat COPYRIGHT "${MINIFIED_FILE}" > "${OUTPUT_FILE}"

rm "${COMBINED_FILE}" "${MINIFIED_FILE}"

echo "--- Minified output to ${OUTPUT_FILE} ---"
