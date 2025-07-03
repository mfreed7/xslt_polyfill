#!/bin/bash

# Exit on any error
set -e

# Define absolute paths for our build directories
BASE_DIR=$(pwd)
BUILD_DIR="${BASE_DIR}/build"
XML2_INSTALL_DIR="${BUILD_DIR}/libxml2-install"
XSLT_INSTALL_DIR="${BUILD_DIR}/libxslt-install"


# Set debug flags
export CFLAGS="-g -s ASSERTIONS=1 -s SAFE_HEAP=1"


# --- Build libxml2 ---
cd "${BASE_DIR}/src/libxml2"
emmake make
emmake make install

# --- Build libxslt ---
cd "${BASE_DIR}/src/libxslt"
emmake make
emmake make install

cd "${BASE_DIR}"
