#!/bin/bash

# Exit on any error
set -e

# First build the dependency libraries
./build_libraries.sh

# Then build the WASM XSLT processor
./build_wasm.sh

# Finally put it together with the polyfill and minify
./combine_and_minify.sh
