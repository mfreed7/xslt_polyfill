async function forceLoadXsltPolyfill(pathToPolyfill) {
  const nativeSupported = 'XSLTProcessor' in window;
  window.xsltUsePolyfillAlways = true;
  const script = document.createElement('script');
  script.src = pathToPolyfill;
  const loaded = new Promise(resolve => script.addEventListener('load', resolve));
  document.head.appendChild(script);
  await loaded;
}
