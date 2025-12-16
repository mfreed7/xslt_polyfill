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

    function transformXmlWithXslt(xmlContent, xsltContent, parameters, xsltUrl, allowAsync, buildPlainText) {
      if (!wasm_transform || !WasmModule) {
        throw new Error(`Polyfill XSLT Wasm module not yet loaded. Please wait for the ${promiseName} promise to resolve.`);
      }

      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();

      let xmlPtr = 0;
      let xsltPtr = 0;
      let paramsPtr = 0;
      let xsltUrlPtr = 0;
      let mimeTypePtr = 0;
      const paramStringPtrs = [];

      // Helper to write byte arrays to Wasm memory manually.
      const writeBytesToHeap = (bytes) => {
          const ptr = WasmModule._malloc(bytes.length + 1);
          if (!ptr) throw new Error(`Wasm malloc failed for bytes of length ${bytes.length}`);
          const heapu8 = new Uint8Array(WasmModule.wasmMemory.buffer);
          heapu8.set(bytes, ptr);
          heapu8[ptr + bytes.length] = 0; // Null terminator
          return ptr;
      };

      // Helper to write JS strings to Wasm memory manually.
      const writeStringToHeap = (str) => {
          if (str === null || str === undefined || typeof str !== 'string') {
            throw new Error(`Cannot write non-string value to Wasm heap: ${str}`);
          }
          const encodedStr = textEncoder.encode(str);
          const ptr = WasmModule._malloc(encodedStr.length + 1);
          if (!ptr) throw new Error(`Wasm malloc failed for string: ${str.substring(0, 50)}...`);
          const heapu8 = new Uint8Array(WasmModule.wasmMemory.buffer);
          heapu8.set(encodedStr, ptr);
          heapu8[ptr + encodedStr.length] = 0; // Null terminator
          return ptr;
      };

      // Helper to read a null-terminated UTF-8 string from Wasm memory.
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

          // 2. Allocate memory for parameter strings and the pointer array in the Wasm heap.
          if (paramsArray.length > 0) {
              // Allocate memory for the array of pointers (char**), plus a NULL terminator.
              const ptrSize = 4; // Pointers are 32-bit in wasm32
              paramsPtr = WasmModule._malloc((paramsArray.length + 1) * ptrSize);
              if (!paramsPtr) throw new Error("Wasm malloc failed for params pointer array.");

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
          xsltUrlPtr = writeStringToHeap(xsltUrl);
          
          // Allocate memory for the output mime type (minimum 32 bytes).
          mimeTypePtr = WasmModule._malloc(32);
          if (!mimeTypePtr) throw new Error("Wasm malloc failed for mimeType pointer.");
          new Uint8Array(WasmModule.wasmMemory.buffer, mimeTypePtr, 32).fill(0);


          // 4. Call the C function with pointers to the data in Wasm memory.
          const resultPtr_or_Promise = wasm_transform(xmlPtr, xmlBytes.byteLength, xsltPtr, xsltBytes.byteLength, paramsPtr, xsltUrlPtr, mimeTypePtr);
          if (!resultPtr_or_Promise) {
              throw new Error(`XSLT Transformation failed. See console for details.`);
          }

          const finishProcessing = (resultPtr) => {
            // 5. Convert the result pointers (char*) back to JS strings.
            let resultString = readStringFromHeap(resultPtr);
            let mimeTypeString = readStringFromHeap(mimeTypePtr);

            // 6. Free the result pointer itself, which was allocated by the C code.
            wasm_free(resultPtr);

            // 7. Handle the plain text case, if needed.
            if (buildPlainText && mimeTypeString === 'text/plain') {
              resultString = resultString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              resultString = `<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title></title></head>\n<body>\n<pre>${resultString}</pre>\n</body>\n</html>`;
              mimeTypeString = 'application/xml';
            }

            return {
                content: resultString,
                mimeType: mimeTypeString
            };
          };

          if (resultPtr_or_Promise instanceof Promise) {
            if (!allowAsync) {
              resultPtr_or_Promise.then((resultPtr) => {
                finishProcessing(resultPtr);
                showError('This XSLT transformation contains includes. These aren\'t supported for synchronous XSLTProcessor methods.');
              });
              return { content: '', mimeType: 'application/xml' };
            }
            // Return a Promise that resolves to the finished object
            return resultPtr_or_Promise.then(resultPtr => finishProcessing(resultPtr));
          }
          // Not a promise - just return the finished object.
          return finishProcessing(resultPtr_or_Promise);
      } finally {
          // 7. Clean up all allocated memory to prevent memory leaks in the Wasm heap.
          if (xmlPtr) wasm_free(xmlPtr);
          if (xsltPtr) wasm_free(xsltPtr);
          if (xsltUrlPtr) wasm_free(xsltUrlPtr);
          if (mimeTypePtr) wasm_free(mimeTypePtr);
          paramStringPtrs.forEach(ptr => wasm_free(ptr));
          if (paramsPtr) wasm_free(paramsPtr);
      }
    }


    class XSLTProcessor {
      #stylesheetText = null;
      #parameters = new Map();
      #stylesheetBaseUrl = null;

      constructor() {}
      isPolyfill() {
        return true;
      }

      importStylesheet(stylesheet) {
        this.#stylesheetText = (new XMLSerializer()).serializeToString(stylesheet);
        this.#stylesheetBaseUrl = stylesheet.baseURI || window.location.href;
      }

      // Returns a new document (XML or HTML).
      transformToDocument(source) {
        if (!this.#stylesheetText) {
            throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        const sourceXml = (new XMLSerializer()).serializeToString(source);
        const {content, mimeType} = transformXmlWithXslt(sourceXml, this.#stylesheetText, this.#parameters, this.#stylesheetBaseUrl, /*allowAsync*/false, /*buildPlainText*/true);
        return (new DOMParser()).parseFromString(content, mimeType);
      }

      // Returns a fragment. In the case of HTML, head/body are flattened.
      // For text output, no <pre> is generated.
      transformToFragment(source, document) {
        if (!this.#stylesheetText) {
            throw new Error("XSLTProcessor: Stylesheet not imported.");
        }
        const sourceXml = (new XMLSerializer()).serializeToString(source);
        const {content, mimeType} = transformXmlWithXslt(sourceXml, this.#stylesheetText, this.#parameters, this.#stylesheetBaseUrl, /*allowAsync*/false, /*buildPlainText*/false);
        const fragment = document.createDocumentFragment();
        if (mimeType === 'text/plain') {
          fragment.append(content);
          return fragment;
        }
        const doc = (new DOMParser()).parseFromString(content, mimeType);
        // The transformToFragment method flattens head/body into a flat list.
        // Note this comment: https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/editing/serializers/serialization.cc;l=776;drc=7666bc1983c2a5b98e5dc6fa6c28f8f53c07d06f
        const html = doc.firstElementChild instanceof HTMLHtmlElement ? doc.firstElementChild : undefined;
        const head = html?.firstElementChild;
        const body = head?.nextElementSibling;
        if (head) {
          fragment.append(...head.childNodes);
          head.remove();
        }
        if (body) {
          fragment.append(...body.childNodes);
          body.remove();
        }
        html?.remove();
        fragment.append(...doc.childNodes);
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
        this.#stylesheetBaseUrl = null;
        this.clearParameters();
      }
    }

    function xsltPolyfillReady() {
      return polyfillReadyPromise;
    }

    window.XSLTProcessor = XSLTProcessor;
    window.xsltPolyfillReady = xsltPolyfillReady;

    // Finally, initialize the Wasm module.
    let WasmModule = null;
    let wasm_transform = null;
    let wasm_free = null;

    createXSLTTransformModule()
    .then(Module => {
        WasmModule = Module;
        wasm_transform = Module.cwrap('transform', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'], { async: false });
        wasm_free = Module._free;

        // Tell people we're ready.
        polyfillReadyPromiseResolve();
    }).catch(err => {
        console.error("Error loading XSLT Wasm module:", err);
        polyfillReadyPromiseReject(err);
    });

    function absoluteUrl(url) {
      return new URL(url, window.location.href).href;
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
        return showError(`Failed to fetch XSLT file: ${xsltUrl.href}`);
      }

      // We need to clone the node because compileImports is destructive.
      const xsltDocClone = xsltDoc.cloneNode(true);
      const compiledXsltDoc = await compileImports(xsltDocClone, xsltUrl.href);
      const compiledXsltText = new XMLSerializer().serializeToString(compiledXsltDoc);

      // Process XML/XSLT and replace the document.
      try {
        const {content, mimeType} = await transformXmlWithXslt(xmlBytes, compiledXsltText, null, xsltUrl.href, /*allowAsync*/true, /*buildPlainText*/true);
        // Replace the document with the result
        replaceDoc(content, mimeType);
      } catch (e) {
        return showError(`Error processing XML/XSLT: ${e}`);
      }      
    }

    // Replace the current document with the provided HTML.
    function replaceDoc(newHTML, mimeType) {
      if (typeof newHTML !== 'string' ) {
        return showError('newHTML should be a string');
      }
      if (document instanceof XMLDocument) {
        const htmlRoot = document.createElementNS("http://www.w3.org/1999/xhtml","html");
        document.documentElement.replaceWith(htmlRoot);
        unsafeReplaceDocumentWithHtml(htmlRoot, newHTML, mimeType);
      } else if (document instanceof HTMLDocument) {
        unsafeReplaceDocumentWithHtml(document.documentElement, newHTML, mimeType);
      } else {
        return showError('Unknown document type');
      }
    }

    function unsafeReplaceDocumentWithHtml(targetElement, htmlString, mimeType) {
      if (mimeType === 'text/plain') {
        const escaped = htmlString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        htmlString = `<pre>${escaped}</pre>`;
        mimeType = 'text/html';
      }
      // First parse the document and move content to a fragment.
      const parsedDoc = (new DOMParser()).parseFromString(htmlString, mimeType || 'text/html');
      const fragment = document.createDocumentFragment();
      fragment.append(...parsedDoc.documentElement.childNodes);
      // Scripts need to be re-created, so they will execute:
      const scripts = fragment.querySelectorAll('script');
      const textArea = document.createElementNS('http://www.w3.org/1999/xhtml','textarea');
      scripts.forEach((oldScript) => {
        const newScript = document.createElementNS('http://www.w3.org/1999/xhtml','script');
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        // Use a textarea to decode HTML entities.
        textArea.innerHTML = oldScript.textContent;
        newScript.textContent = textArea.value;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
      // The html element could have attributes - copy them.
      if (targetElement instanceof HTMLHtmlElement) {
        for (const attr of parsedDoc.documentElement.attributes) {
          targetElement.setAttribute(attr.name, attr.value);
        }
      }
      targetElement.replaceChildren(fragment);
      // Since all of the scripts above will run after the document load, we
      // fire a synthetic one, to make sure `addEventListener('load')` works.
      window.dispatchEvent(new CustomEvent('load', {bubbles: false, cancelable: false}));
    }

    // If we're polyfilling, we need to patch `document.createElement()`, because
    // that will create XML elements in the (still) XML document.
    const _originalCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      if (document instanceof XMLDocument) {
        const el = document.createElementNS('http://www.w3.org/1999/xhtml', tagName.toLowerCase());
        if (options && options.is) {
          el.setAttribute('is', options.is);
        }
        return el;
      }
      return _originalCreateElement.apply(document, arguments);
    };

    function parseAndReplaceCurrentXMLDoc(doc) {
      const xml = new XMLSerializer().serializeToString(doc);
      const xmlBytes = new TextEncoder().encode(xml);
      xsltPolyfillReady()
        .then(() => loadXmlWithXsltFromBytes(xmlBytes, doc.defaultView.location.href))
        .catch((err) => {
          showError(`Error displaying XML file: ${err.message || err.toString()}`);
        });
    }

    window.parseAndReplaceCurrentXMLDoc = parseAndReplaceCurrentXMLDoc;
    window.loadXmlWithXsltFromBytes = loadXmlWithXsltFromBytes;

  } // if (polyfillWillLoad)

  // Replace the current document with the provided error message.
  function showError(errorMessage) {
    document.documentElement.innerHTML = errorMessage;
    throw new Error(errorMessage);
  }

  if (!nativeSupported && document instanceof XMLDocument && !xsltDontAutoloadXmlDocs) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        parseAndReplaceCurrentXMLDoc(document);
      });
    } else {
      parseAndReplaceCurrentXMLDoc(document);
    }
  }

  if (!window.xsltPolyfillQuiet) {
    console.log(`XSLT polyfill ${!polyfillWillLoad ? "NOT " : ""}installed (native supported: ${nativeSupported}).`);
  }
})();
