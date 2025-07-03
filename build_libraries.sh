#!/bin/bash

# Exit on any error
set -e

# Define absolute paths for our build directories
BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/dist"
XML2_INSTALL_DIR="${BUILD_DIR}/libxml2-install"
XSLT_INSTALL_DIR="${BUILD_DIR}/libxslt-install"

# Clean up previous builds
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# --- Configure libxml2 ---
cd "${BASE_DIR}/src/libxml2"
export NOCONFIGURE=1 # We'll run it with emconfigure instead
./autogen.sh

# Configure with Emscripten's emconfigure wrapper
emconfigure ./configure \
    --host=wasm32-unknown-emscripten \
    --prefix="${XML2_INSTALL_DIR}" \
    --with-xpath \
    --without-threads \
    --without-catalog \
    --without-http \
    --without-ftp \
    --without-python \
    --without-iconv \
    --without-zlib \
    --without-lzma \
    --disable-shared \
    --enable-static

# --- Build libxml2 (needed by configure for libxslt)---
cd "${BASE_DIR}/src/libxml2"
emmake make
emmake make install

# --- Configure libxslt ---
cd "${BASE_DIR}/src/libxslt"
./autogen.sh

# Set PKG_CONFIG_PATH so it can find our locally-built libxml2
export PKG_CONFIG_PATH="${XML2_INSTALL_DIR}/lib/pkgconfig"

# Configure with emconfigure
emconfigure ./configure \
    --host=wasm32-unknown-emscripten \
    --prefix="${XSLT_INSTALL_DIR}" \
    --with-libxml-prefix="${XML2_INSTALL_DIR}" \
    --without-python \
    --disable-shared \
    --enable-static

# --- Build libxslt ---
cd "${BASE_DIR}/src/libxslt"
emmake make
emmake make install

cd "${BASE_DIR}"
