#!/bin/bash

# Exit on any error
set -e

# --- Define Paths ---
BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/dist"
XML2_INSTALL_DIR="${BUILD_DIR}/libxml2-install"
XSLT_INSTALL_DIR="${BUILD_DIR}/libxslt-install"

# --- Build Configuration ---
BUILD_MODE="release"
if [ "$1" == "--debug" ]; then
  BUILD_MODE="debug"
fi

OUT_FILE="${BUILD_DIR}/xslt-wasm.js"
EMCC_OPT_LEVEL="-O1"
EMCC_ASSERTIONS="-s ASSERTIONS=1"
EMCC_ASYNCIFY_DEBUG=""

if [ "$BUILD_MODE" == "debug" ]; then
  OUT_FILE="${BUILD_DIR}/xslt-wasm-debug.js"
  EMCC_OPT_LEVEL="-O0"
  EMCC_ASSERTIONS="-s ASSERTIONS=2"
  EMCC_ASYNCIFY_DEBUG="-s ASYNCIFY_DEBUG=1"
  echo "--- Building in DEBUG mode ---"
else
  echo "--- Building in RELEASE mode (default) ---"
fi

# --- Set PKG_CONFIG_PATH for emscripten ---
# This tells pkg-config where to find the .pc files for our compiled libs
export PKG_CONFIG_PATH="${XML2_INSTALL_DIR}/lib/pkgconfig:${XSLT_INSTALL_DIR}/lib/pkgconfig"

# --- Verify that pkg-config can find the libraries ---
if ! pkg-config --exists libxml-2.0 || ! pkg-config --exists libxslt; then
    echo "Error: pkg-config could not find libxml-2.0 or libxslt." >&2
    echo "This means the libraries were not built and installed correctly into the output directory." >&2
    echo "PKG_CONFIG_PATH is: ${PKG_CONFIG_PATH}" >&2
    exit 1
fi

# Get compiler and linker flags directly from pkg-config
# This is the robust way to find headers and libraries
CFLAGS=$(pkg-config --cflags libxml-2.0 libxslt)
LIBS=$(pkg-config --libs libxml-2.0 libxslt)

emcc ${EMCC_OPT_LEVEL} -gsource-map \
  src/transform.c \
  -o ${OUT_FILE} \
  ${CFLAGS} \
  -s MODULARIZE \
  -s SINGLE_FILE \
  -s ALLOW_MEMORY_GROWTH \
  -s SAFE_HEAP \
  ${EMCC_ASSERTIONS} \
  -s INITIAL_MEMORY=130MB \
  -s STACK_SIZE=5MB \
  -s EXPORT_NAME=createXSLTTransformModule \
  -s EXPORTED_FUNCTIONS=_transform,_malloc,_free,Asyncify \
  -s EXPORTED_RUNTIME_METHODS=cwrap,UTF8ToString,wasmMemory,Asyncify,stringToNewUTF8 \
  -s ASYNCIFY \
  ${EMCC_ASYNCIFY_DEBUG} \
  -s ASYNCIFY_IMPORTS=fetch_and_load_document \
  -s ASYNCIFY_ADD=transform \
  -s ASYNCIFY_IGNORE_INDIRECT=0 \
  -s ASYNCIFY_STACK_SIZE=5MB \
  -Wl,--export-memory \
  ${LIBS}


echo "--- ${OUT_FILE} (embedded WASM) ---"
