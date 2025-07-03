#!/bin/bash

# Exit on any error
set -e

# --- Define Paths ---
BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/build"
XML2_INSTALL_DIR="${BUILD_DIR}/libxml2-install"
XSLT_INSTALL_DIR="${BUILD_DIR}/libxslt-install"
OUT_FILE="${BUILD_DIR}/xslt_wasm.js"

# --- Set PKG_CONFIG_PATH for emscripten ---
# This tells pkg-config where to find the .pc files for our compiled libs
export PKG_CONFIG_PATH="${XML2_INSTALL_DIR}/lib/pkgconfig:${XSLT_INSTALL_DIR}/lib/pkgconfig"

# --- Verify that pkg-config can find the libraries ---
if ! pkg-config --exists libxml-2.0 || ! pkg-config --exists libxslt; then
    echo "Error: pkg-config could not find libxml-2.0 or libxslt." >&2
    echo "This means the libraries were not built and installed correctly into the ./build directory." >&2
    echo "PKG_CONFIG_PATH is: ${PKG_CONFIG_PATH}" >&2
    exit 1
fi

# Get compiler and linker flags directly from pkg-config
# This is the robust way to find headers and libraries
CFLAGS=$(pkg-config --cflags libxml-2.0 libxslt)
LIBS=$(pkg-config --libs libxml-2.0 libxslt)

emcc -O1 -gsource-map \
  src/transform.c \
  -o ${OUT_FILE} \
  ${CFLAGS} \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s SINGLE_FILE=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s SAFE_HEAP=1 \
  -s ASSERTIONS=1 \
  -s INITIAL_MEMORY=134217728 \
  -s STACK_SIZE=5242880 \
  -s EXPORT_NAME="'createXSLTTransformModule'" \
  -s EXPORTED_FUNCTIONS="['_transform', '_malloc', '_free']" \
  -s EXPORTED_RUNTIME_METHODS="['cwrap', 'UTF8ToString']" \
  ${LIBS}


echo "--- ${OUT_FILE} (embedded WASM) ---"
