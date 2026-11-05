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

(function () {
  // Named elements shadow properties: `<img name="body">` on an HTML document,
  // or `<input name="getAttribute">` in a `<form>` (which also shadows
  // built-in members). So that content from the page or from a transform's
  // output can't break the polyfill, DOM members are looked up on the interface
  // prototypes once, and `callOn()`/`getOn()`/`setOn()` use those instead of
  // property access wherever the receiver can hold such content.
  //
  // Members are looked up from the prototype for the node's `nodeType` (e.g.
  // `Element.prototype` for elements), so members of more specific interfaces
  // aren't found: `getOn(el, 'style')` throws, since `style` is on
  // `HTMLElement.prototype`. For those, use plain property access when the
  // receiver can't be a `<form>` (e.g. an element the polyfill created), or
  // capture the member separately, like `templateContentOf()`.
  const bindCall = (fn) => Function.prototype.call.bind(fn);
  const nodeTypeOf = bindCall(Object.getOwnPropertyDescriptor(Node.prototype, 'nodeType').get);
  const interfacePrototypes = {
    1: Element.prototype,
    3: CharacterData.prototype,
    4: CharacterData.prototype,
    7: CharacterData.prototype,
    8: CharacterData.prototype,
    9: Document.prototype,
    10: DocumentType.prototype,
    11: DocumentFragment.prototype,
  };
  const memberCache = new Map();
  function findMember(node, name) {
    const type = nodeTypeOf(node);
    const key = `${type}:${name}`;
    let descriptor = memberCache.get(key);
    if (!descriptor) {
      for (let proto = interfacePrototypes[type]; proto && !descriptor; proto = Object.getPrototypeOf(proto)) {
        descriptor = Object.getOwnPropertyDescriptor(proto, name);
      }
      if (!descriptor) {
        throw new Error(`XSLT polyfill: no ${name} on node type ${type}`);
      }
      memberCache.set(key, descriptor);
    }
    return descriptor;
  }
  const callOn = (node, name, ...args) => Reflect.apply(findMember(node, name).value, node, args);
  const getOn = (node, name) => Reflect.apply(findMember(node, name).get, node, []);
  const setOn = (node, name, value) => Reflect.apply(findMember(node, name).set, node, [value]);
  const templateContentOf = bindCall(Object.getOwnPropertyDescriptor(HTMLTemplateElement.prototype, 'content').get);
  const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

  // True if `window[name]` is set by the page. Named elements (`<img name>`,
  // `<iframe name>`, `<div id>`, etc.) also make `name in window` true, but they
  // come from the named properties object on `window`'s prototype chain, while
  // the page's globals are own properties of `window`.
  function hasWindowOption(name) {
    return Object.hasOwn(window, name);
  }

  // Feature detection
  if (hasWindowOption('xsltPolyfillInstalled') && window.xsltPolyfillInstalled) {
    return;
  }
  // Code that wraps the polyfill in a function (e.g. a browser extension) can
  // declare an `xsltPolyfillOptions` object in the enclosing scope, instead of
  // setting the `window.*` flags below. Then, if the polyfill isn't needed, it
  // returns without touching the page. If there's no such declaration, a
  // named element can still resolve as `xsltPolyfillOptions` through `window`,
  // so ignore it unless it's the page's own global.
  const embedderOptions =
    typeof xsltPolyfillOptions === 'object' &&
    xsltPolyfillOptions !== null &&
    (xsltPolyfillOptions !== window.xsltPolyfillOptions || hasWindowOption('xsltPolyfillOptions'))
      ? xsltPolyfillOptions
      : null;
  if (embedderOptions?.xsltUsePolyfillOnlyIfNeeded && isNativeXsltSupported()) {
    return;
  }
  const options = embedderOptions || window;
  function hasOption(name) {
    return embedderOptions ? name in embedderOptions : hasWindowOption(name);
  }
  window.xsltPolyfillInstalled = true;
  const xsltPolyfillVersion = '1.0.34';
  window.xsltPolyfillVersion = xsltPolyfillVersion;
  let polyfillReadyPromiseResolve;
  let polyfillReadyPromiseReject;
  const polyfillReadyPromise = new Promise((resolve, reject) => {
    polyfillReadyPromiseResolve = resolve;
    polyfillReadyPromiseReject = reject;
  });
  // By default, the polyfill installs itself even if the browser has working
  // native XSLT support. Set this flag to true to only install the polyfill
  // when native support is missing.
  const defaultOnlyIfNeeded =
    // Backwards compat: `xsltUsePolyfillAlways = false` used to mean "use
    // native XSLT if it's available".
    hasOption('xsltUsePolyfillAlways') && options.xsltUsePolyfillAlways === false;
  options.xsltUsePolyfillOnlyIfNeeded =
    hasOption('xsltUsePolyfillOnlyIfNeeded') ? options.xsltUsePolyfillOnlyIfNeeded : defaultOnlyIfNeeded;
  options.xsltDontAutoloadXmlDocs = hasOption('xsltDontAutoloadXmlDocs') ? options.xsltDontAutoloadXmlDocs : false;
  let xsltPolyfillHideRequestId = 0;
  let currentSpinnerText = null;

  if (hasWindowOption('xsltPolyfillSpinner')) {
    currentSpinnerText = window.xsltPolyfillSpinner;
    delete window.xsltPolyfillSpinner;
  }

  function setPolyfillSpinner(text) {
    currentSpinnerText = text;
    if (!getOn(document, 'body')) {
      if (text) {
        xsltPolyfillHideRequestId = requestAnimationFrame(() => setPolyfillSpinner(text));
      } else {
        cancelAnimationFrame(xsltPolyfillHideRequestId);
      }
      return;
    }

    cancelAnimationFrame(xsltPolyfillHideRequestId);

    let overlay = callOn(document, 'getElementById', 'xslt-polyfill-spinner');
    if (text) {
      if (!overlay) {
        const xmlns = 'http://www.w3.org/1999/xhtml';
        overlay = callOn(document, 'createElementNS', xmlns, 'div');
        overlay.id = 'xslt-polyfill-spinner';

        const span = callOn(document, 'createElementNS', xmlns, 'span');
        span.textContent = text;
        overlay.appendChild(span);

        const style = callOn(document, 'createElementNS', xmlns, 'style');
        style.textContent = `
          #xslt-polyfill-spinner {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 16px;
            border-radius: 15px;
            z-index: 1;
            font-family: sans-serif;
            visibility: visible;
          }
          #xslt-polyfill-spinner::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            background: #3b82f6;
            z-index: -1;
            animation: ripple 1.5s infinite ease-out;
          }
          @keyframes ripple {
            to {
              transform: scale(1.15, 1.4);
              opacity: 0;
            }
          }`;
        overlay.appendChild(style);
        callOn(getOn(document, 'body'), 'appendChild', overlay);
      } else {
        const span = callOn(overlay, 'querySelector', 'span');
        if (span) setOn(span, 'textContent', text);
      }
      overlay.style.display = 'block';
      getOn(document, 'body').style.visibility = 'hidden';
    } else {
      if (overlay) {
        callOn(overlay, 'remove');
      }
      if (getOn(document, 'body')) {
        getOn(document, 'body').style.removeProperty('visibility');
      }
    }
  }

  Object.defineProperty(window, 'xsltPolyfillSpinner', {
    get() {
      return currentSpinnerText;
    },
    set(val) {
      setPolyfillSpinner(val);
    },
    configurable: true,
  });

  if (currentSpinnerText) {
    setPolyfillSpinner(currentSpinnerText);
  }

  // Whether the current document is an XML document (including XHTML). Don't
  // use `document instanceof XMLDocument`: in Gecko, application/xhtml+xml
  // documents are HTMLDocuments.
  const type = getOn(document, 'contentType');
  const isXml = type === "text/xml" || type === "application/xml" || type.endsWith("+xml");

  function isNativeXsltSupported() {
    let nativeSupported = hasWindowOption('XSLTProcessor') && window.XSLTProcessor.toString().includes('native code');
    if (nativeSupported) {
      try {
        new XSLTProcessor();
      } catch {
        nativeSupported = false;
      }
    }
    return nativeSupported;
  }
  let nativeSupported = isNativeXsltSupported();
  const polyfillWillLoad = !nativeSupported || !options.xsltUsePolyfillOnlyIfNeeded;
  if (polyfillWillLoad) {
    // The polyfill
    const promiseName = 'xsltPolyfillReady';

    // Initialize the Wasm module as early as possible.
    let WasmModule = null;
    let wasm_transform = null;
    let wasm_transform_async = null;
    let wasm_free = null;

    createXSLTTransformModule()
      .then((Module) => {
        WasmModule = Module;
        const args = ['transform', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']];
        wasm_transform = Module.cwrap(...args, { async: false });
        wasm_transform_async = Module.cwrap(...args, { async: true });
        wasm_free = Module._free;

        // Tell people we're ready.
        polyfillReadyPromiseResolve();
      })
      .catch((err) => {
        console.error('Error loading XSLT Wasm module:', err);
        polyfillReadyPromiseReject(err);
      });

    function isSameOriginAllowedUrl(url) {
      try {
        const resolved = new URL(url, window.location.href);
        if (resolved.protocol === 'data:') {
          return false;
        }
        if (window.location.origin === 'null') {
          return window.location.protocol === 'file:' && resolved.protocol === 'file:';
        }
        return resolved.origin === window.location.origin;
      } catch {
        return false;
      }
    }

    async function loadDoc(fn, cache) {
      if (!isSameOriginAllowedUrl(fn)) {
        return null;
      }
      let res;
      try {
        res = await fetch(fn, { mode: 'same-origin', cache: cache });
      } catch {
        return null;
      }
      if (!res.ok || (res.url && !isSameOriginAllowedUrl(res.url))) {
        return null;
      }
      const xmltext = await res.text();
      const doc = new DOMParser().parseFromString(xmltext, 'text/xml');
      if (doc.querySelector('parsererror') || doc.documentElement?.localName === 'parsererror') {
        return null;
      }
      return doc;
    }

    function isDuplicateParam(nodeToImport, existingParamNames, existingVariableNames) {
      if (nodeToImport.localName !== 'param' || nodeToImport.namespaceURI !== 'http://www.w3.org/1999/XSL/Transform') {
        return false;
      }
      const name = nodeToImport.getAttribute('name');
      return existingParamNames.has(name) || (existingVariableNames && existingVariableNames.has(name));
    }

    function isDuplicateVariable(nodeToImport, existingParamNames, existingVariableNames) {
      if (nodeToImport.localName !== 'variable' || nodeToImport.namespaceURI !== 'http://www.w3.org/1999/XSL/Transform') {
        return false;
      }
      const name = nodeToImport.getAttribute('name');
      return existingVariableNames.has(name) || (existingParamNames && existingParamNames.has(name));
    }

    function getTopLevelParamNames(xsltsheet, xslns) {
      const params = xsltsheet.documentElement.getElementsByTagNameNS(xslns, 'param');
      const names = new Set();
      for (const param of params) {
        if (param.parentElement === xsltsheet.documentElement) {
          names.add(param.getAttribute('name'));
        }
      }
      return names;
    }

    function getTopLevelVariableNames(xsltsheet, xslns) {
      const vars = xsltsheet.documentElement.getElementsByTagNameNS(xslns, 'variable');
      const names = new Set();
      for (const v of vars) {
        if (v.parentElement === xsltsheet.documentElement) {
          names.add(v.getAttribute('name'));
        }
      }
      return names;
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

      const existingParamNames = getTopLevelParamNames(xsltsheet, xslns);
      const existingVariableNames = getTopLevelVariableNames(xsltsheet, xslns);

      // Fetch all imports at this level in parallel.
      const importDocs = await Promise.all(
        imports.map(async (importElement) => {
          const href = new URL(importElement.getAttribute('href'), relurl).href;
          const importedDoc = await loadDoc(href, 'default');
          return { importElement, importedDoc, href };
        }),
      );

      for (const { importElement, importedDoc, href } of importDocs) {
        if (
          !importedDoc ||
          !importedDoc.documentElement ||
          importedDoc.querySelector('parsererror') ||
          importedDoc.documentElement.localName === 'parsererror'
        ) {
          importElement.remove();
          continue;
        }

        const importedDocRoot = importedDoc.documentElement;
        const xsltDocRoot = xsltsheet.documentElement;
        const attrs = importedDocRoot.getAttributeNames();
        for (const attr of attrs) {
          if (!xsltDocRoot.getAttribute(attr)) {
            xsltDocRoot.setAttribute(attr, importedDocRoot.getAttribute(attr));
          }
        }

        // Recursively compile imports within the imported document.
        await compileImports(importedDoc, href);

        // Move all children from the imported document to the main document.
        // Special case: skip duplicate parameters and variables if they were already merged.
        let child = importedDocRoot.firstChild;
        while (child) {
          const next = child.nextSibling;
          if (
            isDuplicateParam(child, existingParamNames, existingVariableNames) ||
            isDuplicateVariable(child, existingParamNames, existingVariableNames)
          ) {
            child.remove();
          } else {
            if (child.namespaceURI === xslns) {
              if (child.localName === 'param') {
                existingParamNames.add(child.getAttribute('name'));
              } else if (child.localName === 'variable') {
                existingVariableNames.add(child.getAttribute('name'));
              }
            }
            importElement.before(child);
          }
          child = next;
        }
        importElement.remove();
      }
      return xsltsheet;
    }

    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    function transformXmlWithXslt(xmlContent, xsltContent, parameters, xsltUrl, allowAsync, buildPlainText) {
      if (!wasm_transform || !WasmModule) {
        throw new Error(
          `Polyfill XSLT Wasm module not yet loaded. Please wait for the ${promiseName} promise to resolve.`,
        );
      }

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

      const cleanup = () => {
        // Clean up all allocated memory to prevent memory leaks in the Wasm heap.
        if (xmlPtr) wasm_free(xmlPtr);
        if (xsltPtr) wasm_free(xsltPtr);
        if (xsltUrlPtr) wasm_free(xsltUrlPtr);
        if (mimeTypePtr) wasm_free(mimeTypePtr);
        paramStringPtrs.forEach((ptr) => wasm_free(ptr));
        if (paramsPtr) wasm_free(paramsPtr);
      };

      try {
        // 1. Prepare parameters from the Map into a flat array.
        // Values are passed as raw strings; xsltQuoteUserParams on the C side
        // handles quoting so that any character is treated as a literal string.
        const paramsArray = [];
        if (parameters) {
          for (const [key, value] of parameters.entries()) {
            paramsArray.push(key);
            paramsArray.push(String(value));
          }
        }

        // 2. Allocate memory for parameter strings and the pointer array in the Wasm heap.
        if (paramsArray.length > 0) {
          // Allocate memory for the array of pointers (char**), plus a NULL terminator.
          const ptrSize = 4; // Pointers are 32-bit in wasm32
          paramsPtr = WasmModule._malloc((paramsArray.length + 1) * ptrSize);
          if (!paramsPtr) throw new Error('Wasm malloc failed for params pointer array.');

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
        const xmlBytes = xmlContent instanceof Uint8Array ? xmlContent : textEncoder.encode(xmlContent);
        const xsltBytes = xsltContent instanceof Uint8Array ? xsltContent : textEncoder.encode(xsltContent);
        xmlPtr = writeBytesToHeap(xmlBytes);
        xsltPtr = writeBytesToHeap(xsltBytes);
        xsltUrlPtr = writeStringToHeap(xsltUrl);

        // Allocate memory for the output mime type (minimum 32 bytes).
        mimeTypePtr = WasmModule._malloc(32);
        if (!mimeTypePtr) throw new Error('Wasm malloc failed for mimeType pointer.');
        new Uint8Array(WasmModule.wasmMemory.buffer, mimeTypePtr, 32).fill(0);

        // 4. Call the C function with pointers to the data in Wasm memory.
        const wasm_fn = allowAsync ? wasm_transform_async : wasm_transform;
        const resultPtr_or_Promise = wasm_fn(
          xmlPtr,
          xmlBytes.byteLength,
          xsltPtr,
          xsltBytes.byteLength,
          paramsPtr,
          xsltUrlPtr,
          mimeTypePtr,
        );

        if (!allowAsync && WasmModule.Asyncify && WasmModule.Asyncify.state === 1 /* Suspending */) {
          throw new Error(
            "This XSLT transformation contains includes or document() calls. These aren't supported for synchronous XSLTProcessor methods.",
          );
        }

        if (!resultPtr_or_Promise) {
          throw new Error(`XSLT Transformation failed. See console for details.`);
        }

        const finishProcessing = (resultPtr) => {
          if (!resultPtr) {
            throw new Error(`XSLT Transformation failed. See console for details.`);
          }
          // 5. Convert the result pointers (char*) back to JS strings.
          let resultString = readStringFromHeap(resultPtr);
          let mimeTypeString = readStringFromHeap(mimeTypePtr);

          // 6. Free the result pointer itself, which was allocated by the C code.
          wasm_free(resultPtr);

          // Workaround for libxslt appending an extra line feed to the result.
          // See https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/xml/xslt_processor_libxslt.cc;l=221;drc=d2f52c0dcbbdb54a08ce6ab50f470942240e15b2
          if (resultString.endsWith('\n')) {
            resultString = resultString.slice(0, -1);
          }

          // 7. Handle the plain text case, if needed.
          if (buildPlainText && mimeTypeString === 'text/plain') {
            resultString = resultString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            resultString = `<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title></title></head>\n<body>\n<pre>${resultString}</pre>\n</body>\n</html>`;
            mimeTypeString = 'application/xml';
          }

          return {
            content: resultString,
            mimeType: mimeTypeString,
          };
        };

        if (resultPtr_or_Promise instanceof Promise) {
          // Return a Promise that resolves to the finished object
          return resultPtr_or_Promise.then(
            (resultPtr) => {
              try {
                return finishProcessing(resultPtr);
              } finally {
                cleanup();
              }
            },
            (err) => {
              cleanup();
              throw err;
            },
          );
        }
        // Not a promise - just return the finished object.
        const res = finishProcessing(resultPtr_or_Promise);
        cleanup();
        return res;
      } catch (e) {
        cleanup();
        throw e;
      }
    }

    function isEmptySourceDocument(source) {
      return source && nodeTypeOf(source) === Node.DOCUMENT_NODE && !getOn(source, 'documentElement');
    }

    // Event handlers ('on*' attributes) parsed into DOMParser inert documents
    // do not create event listeners. Remove and re-add them to activate them.
    function resetEventHandlers(root) {
      if (!root) return;
      const type = nodeTypeOf(root);
      const canQuery = type === Node.ELEMENT_NODE || type === Node.DOCUMENT_NODE || type === Node.DOCUMENT_FRAGMENT_NODE;
      const elements = canQuery ? Array.from(callOn(root, 'querySelectorAll', '*')) : [];
      if (type === Node.ELEMENT_NODE) {
        elements.push(root);
      }
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const attrs = callOn(el, 'getAttributeNames');
        for (let j = 0; j < attrs.length; j++) {
          const attr = attrs[j];
          if (attr.toLowerCase().startsWith('on')) {
            const val = callOn(el, 'getAttribute', attr);
            callOn(el, 'removeAttribute', attr);
            callOn(el, 'setAttribute', attr, val);
          }
        }
      }
    }

    function lowercaseHtmlAttributes(root) {
      if (!root) return;
      const elements = callOn(root, 'querySelectorAll', '*');
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (getOn(el, 'namespaceURI') === 'http://www.w3.org/1999/xhtml') {
          const attrs = callOn(el, 'getAttributeNames');
          for (let j = 0; j < attrs.length; j++) {
            const attr = attrs[j];
            const lowerAttr = attr.toLowerCase();
            if (attr !== lowerAttr) {
              const val = callOn(el, 'getAttribute', attr);
              callOn(el, 'removeAttribute', attr);
              callOn(el, 'setAttribute', lowerAttr, val);
            }
          }
        }
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
        this.#stylesheetText = new XMLSerializer().serializeToString(stylesheet);
        this.#stylesheetBaseUrl = getOn(stylesheet, 'baseURI') || window.location.href;
      }

      // Returns a new document (XML or HTML).
      transformToDocument(source) {
        if (!this.#stylesheetText) {
          throw new Error('XSLTProcessor: Stylesheet not imported.');
        }
        if (isEmptySourceDocument(source)) {
          return null;
        }
        const sourceXml = new XMLSerializer().serializeToString(source);
        const { content, mimeType } = transformXmlWithXslt(
          sourceXml,
          this.#stylesheetText,
          this.#parameters,
          this.#stylesheetBaseUrl,
          /*allowAsync*/ false,
          /*buildPlainText*/ true,
        );
        return new DOMParser().parseFromString(content, mimeType);
      }

      // Returns a fragment. In the case of HTML, head/body are flattened.
      // For text output, no <pre> is generated.
      transformToFragment(source, document) {
        if (!this.#stylesheetText) {
          throw new Error('XSLTProcessor: Stylesheet not imported.');
        }
        if (isEmptySourceDocument(source)) {
          return null;
        }
        const sourceXml = new XMLSerializer().serializeToString(source);
        const { content, mimeType } = transformXmlWithXslt(
          sourceXml,
          this.#stylesheetText,
          this.#parameters,
          this.#stylesheetBaseUrl,
          /*allowAsync*/ false,
          /*buildPlainText*/ false,
        );
        const fragment = callOn(document, 'createDocumentFragment');
        switch (mimeType) {
          case 'text/plain':
            fragment.append(content);
            return fragment;
          case 'application/xml': {
            // It's legal for XML content to contain multiple sibling root
            // elements in transformToFragment, so wrap the content in one.
            const fakeRoot = `rootelementforparsing`;
            const ns = !isXml ? ` xmlns="http://www.w3.org/1999/xhtml"` : '';
            const doc = new DOMParser().parseFromString(`<${fakeRoot}${ns}>${content}</${fakeRoot}>`, mimeType);
            const rootNode = callOn(doc, 'querySelector', fakeRoot);
            if (!isXml) {
              lowercaseHtmlAttributes(rootNode);
            }
            fragment.append(...getOn(rootNode, 'childNodes'));
            resetEventHandlers(fragment);
            return fragment;
          }
          case 'text/html': {
            // The transformToFragment method flattens head/body into a flat list.
            // Note this comment: https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/editing/serializers/serialization.cc;l=776;drc=7666bc1983c2a5b98e5dc6fa6c28f8f53c07d06f
            const doc = new DOMParser().parseFromString(content, mimeType);
            const firstElement = getOn(doc, 'firstElementChild');
            const html = firstElement instanceof HTMLHtmlElement ? firstElement : undefined;
            const head = html && getOn(html, 'firstElementChild');
            const body = head && getOn(head, 'nextElementSibling');
            if (head) {
              fragment.append(...getOn(head, 'childNodes'));
              callOn(head, 'remove');
            }
            if (body) {
              fragment.append(...getOn(body, 'childNodes'));
              callOn(body, 'remove');
            }
            if (html) {
              callOn(html, 'remove');
            }
            const htmlChildren = Array.from(getOn(doc, 'childNodes')).filter(
              (node) => nodeTypeOf(node) !== Node.DOCUMENT_TYPE_NODE,
            );
            fragment.append(...htmlChildren);
            resetEventHandlers(fragment);
            return fragment;
          }
          default:
            throw new Error(`Unknown mime type ${mimeType}`);
        }
      }

      setParameter(namespaceURI, localName, value) {
        // libxslt top-level parameters are not namespaced.
        this.#parameters.set(localName, value);
      }

      getParameter(namespaceURI, localName) {
        return this.#parameters.has(localName) ? this.#parameters.get(localName) : null;
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

    function absoluteUrl(url) {
      return new URL(url, window.location.href).href;
    }

    function findXsltPathInProlog(xmlDoc) {
      if (!xmlDoc) return null;
      for (const node of getOn(xmlDoc, 'childNodes')) {
        if (nodeTypeOf(node) === Node.ELEMENT_NODE) {
          break;
        }
        if (nodeTypeOf(node) === Node.PROCESSING_INSTRUCTION_NODE && node.target === 'xml-stylesheet') {
          const piData = node.data;
          const hrefMatch = piData.match(/href\s*=\s*(["'])(.*?)\1/)?.[2];
          const typeMatch = piData.match(/type\s*=\s*(["'])(.*?)\1/)?.[2]?.toLowerCase();
          if (hrefMatch && (typeMatch === 'text/xsl' || typeMatch === 'application/xslt+xml')) {
            // Decode HTML entities from the path.
            return hrefMatch
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&amp;/g, '&');
          }
        }
      }
      return null;
    }

    async function loadXmlWithXsltFromBytes(xmlBytes, xmlUrl) {
      xmlUrl = absoluteUrl(xmlUrl);
      // Look inside the XML prolog for a processing instruction with an XSLT file.
      // Decode only a small chunk at the beginning for performance, isolate the
      // prolog (before the root element), and parse it with DOMParser so only real
      // prolog ProcessingInstruction nodes (and not comments/CDATA/body PIs) match.
      const xmlTextChunk = textDecoder.decode(xmlBytes.subarray(0, 2048));
      let xsltPath = null;
      if (xmlTextChunk.includes('<?xml-stylesheet')) {
        const prologMatch = xmlTextChunk.match(
          /^(?:\uFEFF)?(?:\s+|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^\[>]*(\[[\s\S]*?\])?\s*>)+/i,
        );
        if (prologMatch) {
          const xmlDoc = new DOMParser().parseFromString(prologMatch[0] + '<r/>', 'application/xml');
          xsltPath = findXsltPathInProlog(xmlDoc);
        }
      }

      if (!xsltPath) {
        // Do not display an error, just leave the original content.
        console.warn(`XSLT Polyfill: No XSLT processing instruction found in ${xmlUrl}`);
        setPolyfillSpinner(null);
        return;
      }

      // Fetch the XSLT file, resolving its path relative to the XML file's URL.
      const xsltUrl = new URL(xsltPath, xmlUrl);
      const xsltDoc = await loadDoc(xsltUrl.href, 'default');
      if (!xsltDoc) {
        return showError(`Failed to fetch XSLT file: ${xsltUrl.href}`);
      }

      // Compile imports. This inlines them into the stylesheet document.
      const compiledXsltDoc = await compileImports(xsltDoc, xsltUrl.href);
      const compiledXsltText = new XMLSerializer().serializeToString(compiledXsltDoc);

      // Process XML/XSLT and replace the document.
      try {
        const { content, mimeType } = await transformXmlWithXslt(
          xmlBytes,
          compiledXsltText,
          null,
          xsltUrl.href,
          /*allowAsync*/ true,
          /*buildPlainText*/ true,
        );
        // Replace the document with the result
        replaceDoc(content, mimeType);
      } catch (e) {
        return showError(`Error processing XML/XSLT: ${e}`);
      }
    }

    // Replace the current document with the provided HTML.
    function replaceDoc(newHTML, mimeType) {
      setPolyfillSpinner(null);
      if (typeof newHTML !== 'string') {
        return showError('newHTML should be a string');
      }
      if (isXml) {
        const htmlRoot = callOn(document, 'createElementNS', 'http://www.w3.org/1999/xhtml', 'html');
        callOn(getOn(document, 'documentElement'), 'replaceWith', htmlRoot);
        unsafeReplaceDocumentWithHtml(htmlRoot, newHTML, mimeType);
      } else {
        unsafeReplaceDocumentWithHtml(getOn(document, 'documentElement'), newHTML, mimeType);
      }
    }

    function unsafeReplaceDocumentWithHtml(targetElement, htmlString, mimeType) {
      if (mimeType === 'text/plain') {
        const escaped = htmlString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        htmlString = `<pre>${escaped}</pre>`;
        mimeType = 'text/html';
      }
      // First parse the document and move content to a fragment.
      let root, parsedDoc;
      if (mimeType === 'application/xml' && !isXml) {
        const fakeRoot = `rootelementforparsing`;
        parsedDoc = new DOMParser().parseFromString(
          `<${fakeRoot} xmlns="http://www.w3.org/1999/xhtml">${htmlString}</${fakeRoot}>`,
          mimeType,
        );
        root = callOn(parsedDoc, 'querySelector', fakeRoot);
        lowercaseHtmlAttributes(root);
      } else {
        parsedDoc = new DOMParser().parseFromString(htmlString, mimeType || 'text/html');
        root = getOn(parsedDoc, 'documentElement');
      }
      const fragment = callOn(document, 'createDocumentFragment');
      if (root) {
        fragment.append(...getOn(root, 'childNodes'));
      }
      // Scripts need to be re-created, so they will execute:
      const scripts = Array.from(fragment.querySelectorAll('script'));
      const scriptMarkers = scripts.map((oldScript) => {
        const marker = callOn(document, 'createComment', ' script placeholder ');
        callOn(getOn(oldScript, 'parentNode'), 'replaceChild', marker, oldScript);
        return { oldScript, marker };
      });
      if (targetElement instanceof HTMLHtmlElement) {
        // Clear existing attributes to remove any artifacts left by the browser's native XML viewer.
        // For example, Chrome's XML viewer adds specific IDs or classes to the <html> element.
        while (getOn(targetElement, 'attributes').length > 0) {
          callOn(targetElement, 'removeAttribute', getOn(targetElement, 'attributes')[0].name);
        }
        for (const attr of getOn(getOn(parsedDoc, 'documentElement'), 'attributes')) {
          callOn(targetElement, 'setAttribute', attr.name, attr.value);
        }
      }
      callOn(targetElement, 'replaceChildren', fragment);
      resetEventHandlers(targetElement);
      if (isXml) {
        for (const form of callOn(targetElement, 'querySelectorAll', 'form[name]')) {
          const name = callOn(form, 'getAttribute', 'name');
          if (name && !(name in document)) {
            Object.defineProperty(document, name, {
              configurable: true,
              get: () => form,
            });
          }
        }
      }
      if (targetElement instanceof HTMLHtmlElement) {
        // The browser's native XML viewer injects a hidden User Agent stylesheet that applies
        // rules like `white-space: nowrap` and monospace fonts. Since we are reusing the same
        // Document, these rules persist and break the layout of the newly rendered HTML.
        // We inject a reset stylesheet at the very top of the <head> to override these UA styles,
        // allowing the author's own CSS to take precedence naturally.
        const resetStyles = callOn(document, 'createElementNS', 'http://www.w3.org/1999/xhtml', 'style');
        let supportsWhere = false;
        try {
          supportsWhere = CSS.supports('selector(:where(table:not([width])))');
        } catch {}
        if (supportsWhere) {
          resetStyles.textContent = `
            :where(html, body) {
              white-space: normal;
              font-family: initial;
              font-size: initial;
            }
            :where(body) {
              margin: 8px;
            }
            :where(table) {
              min-width: auto;
              white-space: normal;
              font-size: initial;
              font-family: initial;
              tab-size: initial;
            }
            :where(table:not([width])) {
              width: auto;
            }
            :where(table:not([cellspacing])) {
              border-spacing: 2px;
            }
            :where(table:not([align])) {
              margin: initial;
            }
            :where(td) {
              vertical-align: initial;
            }
            :where(tbody, thead, tfoot, tr, th) {
              white-space: normal;
            }
            :where(li) {
              list-style-position: inside;
            }
            :where(ul, ol, menu) :where(li) {
              list-style-position: unset;
            }`;
        } else {
          resetStyles.textContent = `
            html, body {
              white-space: normal;
              font-family: initial;
              font-size: initial;
            }
            body {
              margin: 8px;
            }
            table {
              width: auto;
              min-width: auto;
              border-spacing: 2px;
              white-space: normal;
              margin: initial;
              font-size: initial;
              font-family: initial;
              tab-size: initial;
            }
            td {
              vertical-align: initial;
            }
            tbody, thead, tfoot, tr, th {
              white-space: normal;
            }
            li {
              list-style-position: inside;
            }
            ul li, ol li, menu li {
              list-style-position: unset;
            }`;
        }
        const head = callOn(targetElement, 'querySelector', 'head');
        callOn(head || targetElement, 'prepend', resetStyles);
      }
      (async () => {
        for (const { oldScript, marker } of scriptMarkers) {
          let resolvePromise;
          const promise = new Promise((r) => {
            resolvePromise = r;
          });
          const newScript = callOn(document, 'createElementNS', 'http://www.w3.org/1999/xhtml', 'script');
          Array.from(getOn(oldScript, 'attributes')).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
          });
          const isAsyncOrDefer = newScript.hasAttribute('async') || newScript.hasAttribute('defer');
          const isBlocking = newScript.hasAttribute('src') && !isAsyncOrDefer;
          if (isBlocking) {
            newScript.addEventListener('load', resolvePromise, { once: true });
            newScript.addEventListener('error', resolvePromise, { once: true });
          }
          newScript.textContent = getOn(oldScript, 'textContent');
          callOn(getOn(marker, 'parentNode'), 'replaceChild', newScript, marker);
          if (isBlocking) {
            await promise;
          }
        }
        callOn(document, 'dispatchEvent', new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
        window.dispatchEvent(new Event('load', { bubbles: false, cancelable: false }));
      })();
    }

    // If we're polyfilling, we need to patch `Document.prototype.createElement()`,
    // because that will create XML elements in the (still) XML document.
    //
    // NOTE: this patch (and the ones below) must apply *only* to the document
    // being polyfilled, not to other XML documents (e.g. from
    // `document.implementation.createDocument()`), which must
    // keep case-sensitive, null-namespace XML behavior.
    const _polyfilledDocument = isXml ? document : null;
    const _originalCreateElement = Document.prototype.createElement;
    const _originalCreateElementNS = Document.prototype.createElementNS;

    function patchedCreateElement(tagName, options) {
      if (this === _polyfilledDocument) {
        const el = _originalCreateElementNS.call(this, 'http://www.w3.org/1999/xhtml', String(tagName).toLowerCase(), options);
        if (options && options.is) {
          el.setAttribute('is', options.is);
        }
        return el;
      }
      return _originalCreateElement.apply(this, arguments);
    }

    Document.prototype.createElement = patchedCreateElement;
    document.createElement = patchedCreateElement;

    if (isXml) {
      const originalTagName = Object.getOwnPropertyDescriptor(Element.prototype, 'tagName').get;
      Object.defineProperty(Element.prototype, 'tagName', {
        get() {
          const val = originalTagName.call(this);
          if (getOn(this, 'namespaceURI') === 'http://www.w3.org/1999/xhtml' && val) {
            return val.toUpperCase();
          }
          return val;
        },
      });
      const originalNodeName = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeName').get;
      Object.defineProperty(Node.prototype, 'nodeName', {
        get() {
          const val = originalNodeName.call(this);
          if (nodeTypeOf(this) === 1 && getOn(this, 'namespaceURI') === 'http://www.w3.org/1999/xhtml' && val) {
            return val.toUpperCase();
          }
          return val;
        },
      });
      // Monkeypatch innerHTML, outerHTML, and insertAdjacentHTML for HTML elements in XML documents
      let _htmlDoc = null;
      function getHtmlContext(localName, namespaceURI) {
        if (!_htmlDoc) _htmlDoc = getOn(document, 'implementation').createHTMLDocument('');
        const ns = namespaceURI || 'http://www.w3.org/1999/xhtml';
        try {
          return _htmlDoc.createElementNS(ns, localName || 'div');
        } catch {
          return _htmlDoc.createElement('div');
        }
      }

      // Sets `html` on `ctxElement` with the browser's own parser, and returns the
      // resulting nodes (a template's contents, for a template).
      function parseHtmlInContext(ctxElement, html) {
        Reflect.apply(originalInnerHTML.set, ctxElement, [html]);
        const holder = ctxElement instanceof HTMLTemplateElement ? templateContentOf(ctxElement) : ctxElement;
        return [...getOn(holder, 'childNodes')];
      }

      // Copies the template contents of `orig` into `clone`, if both are HTML
      // templates and the contents weren't cloned.
      function cloneTemplateContent(orig, clone) {
        if (!(orig instanceof HTMLTemplateElement && clone instanceof HTMLTemplateElement)) return;
        const cloneContent = templateContentOf(clone);
        if (getOn(cloneContent, 'firstChild')) return;
        for (const c of getOn(templateContentOf(orig), 'childNodes')) {
          callOn(cloneContent, 'appendChild', cloneIntoHtmlDoc(c));
        }
      }

      function cloneIntoHtmlDoc(node) {
        const clone = _htmlDoc.importNode(node, true);
        if (nodeTypeOf(node) === Node.ELEMENT_NODE) {
          cloneTemplateContent(node, clone);
          const origTemplates = callOn(node, 'querySelectorAll', 'template');
          const cloneTemplates = callOn(clone, 'querySelectorAll', 'template');
          for (let i = 0; i < origTemplates.length; i++) {
            cloneTemplateContent(origTemplates[i], cloneTemplates[i]);
          }
        }
        return clone;
      }

      if (originalInnerHTML) {
        Object.defineProperty(Element.prototype, 'innerHTML', {
          get() {
            if (getOn(this, 'ownerDocument') === _polyfilledDocument) {
              if (!_htmlDoc) _htmlDoc = getOn(document, 'implementation').createHTMLDocument('');
              const localName = getOn(this, 'localName');
              const namespaceURI = getOn(this, 'namespaceURI');
              const isTemplate = localName === 'template' && namespaceURI === 'http://www.w3.org/1999/xhtml';
              // Keep the element's own namespace (even null), so that only HTML
              // raw text elements (script, style, ...) serialize text unescaped.
              let container;
              try {
                container = isTemplate ? getHtmlContext('div') : _htmlDoc.createElementNS(namespaceURI, localName);
              } catch {
                container = getHtmlContext('div');
              }
              const target = isTemplate && this instanceof HTMLTemplateElement ? templateContentOf(this) : this;
              for (const child of getOn(target, 'childNodes')) {
                callOn(container, 'appendChild', cloneIntoHtmlDoc(child));
              }
              return Reflect.apply(originalInnerHTML.get, container, []);
            }
            return originalInnerHTML.get.call(this);
          },
          set(value) {
            if (getOn(this, 'ownerDocument') === _polyfilledDocument) {
              const localName = getOn(this, 'localName');
              const namespaceURI = getOn(this, 'namespaceURI');
              const nodes = parseHtmlInContext(getHtmlContext(localName, namespaceURI), value);
              if (
                localName === 'template' &&
                namespaceURI === 'http://www.w3.org/1999/xhtml' &&
                this instanceof HTMLTemplateElement
              ) {
                templateContentOf(this).replaceChildren(...nodes);
                callOn(this, 'replaceChildren');
              } else {
                callOn(this, 'replaceChildren', ...nodes);
              }
            } else {
              originalInnerHTML.set.call(this, value);
            }
          },
        });
      }

      const originalOuterHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
      if (originalOuterHTML) {
        Object.defineProperty(Element.prototype, 'outerHTML', {
          get() {
            return originalOuterHTML.get.call(this);
          },
          set(value) {
            if (getOn(this, 'ownerDocument') === _polyfilledDocument) {
              const parent = getOn(this, 'parentNode');
              if (!parent || nodeTypeOf(parent) === Node.DOCUMENT_NODE) {
                throw new DOMException(
                  "Failed to set the 'outerHTML' property on 'Element': This element has no parent node.",
                  'NoModificationAllowedError',
                );
              }
              const parentIsElement = nodeTypeOf(parent) === Node.ELEMENT_NODE;
              const ctxLocalName = parentIsElement ? getOn(parent, 'localName') : 'div';
              const ctxNamespaceURI = parentIsElement ? getOn(parent, 'namespaceURI') : 'http://www.w3.org/1999/xhtml';
              const nodes = parseHtmlInContext(getHtmlContext(ctxLocalName, ctxNamespaceURI), value);
              callOn(this, 'replaceWith', ...nodes);
            } else {
              originalOuterHTML.set.call(this, value);
            }
          },
        });
      }

      const originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
      if (originalInsertAdjacentHTML) {
        Element.prototype.insertAdjacentHTML = function (position, text) {
          if (getOn(this, 'ownerDocument') === _polyfilledDocument) {
            position = position.toLowerCase();
            let ctxLocalName = 'div';
            let ctxNamespaceURI = 'http://www.w3.org/1999/xhtml';
            if (position === 'beforebegin' || position === 'afterend') {
              const parent = getOn(this, 'parentNode');
              if (!parent || nodeTypeOf(parent) === Node.DOCUMENT_NODE) {
                throw new DOMException(
                  "Failed to execute 'insertAdjacentHTML' on 'Element': The element has no parent.",
                  'NoModificationAllowedError',
                );
              }
              if (nodeTypeOf(parent) === Node.ELEMENT_NODE) {
                ctxLocalName = getOn(parent, 'localName');
                ctxNamespaceURI = getOn(parent, 'namespaceURI');
              }
            } else if (position === 'afterbegin' || position === 'beforeend') {
              ctxLocalName = getOn(this, 'localName');
              ctxNamespaceURI = getOn(this, 'namespaceURI');
            }
            const nodes = parseHtmlInContext(getHtmlContext(ctxLocalName, ctxNamespaceURI), text);
            if (position === 'beforebegin') {
              callOn(this, 'before', ...nodes);
            } else if (position === 'afterbegin') {
              callOn(this, 'prepend', ...nodes);
            } else if (position === 'beforeend') {
              callOn(this, 'append', ...nodes);
            } else if (position === 'afterend') {
              callOn(this, 'after', ...nodes);
            }
          } else {
            originalInsertAdjacentHTML.call(this, position, text);
          }
        };
      }
    }
    function parseAndReplaceCurrentXMLDoc(doc) {
      if (!findXsltPathInProlog(doc)) {
        setPolyfillSpinner(null);
        return;
      }
      const xml = new XMLSerializer().serializeToString(doc);
      const xmlBytes = new TextEncoder().encode(xml);
      xsltPolyfillReady()
        .then(() => loadXmlWithXsltFromBytes(xmlBytes, getOn(doc, 'defaultView').location.href))
        .catch((err) => {
          showError(`Error displaying XML file: ${err.message || err.toString()}`);
        });
    }

    async function loadXmlWithXsltFromUrl(url) {
      url = absoluteUrl(url);
      const xmlResponse = await fetch(url);
      if (!xmlResponse.ok) {
        return showError(`Failed to fetch XML file: ${xmlResponse.statusText}`);
      }
      const xmlBytes = new Uint8Array(await xmlResponse.arrayBuffer());
      return loadXmlWithXsltFromBytes(xmlBytes, url);
    }

    function loadXmlUrlWithXsltWhenReady(url) {
      return xsltPolyfillReady().then(() => loadXmlWithXsltFromUrl(url));
    }

    window.parseAndReplaceCurrentXMLDoc = parseAndReplaceCurrentXMLDoc;
    window.loadXmlWithXsltFromBytes = loadXmlWithXsltFromBytes;
    window.loadXmlWithXsltFromUrl = loadXmlWithXsltFromUrl;
    window.loadXmlUrlWithXsltWhenReady = loadXmlUrlWithXsltWhenReady;
    window.showError = showError;
  } // if (polyfillWillLoad)

  // Replace the current document with the provided error message.
  function showError(errorMessage) {
    setPolyfillSpinner(null);
    const root = getOn(document, 'documentElement');
    if (root) {
      setOn(root, 'textContent', errorMessage);
    }
    throw new Error(errorMessage);
  }

  if (polyfillWillLoad && isXml && !options.xsltDontAutoloadXmlDocs) {
    if (getOn(document, 'readyState') === 'loading') {
      callOn(
        document,
        'addEventListener',
        'DOMContentLoaded',
        () => {
          parseAndReplaceCurrentXMLDoc(document);
        },
        { once: true },
      );
    } else {
      parseAndReplaceCurrentXMLDoc(document);
    }
  }

  if (!(hasOption('xsltPolyfillQuiet') && options.xsltPolyfillQuiet)) {
    console.log(`XSLT polyfill v${xsltPolyfillVersion} ${!polyfillWillLoad ? 'NOT ' : ''}installed (native supported: ${nativeSupported}).`);
  }
})();
