# XSLT Polyfill

This is a polyfill for the XSLT W3C web standard, as shipped in browsers.

## Building

The build assumes several tools such as emscripten and make. But two shell
scripts handle building everything:

```
$ # Build the libxml2 and libxslt libraries:
$ ./build_libraries.sh

$ # Build the wasm module exporting the transform() method.
$ ./build_wasm.sh
```
