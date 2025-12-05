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
  window.xsltDontAutoloadXmlDocs = ('xsltDontAutoloadXmlDocs' in window) ? window.xsltDontAutoloadXmlDocs : false;
  let nativeSupported = ('XSLTProcessor' in window) && window.XSLTProcessor.toString().includes('native code');
  if (nativeSupported) {
    try {
      new XSLTProcessor();
    } catch {
      nativeSupported = false;
    }
  }
  const polyfillWillLoad = !nativeSupported || window.xsltUsePolyfillAlways;
  if (polyfillWillLoad) {
    // The polyfill
    const promiseName = 'xsltPolyfillReady';

    async function loadDoc(fn, cache) {
      const res = await fetch(fn, {cache: cache});
      if (!res.ok) {
        return null;
      }
      const xmltext = await res.text();
      return (new DOMParser()).parseFromString(xmltext, 'text/xml');
    }

    function isDuplicateParam(nodeToImport, xsltsheet, xslns) {
      if (nodeToImport.nodeName !== 'xsl:param') {
        return false;
      }
      const name = nodeToImport.getAttribute('name');
      const params = xsltsheet.documentElement.getElementsByTagNameNS(xslns, 'param');
      for (const param of params) {
        if (param.parentElement === xsltsheet.documentElement && param.getAttribute('name') === name) {
          return true;
        }
      }
      return false;
    }

    // Recursively fetches and inlines <xsl:import> statements within an XSLT document.
    // This function is destructive and will modify the provided `xsltsheet` document.
    // The `xsltsheet` parameter is the XSLT document to process, and `relurl` is the
    // base URL for resolving relative import paths.
    // Returns the modified XSLT document with all imports inlined.
    async function compileImports(xsltsheet, relurl) {
      const xslns = 'http://www.w3.org/1999/XSL/Transform';
      const imports = Array.from(xsltsheet.getElementsByTagNameNS(xslns, 'import'));
      if (!imports.length) {
        return xsltsheet;
      }
      if (!relurl) {
        relurl = window.location.href;
      }
      for (const importElement of imports) {
        const href = (new URL(importElement.getAttribute('href'), relurl)).href;
        const importedDoc = await loadDoc(href, 'default');
        if (!importedDoc || !importedDoc.documentElement) {
            continue;
        }
        while (importedDoc.documentElement.firstChild) {
          const nodeToImport = importedDoc.documentElement.firstChild;
          if (isDuplicateParam(nodeToImport, xsltsheet, xslns)) {
            nodeToImport.remove();
            continue;
          }
          if (nodeToImport.nodeName === 'xsl:import') {
            const newhref = (new URL(nodeToImport.getAttribute('href'), href)).href;
            const nestedImportedDoc = await loadDoc(newhref, 'default');
            if (!nestedImportedDoc) {
                nodeToImport.remove();
                continue;
            }
            const embed = await compileImports(nestedImportedDoc, newhref);
            while (embed.documentElement.firstChild) {
              importElement.before(embed.documentElement.firstChild);
            }
            nodeToImport.remove();
            continue;
          }

          importElement.before(nodeToImport);
        }
        importElement.remove();
      }
      return xsltsheet;
    }

    /**
     * Manages memory to call the WASM transform function using standard Web APIs
     * instead of relying on non-standard Emscripten runtime methods.
     * @param {string} xmlContent
     * @param {string} xsltContent
     * @param {Map<string, string>} parameters
     * @returns {string} The transformed string result.
     */
    async function transformXmlWithXslt(xmlContent, xsltContent, parameters) {
      if (!wasm_transform || !WasmModule) {
        throw new Error(`Polyfill XSLT WASM module not yet loaded. Please wait for the ${promiseName} promise to resolve.`);
      }

      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();

      let xmlPtr = 0;
      let xsltPtr = 0;
      let paramsPtr = 0;
      const paramStringPtrs = [];

      // Helper to write byte arrays to WASM memory manually.
      const writeBytesToHeap = (bytes) => {
          const ptr = WasmModule._malloc(bytes.length + 1);
          if (!ptr) throw new Error(`WASM malloc failed for bytes of length ${bytes.length}`);
          const heapu8 = new Uint8Array(WasmModule.wasmMemory.buffer);
          heapu8.set(bytes, ptr);
          heapu8[ptr + bytes.length] = 0; // Null terminator
          return ptr;
      };

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
          const xmlBytes = (xmlContent instanceof Uint8Array) ? xmlContent : textEncoder.encode(xmlContent);
          const xsltBytes = (xsltContent instanceof Uint8Array) ? xsltContent : textEncoder.encode(xsltContent);
          xmlPtr = writeBytesToHeap(xmlBytes);
          xsltPtr = writeBytesToHeap(xsltBytes);

          // 4. Call the C function with pointers to the data in WASM memory.
          const resultPtr = await wasm_transform(xmlPtr, xmlBytes.byteLength, xsltPtr, xsltBytes.byteLength, paramsPtr);

          if (!resultPtr) {
              throw new Error(`XSLT Transformation failed. See console for details.`);
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
      #stylesheet = null;
      #parameters = new Map();
      #compiledStylesheetPromise = null;
      #compiledStylesheetText = null;

      constructor() {}
      isPolyfill() {
        return true;
      }

      importStylesheet(stylesheet) {
        this.#stylesheet = stylesheet;
        this.#compiledStylesheetText = null;
        this.#compiledStylesheetPromise = this.#compileStylesheet();
      }

      async #compileStylesheet() {
        if (!this.#stylesheet) {
          throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        const baseUrl = this.#stylesheet.baseURI || window.location.href;
        // We need to clone the node because compileImports is destructive.
        const stylesheetClone = this.#stylesheet.cloneNode(true);
        const compiledStylesheet = await compileImports(stylesheetClone, baseUrl);
        this.#compiledStylesheetText = (new XMLSerializer()).serializeToString(compiledStylesheet);
      }

      async transformToText(source) {
        if (!this.#stylesheet) {
            throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        // #compiledStylesheetPromise is used to prevent a race condition where
        // multiple concurrent calls to transformToText would cause the stylesheet
        // to be compiled multiple times.
        await this.#compiledStylesheetPromise;

        const sourceXml = (new XMLSerializer()).serializeToString(source);
        return await transformXmlWithXslt(sourceXml, this.#compiledStylesheetText, this.#parameters);
      }

      async transformToDocument(source) {
        const output = await this.transformToText(source);
        // TODO: output MimeType should be detected from xsl:output method.
        return (new DOMParser()).parseFromString(output, 'text/html');
      }

      async transformToFragment(source, document) {
        const doc = await this.transformToDocument(source);
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
        this.#stylesheet = null;
        this.#compiledStylesheetPromise = null;
        this.#compiledStylesheetText = null;
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
        // Use cwrap to create a JS function that returns a Promise.
        wasm_transform = Module.cwrap('transform', 'number', ['number', 'number', 'number', 'number', 'number'], { async: true });
        wasm_free = Module._free;

        // Tell people we're ready.
        polyfillReadyPromiseResolve();
    }).catch(err => {
        console.error("Error loading XSLT WASM module:", err);
        polyfillReadyPromiseReject(err);
    });

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
      const xmlBytes = new Uint8Array(await xmlResponse.arrayBuffer());
      return loadXmlWithXsltFromBytes(xmlBytes, url);
    }
  
    function loadXmlUrlWithXsltWhenReady(url) {
      return xsltPolyfillReady().then(() => loadXmlWithXsltFromUrl(url));
    }
  
    async function loadXmlWithXsltFromBytes(xmlBytes, xmlUrl) {
      xmlUrl = absoluteUrl(xmlUrl);
      // Look inside XML file for a processing instruction with an XSLT file.
      // We decode only a small chunk at the beginning for safety and performance.
      const decoder = new TextDecoder();
      const xmlTextChunk = decoder.decode(xmlBytes.subarray(0, 2048));
  
      let xsltPath = null;
      const piMatch = xmlTextChunk.match(/<\?xml-stylesheet\s+([^>]*?)\?>/);
      if (piMatch) {
        const piData = piMatch[1];
        const hrefMatch = piData.match(/href\s*=\s*(["'])(.*?)\1/)?.[2];
        const typeMatch = piData.match(/type\s*=\s*(["'])(.*?)\1/)?.[2]?.toLowerCase();
        if (hrefMatch && (typeMatch === 'text/xsl' || typeMatch === 'application/xslt+xml')) {
          // Decode HTML entities from the path.
          xsltPath = hrefMatch.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
        }
      }
  
      if (!xsltPath) {
        // Do not display an error, just leave the original content.
        console.warn(`XSLT Polyfill: No XSLT processing instruction found in ${xmlUrl}`);
        return;
      }
  
      // Fetch the XSLT file, resolving its path relative to the XML file's URL.
      const xsltUrl = new URL(xsltPath, xmlUrl);
      const xsltDoc = await loadDoc(xsltUrl.href, 'default');
      if (!xsltDoc) {
        return replaceDoc(`Failed to fetch XSLT file: ${xsltUrl.href}`);
      }

      // We need to clone the node because compileImports is destructive.
      const xsltDocClone = xsltDoc.cloneNode(true);
      const compiledXsltDoc = await compileImports(xsltDocClone, xsltUrl.href);
      const compiledXsltText = new XMLSerializer().serializeToString(compiledXsltDoc);

      // Process XML/XSLT and replace the document.
      let resultHtml;
      try {
        resultHtml = await transformXmlWithXslt(xmlBytes, compiledXsltText, null);
      } catch (e) {
        return replaceDoc(`Error processing XML/XSLT: ${e}`);
      }
      
          // Replace the document with the result
          const parser = new DOMParser();
          const doc = parser.parseFromString(resultHtml, 'text/html');
          const fragment = document.createDocumentFragment();
          if (doc.documentElement) {
            fragment.appendChild(doc.documentElement);
          }
          replaceDoc(fragment);    }
    
    function loadXmlContentWithXsltFromBytesWhenReady(xmlBytes, xmlUrl) {
      return xsltPolyfillReady().then(() => loadXmlWithXsltFromBytes(xmlBytes, xmlUrl));
    }

    window.loadXmlWithXsltFromUrl = loadXmlWithXsltFromUrl;
    window.loadXmlUrlWithXsltWhenReady = loadXmlUrlWithXsltWhenReady;
    window.loadXmlContentWithXsltFromBytesWhenReady = loadXmlContentWithXsltFromBytesWhenReady;
  } // if (polyfillWillLoad)

  // Utility functions that get exported even if native XSLT is supported:

  function replaceDoc(newContent) {
    // This is a destructive action, replacing the current page.
    if (document instanceof XMLDocument) {
      const htmlRoot = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "html"
      );
      htmlRoot.append(newContent);
      document.documentElement.replaceWith(htmlRoot);
    } else if (newContent instanceof DocumentFragment) {
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

  function replaceCurrentXMLDoc() {
    const xml = new XMLSerializer().serializeToString(document);
    const xmlBytes = new TextEncoder().encode(xml);
    loadXmlContentWithXsltFromBytesWhenReady(xmlBytes, window.location.href).catch(
      (err) => {
        replaceDoc(`Error displaying XML file: ${err.message || err.toString()}`);
      }
    );
  }

  if (!nativeSupported && document instanceof XMLDocument && !xsltDontAutoloadXmlDocs) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        replaceCurrentXMLDoc();
      });
    } else {
      replaceCurrentXMLDoc();
    }
  }

  if (!window.xsltPolyfillQuiet) {
    console.log(`XSLT polyfill ${!polyfillWillLoad ? "NOT " : ""}installed (native supported: ${nativeSupported}).`);
  }
})();
