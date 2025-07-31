// Copyright (c) 2025, Mason Freed
// All rights reserved.
//
// This source code is licensed under the BSD-style license found in the
// LICENSE file in the root directory of this source tree.

// This is a polyfill for the XSLTProcessor API.
// See: https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor

// The actual XSLT processing is performed by the xslt-processor package:
//   https://github.com/DesignLiquido/xslt-processor/tree/main
// Please see its copyright terms in src/xslt-processor/LICENSE.

(function() {
  // Feature detection
  if (window.xsltPolyfillInstalled) {
    return;
  }
  window.xsltPolyfillInstalled = true;
  let polyfillReadyPromiseResolve;
  let polyfillReadyPromiseReject;
  const polyfillReadyPromise = new Promise((resolve,reject) => {
    polyfillReadyPromiseResolve = resolve;
    polyfillReadyPromiseReject = reject;
  });
  window.xsltUsePolyfillAlways = ('xsltUsePolyfillAlways' in window) ? window.xsltUsePolyfillAlways : false;
  const nativeSupported = 'XSLTProcessor' in window;
  const polyfillWillLoad = !nativeSupported || window.xsltUsePolyfillAlways;
  if (polyfillWillLoad) {
    // The polyfill
    const promiseName = 'xsltPolyfillReady';

    // Initialize the WASM module, first thing.
    let WasmModule = null;
    let wasm_transform = null;
    let wasm_free = null;

    createXSLTTransformModule().then(Module => {
        WasmModule = Module;
        // Get a direct reference to the exported C functions.
        wasm_transform = Module._transform;
        wasm_free = Module._free;

        // Tell people we're ready.
        polyfillReadyPromiseResolve();
        console.log('XSLT WASM Module Loaded');
    }).catch(err => {
        console.error("Error loading XSLT WASM module:", err);
        polyfillReadyPromiseReject(err);
    });

    /**
     * Manages memory to call the WASM transform function using standard Web APIs
     * instead of relying on non-standard Emscripten runtime methods.
     * @param {string} xmlContent
     * @param {string} xsltContent
     * @param {Map<string, string>} parameters
     * @returns {string} The transformed string result.
     */
    function transformXmlWithXslt(xmlContent, xsltContent, parameters) {
      if (!wasm_transform || !WasmModule) {
        throw new Error(`Polyfill XSLT WASM module not yet loaded. Please wait for the ${promiseName} promise to resolve.`);
      }

      const memory = WasmModule.wasmMemory.buffer;
      const heapu8 = new Uint8Array(memory);
      const dataView = new DataView(memory);
      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();

      let xmlPtr = 0;
      let xsltPtr = 0;
      let paramsPtr = 0;
      const paramStringPtrs = [];

      // Helper to write JS strings to WASM memory manually.
      const writeStringToHeap = (str) => {
          const encodedStr = textEncoder.encode(str);
          const ptr = WasmModule._malloc(encodedStr.length + 1);
          if (!ptr) throw new Error(`WASM malloc failed for string: ${str.substring(0, 50)}...`);
          heapu8.set(encodedStr, ptr);
          heapu8[ptr + encodedStr.length] = 0; // Null terminator
          return ptr;
      };

      // Helper to read a null-terminated UTF-8 string from WASM memory.
      const readStringFromHeap = (ptr) => {
          let end = ptr;
          while (heapu8[end] !== 0) {
              end++;
          }
          return textDecoder.decode(heapu8.subarray(ptr, end));
      };


      try {
          // 1. Prepare parameters from the Map into a flat array.
          // libxslt expects string values to be XPath expressions, so simple strings
          // must be enclosed in quotes.
          const paramsArray = [];
          if (parameters) {
              for (const [key, value] of parameters.entries()) {
                  paramsArray.push(key);
                  // Wrap value in single quotes for libxslt.
                  // Basic escaping for values containing single quotes is not handled here.
                  paramsArray.push(`'${String(value)}'`);
              }
          }

          // 2. Allocate memory for parameter strings and the pointer array in the WASM heap.
          if (paramsArray.length > 0) {
              // Allocate memory for the array of pointers (char**), plus a NULL terminator.
              const ptrSize = 4; // Pointers are 32-bit in wasm32
              paramsPtr = WasmModule._malloc((paramsArray.length + 1) * ptrSize);
              if (!paramsPtr) throw new Error("WASM malloc failed for params pointer array.");

              // Allocate memory for each string, write it to the heap, and store its pointer.
              paramsArray.forEach((str, i) => {
                  const strPtr = writeStringToHeap(str);
                  paramStringPtrs.push(strPtr); // Track for later cleanup.
                  // Write the pointer to the string into the paramsPtr array.
                  dataView.setUint32(paramsPtr + i * ptrSize, strPtr, true);
              });

              // Null-terminate the array of pointers.
              dataView.setUint32(paramsPtr + paramsArray.length * ptrSize, 0, true);
          }

          // 3. Allocate memory for XML and XSLT content.
          xmlPtr = writeStringToHeap(xmlContent);
          xsltPtr = writeStringToHeap(xsltContent);

          // 4. Call the C function with pointers to the data in WASM memory.
          const resultPtr = wasm_transform(xmlPtr, xsltPtr, paramsPtr);

          if (!resultPtr) {
              throw new Error(`XSLT Transformation failed: check console for errors from the WASM module.`);
          }

          // 5. Convert the result pointer (char*) back to a JS string.
          const resultString = readStringFromHeap(resultPtr);

          // 6. Free the result pointer itself, which was allocated by the C code.
          wasm_free(resultPtr);

          return resultString;

      } finally {
          // 7. Clean up all allocated memory to prevent memory leaks in the WASM heap.
          if (xmlPtr) wasm_free(xmlPtr);
          if (xsltPtr) wasm_free(xsltPtr);
          paramStringPtrs.forEach(ptr => wasm_free(ptr));
          if (paramsPtr) wasm_free(paramsPtr);
      }
    }


    class XSLTProcessor {
      #stylesheetText = null;
      #parameters = new Map();

      constructor() {}
      isPolyfill() {
        return true;
      }

      importStylesheet(stylesheet) {
        this.#stylesheetText = (new XMLSerializer()).serializeToString(stylesheet);
      }

      transformToFragment(source, document) {
        if (!this.#stylesheetText) {
            throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        const sourceXml = (new XMLSerializer()).serializeToString(source);
        const output = transformXmlWithXslt(sourceXml, this.#stylesheetText, this.#parameters);
        // Eventually need to grab the output type, instead of assuming html:
        const doc = (new DOMParser()).parseFromString(output, 'text/html');
        const fragment = document.createDocumentFragment();
        fragment.appendChild(doc.documentElement);
        return fragment;
      }

      transformToDocument(source) {
        if (!this.#stylesheetText) {
            throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        const sourceXml = (new XMLSerializer()).serializeToString(source);
        const output = transformXmlWithXslt(sourceXml, this.#stylesheetText, this.#parameters);
        // output MimeType should ideally be detected from xsl:output method.
        // Assuming 'application/xml' is a safe default.
        return (new DOMParser()).parseFromString(output, 'application/xml');
      }

      setParameter(namespaceURI, localName, value) {
        // libxslt top-level parameters are not namespaced.
        this.#parameters.set(localName, value);
      }

      getParameter(namespaceURI, localName) {
        return this.#parameters.get(localName) || null;
      }

      removeParameter(namespaceURI, localName) {
        this.#parameters.delete(localName);
      }

      clearParameters() {
        this.#parameters.clear();
      }

      reset() {
        this.#stylesheetText = null;
        this.clearParameters();
      }
    }

    function xsltPolyfillReady() {
      return polyfillReadyPromise;
    }
  } // if (polyfillWillLoad)

  // Utility functions that get exported even if native XSLT is supported:

  function replaceDoc(text) {
    // This is a destructive action, replacing the current page.
    if (text instanceof DocumentFragment) {
      document.body.replaceChildren(text);
    } else {
      document.open();
      document.write(text);
      document.close();
    }
  }

  async function loadXmlWithXslt(path) {
    // Fetch the XML file from provided path.
    const xmlResponse = await fetch(path);
    if (!xmlResponse.ok) {
      return replaceDoc(`Failed to fetch XML file: ${xmlResponse.statusText}`);
    }
    const xmlText = await xmlResponse.text();

    // Look inside XML file for a processing instruction with an XSLT file.
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      return replaceDoc(`Error parsing XML file: ${parserError.textContent}`);
    }

    let xsltPath = null;
    for (const node of xmlDoc.childNodes) {
      if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE && node.target === 'xml-stylesheet') {
        const data = node.data;
        const hrefMatch = data.match(/href="([^"]+)"/);
        const typeMatch = data.match(/type="([^"]+)"/);
        if (hrefMatch?.[1] && typeMatch && (typeMatch[1] === 'text/xsl' || typeMatch[1] === 'application/xslt+xml')) {
          xsltPath = hrefMatch[1];
          break;
        }
      }
    }

    if (!xsltPath) {
      return replaceDoc(`No XSLT processing instruction found in ${path}`);
    }

    // Fetch the XSLT file, resolving its path relative to the XML file's URL.
    const xsltUrl = new URL(xsltPath, xmlResponse.url);
    const xsltResponse = await fetch(xsltUrl.href);
    if (!xsltResponse.ok) {
      return replaceDoc(`Failed to fetch XSLT file: ${xsltResponse.statusText}`);
    }
    const xsltText = await xsltResponse.text();

    // Process XML/XSLT and replace the document.
    let resultHtml;
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "application/xml");
      const xsltDoc = parser.parseFromString(xsltText, "application/xml");
      // Maybe polyfill, maybe not:
      const xsltProcessor = new XSLTProcessor();
      xsltProcessor.importStylesheet(xsltDoc);
      resultHtml = xsltProcessor.transformToFragment(xmlDoc, document);
    } catch (e) {
      return replaceDoc(`Error processing XML/XSLT: ${e}`);
    }
    // Replace the document with the result
    replaceDoc(resultHtml);
  }
  function loadXmlWithXsltWhenReady(url) {
    if (polyfillWillLoad) {
      xsltPolyfillReady().then(() => loadXmlWithXslt(url));
    } else {
      loadXmlWithXslt(url);
    }
  }

  // Initialize
  function init() {
    if (polyfillWillLoad) {
      window.XSLTProcessor = XSLTProcessor;
      window.loadXmlWithXslt = loadXmlWithXslt;
      window.xsltPolyfillReady = xsltPolyfillReady;
    }
    window.loadXmlWithXsltWhenReady = loadXmlWithXsltWhenReady;
    console.log(`XSLT polyfill ${!polyfillWillLoad ? "NOT " : ""}installed (native supported: ${nativeSupported}).`);
  }
  init();
})();
