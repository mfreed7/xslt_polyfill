#!/bin/bash

# Exit on any error
set -e

# Define absolute paths for our build directories
BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/build"
XML2_INSTALL_DIR="${BUILD_DIR}/libxml2-install"
XSLT_INSTALL_DIR="${BUILD_DIR}/libxslt-install"

# --- Compile C glue code to WASM ---
emcc -O3 \
  src/transform.c \
  -o transform.js \
  -s WASM=1 \
  -s MODULARIZE=1 \
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

