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

      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();

      let xmlPtr = 0;
      let xsltPtr = 0;
      let paramsPtr = 0;
      let errorMsgPtrPtr = 0;
      const paramStringPtrs = [];

      // Helper to write JS strings to WASM memory manually.
      const writeStringToHeap = (str) => {
          const encodedStr = textEncoder.encode(str);
          const ptr = WasmModule._malloc(encodedStr.length + 1);
          if (!ptr) throw new Error(`WASM malloc failed for string: ${str.substring(0, 50)}...`);
          const heapu8 = new Uint8Array(WasmModule.wasmMemory.buffer);
          heapu8.set(encodedStr, ptr);
          heapu8[ptr + encodedStr.length] = 0; // Null terminator
          return ptr;
      };

      // Helper to read a null-terminated UTF-8 string from WASM memory.
      const readStringFromHeap = (ptr) => {
          const heapu8 = new Uint8Array(WasmModule.wasmMemory.buffer);
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
                  new DataView(WasmModule.wasmMemory.buffer).setUint32(paramsPtr + i * ptrSize, strPtr, true);
              });

              // Null-terminate the array of pointers.
              new DataView(WasmModule.wasmMemory.buffer).setUint32(paramsPtr + paramsArray.length * ptrSize, 0, true);
          }

          // 3. Allocate memory for XML and XSLT content.
          xmlPtr = writeStringToHeap(xmlContent);
          xsltPtr = writeStringToHeap(xsltContent);

          // 4. Allocate memory for the error message pointer (char**).
          const ptrSize = 4;
          errorMsgPtrPtr = WasmModule._malloc(ptrSize);
          if (!errorMsgPtrPtr) throw new Error("WASM malloc failed for error message pointer.");
          new DataView(WasmModule.wasmMemory.buffer).setUint32(errorMsgPtrPtr, 0, true); // Initialize to NULL

          // 5. Call the C function with pointers to the data in WASM memory.
          const resultPtr = wasm_transform(xmlPtr, xsltPtr, paramsPtr, errorMsgPtrPtr);

          if (!resultPtr) {
              let errorMessage = "";
              const errorMsgPtr = new DataView(WasmModule.wasmMemory.buffer).getUint32(errorMsgPtrPtr, true);
              if (errorMsgPtr) {
                  errorMessage = readStringFromHeap(errorMsgPtr);
                  wasm_free(errorMsgPtr); // Free the string allocated in C.
              }
              throw new Error(`XSLT Transformation failed${errorMessage ? ': ' + errorMessage : ''}`);
          }

          // 6. Convert the result pointer (char*) back to a JS string.
          const resultString = readStringFromHeap(resultPtr);

          // 7. Free the result pointer itself, which was allocated by the C code.
          wasm_free(resultPtr);

          return resultString;

      } finally {
          // 8. Clean up all allocated memory to prevent memory leaks in the WASM heap.
          if (xmlPtr) wasm_free(xmlPtr);
          if (xsltPtr) wasm_free(xsltPtr);
          paramStringPtrs.forEach(ptr => wasm_free(ptr));
          if (paramsPtr) wasm_free(paramsPtr);
          if (errorMsgPtrPtr) wasm_free(errorMsgPtrPtr);
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

      transformToText(source) {
        if (!this.#stylesheetText) {
            throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        const sourceXml = (new XMLSerializer()).serializeToString(source);
        return transformXmlWithXslt(sourceXml, this.#stylesheetText, this.#parameters);
      }

      transformToDocument(source) {
        const output = this.transformToText(source);
        // TODO: output MimeType should be detected from xsl:output method.
        return (new DOMParser()).parseFromString(output, 'text/html');
      }

      transformToFragment(source, document) {
        const doc = this.transformToDocument(source);
        const fragment = document.createDocumentFragment();
        fragment.appendChild(doc.documentElement);
        return fragment;
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

    window.XSLTProcessor = XSLTProcessor;
    window.xsltPolyfillReady = xsltPolyfillReady;

    // Finally, initialize the WASM module.
    let WasmModule = null;
    let wasm_transform = null;
    let wasm_free = null;

    createXSLTTransformModule()
    .then(Module => {
        WasmModule = Module;
        // Get a direct reference to the exported C functions.
        wasm_transform = Module._transform;
        wasm_free = Module._free;

        // Tell people we're ready.
        polyfillReadyPromiseResolve();
    }).catch(err => {
        console.error("Error loading XSLT WASM module:", err);
        polyfillReadyPromiseReject(err);
    });
  } // if (polyfillWillLoad)

  // Utility functions that get exported even if native XSLT is supported:

  function replaceDoc(newContent) {
    // This is a destructive action, replacing the current page.
    if (newContent instanceof DocumentFragment) {
      const head = newContent.querySelector('head');
      const headNodes = head?.childNodes ?? [];
      document.head.replaceChildren(...headNodes);
      const body = newContent.querySelector('body');
      const bodyNodes = body?.childNodes ?? newContent;
      document.body.replaceChildren(...bodyNodes);
      // The html element could have attributes - copy them.
      const html = newContent.querySelector('html');
      if (html) {
        for (const attr of html.attributes) {
          document.documentElement.setAttribute(attr.name, attr.value);
        }
      }
    } else {
      document.documentElement.innerHTML = newContent;
    }
  }

  async function loadXmlWithXsltFromContent(xmlText, xmlUrl) {
    xmlUrl = absoluteUrl(xmlUrl);
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
        const hrefMatch = data.match(/href\s*=\s*(["'])(.*?)\1/)?.[2];
        const typeMatch = data.match(/type\s*=\s*(["'])(.*?)\1/)?.[2]?.toLowerCase();
        if (hrefMatch && (typeMatch === 'text/xsl' || typeMatch === 'application/xslt+xml')) {
          xsltPath = hrefMatch.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
          break;
        }
      }
    }

    if (!xsltPath) {
      return replaceDoc(`No XSLT processing instruction found in ${xmlUrl}`);
    }

    // Fetch the XSLT file, resolving its path relative to the XML file's URL.
    const xsltUrl = new URL(xsltPath, xmlUrl);
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
  function absoluteUrl(url) {
    return new URL(url, window.location.href).href;
  }
  async function loadXmlWithXsltFromUrl(url) {
    // Fetch the XML file from provided url.
    url = absoluteUrl(url);
    const xmlResponse = await fetch(url);
    if (!xmlResponse.ok) {
      return replaceDoc(`Failed to fetch XML file: ${xmlResponse.statusText}`);
    }
    const xmlText = await xmlResponse.text();
    return loadXmlWithXsltFromContent(xmlText, url);
  }

  function loadXmlUrlWithXsltWhenReady(url) {
    if (polyfillWillLoad) {
      return xsltPolyfillReady().then(() => loadXmlWithXsltFromUrl(url));
    } else {
      return loadXmlWithXsltFromUrl(url);
    }
  }
  function loadXmlContentWithXsltWhenReady(xmlContent, xmlUrl) {
    if (polyfillWillLoad) {
      return xsltPolyfillReady().then(() => loadXmlWithXsltFromContent(xmlContent, xmlUrl));
    } else {
      return loadXmlWithXsltFromContent(xmlContent, xmlUrl);
    }
  }

  window.loadXmlWithXsltFromUrl = loadXmlWithXsltFromUrl;
  window.loadXmlWithXsltFromContent = loadXmlWithXsltFromContent;
  window.loadXmlUrlWithXsltWhenReady = loadXmlUrlWithXsltWhenReady;
  window.loadXmlContentWithXsltWhenReady = loadXmlContentWithXsltWhenReady;
  if (!window.xsltPolyfillQuiet) {
    console.log(`XSLT polyfill ${!polyfillWillLoad ? "NOT " : ""}installed (native supported: ${nativeSupported}).`);
  }
})();
