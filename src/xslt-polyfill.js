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
  window.xsltUsePolyfillAlways = ('xsltUsePolyfillAlways' in window) ? window.xsltUsePolyfillAlways : true;
  const nativeSupported = 'XSLTProcessor' in window;
  if (nativeSupported && !window.xsltUsePolyfillAlways) {
    polyfillReadyPromiseReject('Native feature supported');
    return;
  }

  const promiseName = 'xsltPolyfillReady';

  // Initialize the WASM module, first thing.
  let wasm_transform = null;
  let wasm_free = null;
  createXSLTTransformModule().then(Module => {
      // Wrap the C function 'transform' for easy calling from JavaScript.
      // 'cwrap' handles the conversion of JS strings to C strings (char*)
      // and the return type.
      wasm_transform = Module.cwrap(
        'transform', // C function name
        'string',    // Return type
        ['string', 'string'] // Argument types
      );

      // Get a reference to the C 'free' function to release memory.
      wasm_free = Module._free;
      // Tell people we're ready.
      polyfillReadyPromiseResolve();
      console.log('XSLT WASM Module Loaded');
  });

  function transformXmlWithXslt(xmlContent, xsltContent) {
    if (!wasm_transform) {
      throw new Error(`Polyfill XSLT WASM module not yet loaded. Please wait for the ${promiseName} promise to resolve.`);
    }
    const resultString = wasm_transform(xmlContent, xsltContent);
    if (!resultString) {
      throw new Error("Transformation failed. Check browser console for errors.");
    }
    // The C code used malloc (via libxml2's allocator) to create the result
    // string. We are not freeing the memory here because cwrap with a
    // 'string' return type automatically copies the string out of the WASM
    // heap into a JS string and frees the WASM memory for us.
    return resultString;
  }

  class XSLTProcessor {
    #stylesheetText;

    constructor() {
      this.#stylesheetText = null;
    }
    isPolyfill() {
      return true;
    }

    importStylesheet(stylesheet) {
      this.#stylesheetText = (new XMLSerializer()).serializeToString(stylesheet);
    }

    transformToFragment(source, document) {
      const sourceXml = (new XMLSerializer()).serializeToString(source);
      const output = transformXmlWithXslt(sourceXml, this.#stylesheetText);
      // Eventually need to grab the output type, instead of assuming html:
      const doc = (new DOMParser()).parseFromString(output, 'text/html');
      const fragment = document.createDocumentFragment();
      fragment.appendChild(doc.documentElement);
      return fragment;
    }
    transformToDocument(source) {
      throw Error('Not implemented');
    }
    setParameter(namespaceURI, localName, value) {
      throw Error('Not implemented');
    }
    getParameter(namespaceURI, localName) {
      throw Error('Not implemented');
    }
    removeParameter(namespaceURI, localName) {
      throw Error('Not implemented');
    }
    clearParameters() {
      throw Error('Not implemented');
    }
    reset() {
      throw Error('Not implemented');
    }
  }

  function replaceDoc(text) {
    // This is a destructive action, replacing the current page.
    document.open();
    document.write(text);
    document.close();
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
      resultHtml = transformXmlWithXslt(xmlText, xsltText);
    } catch (e) {
      return replaceDoc(`Error processing XML/XSLT: ${e}`);
    }
    // Replace the document with the result
    replaceDoc(resultHtml);
  }
  function xsltPolyfillReady() {
    return polyfillReadyPromise;
  }

  // Initialize
  function init() {
    window.XSLTProcessor = XSLTProcessor;
    window.loadXmlWithXslt = loadXmlWithXslt;
    window.xsltPolyfillReady = xsltPolyfillReady;
    console.log(`XSLT polyfill installed (native supported: ${nativeSupported}).`);
  }
  init();
})();
