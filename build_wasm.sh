#!/bin/bash

# Exit on any error
set -e

# --- Define Paths ---
BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/build"
XML2_INSTALL_DIR="${BUILD_DIR}/libxml2-install"
XSLT_INSTALL_DIR="${BUILD_DIR}/libxslt-install"
OUT_FILE="${BUILD_DIR}/xslt_wasm.js"

# --- Compile C glue code to WASM ---
emcc -O3 \
  src/transform.c \
  -o ${OUT_FILE} \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s SINGLE_FILE=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  # -s SAFE_HEAP=1 \
  # -s ASSERTIONS=1 \
  # -s INITIAL_MEMORY=134217728 \
  # -s STACK_SIZE=5242880 \
  -s EXPORT_NAME="'createXSLTTransformModule'" \
  -s EXPORTED_FUNCTIONS="['_transform', '_malloc', '_free']" \
  -s EXPORTED_RUNTIME_METHODS="['cwrap', 'UTF8ToString']" \
  -I"${XSLT_INSTALL_DIR}/include" \
  -I"${XML2_INSTALL_DIR}/include/libxml2" \
  -L"${XSLT_INSTALL_DIR}/lib" \
  -L"${XML2_INSTALL_DIR}/lib" \
  -lxslt \
  -lexslt \
  -lxml2

echo "--- ${OUT_FILE} (embedded WASM) ---"
