#include <stdio.h>
#include <string.h>

// Emscripten header for exporting functions
#include <emscripten.h>

// Libxml2 and Libxslt headers
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/xmlstring.h>
#include <libxslt/xslt.h>
#include <libxslt/documents.h>
#include <libxslt/xsltutils.h>
#include <libxslt/transform.h>
#include <libxslt/security.h>
#include <libexslt/exslt.h>
#include <libxslt/imports.h>

// Forward declaration for our JS fetch function.
const char* fetch_and_load_document(const char* url);

// Use EM_JS to define a JavaScript function that can be called from C.
// This function will use the fetch API to get a document from a URL.
// It uses Asyncify to pause the C code and wait for the async JS to complete.
EM_JS(const char*, fetch_and_load_document, (const char* url), {
  return Asyncify.handleSleep(function(wakeUp) {
    fetch(UTF8ToString(url)).then(function(response) {
      if (!response.ok) {
        // Wake up the C code with a null pointer to indicate failure.
        wakeUp(null);
        return;
      }
      return response.text();
    }).then(function(text) {
      if (text === null) {
        wakeUp(null);
        return;
      }
      // Allocate memory in the WASM heap for the fetched text
      // and wake up the C code with a pointer to it.
      var buffer = stringToNewUTF8(text);
      wakeUp(buffer);
    }).catch(function(err) {
      console.error(
        "XSLT Polyfill: Failed to fetch an external document included via <xsl:import> or <xsl:include>.\n" +
        "URL: " + UTF8ToString(url) + "\n" +
        "This is often due to the browser's CORS (Cross-Origin Resource Sharing) policy. " +
        "This polyfill uses the standard `fetch()` API, which is more restrictive than a native browser's XSLT engine. " +
        "Please check the browser's network console for more details about the failed request."
      );
      wakeUp(null);
    });
  });
});

/**
 * @brief A callback function for libxslt to load external documents.
 *
 * This function is called by libxslt when it encounters an <xsl:import>
 * or <xsl:include> element. It uses the fetch_and_load_document JS function
 * to get the content from the URL and then parses it into an xmlDocPtr.
 *
 * @param URI The URI of the document to load.
 * @param dict A dictionary for interning strings (not used).
 * @param options Parser options.
 * @param ctxt The transformation context (not used).
 * @param type The type of load (document or stylesheet).
 * @return An xmlDocPtr for the loaded document, or NULL on failure.
 */
static xmlDocPtr docLoader(const xmlChar* URI, xmlDictPtr dict, int options,
                           void* ctxt, xsltLoadType type) {
    const char* url = (const char*)URI;
    printf("Loading external document from URL %s...\n",url);
    const char* content = fetch_and_load_document(url);
    
    if (content == NULL) {
        return NULL;
    }

    xmlDocPtr doc = xmlParseDoc((const xmlChar*)content);
    if (!doc) {
      printf("XSLT Transformation Error: Failed to parse included document.\n");
    }
    free((void*)content); // The content was allocated by stringToNewUTF8.

    return doc;
}

// Copy of this:
// https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/xml/xslt_processor_libxslt.cc;l=319;drc=936810fb4d0e0b979b156d5325a52e5b6c40b088
static const char* ResultMIMEType(xmlDocPtr result_doc, xsltStylesheetPtr sheet) {
  const xmlChar* result_type = NULL;
  XSLT_GET_IMPORT_PTR(result_type, sheet, method);
  if (!result_type && result_doc->type == XML_HTML_DOCUMENT_NODE)
    result_type = (const xmlChar*)"html";

  if (xmlStrEqual(result_type, (const xmlChar*)"html"))
    return "text/html";
  if (xmlStrEqual(result_type, (const xmlChar*)"text"))
    return "text/plain";

  return "application/xml";
}
  
// Adjust the HTML encoding meta tag to match Chrome's behavior.
// Libxslt's default behavior for HTML output is to insert <meta charset="UTF-8">.
// However, Chrome inserts <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
// This function checks if the output method is HTML, and if so, ensures that
// the HEAD element contains the http-equiv meta tag. If we insert it here,
// libxslt (via libxml2) will detect it and update it, rather than inserting
// a new <meta charset="..."> tag.
static void adjust_html_encoding_meta(xmlDocPtr doc, xsltStylesheetPtr style) {
    const xmlChar *method;
    XSLT_GET_IMPORT_PTR(method, style, method);

    if ((method == NULL) && (doc->type == XML_HTML_DOCUMENT_NODE))
        method = (const xmlChar *) "html";

    if (method == NULL || !xmlStrEqual(method, (const xmlChar *) "html")) {
        return;
    }

    // Find HEAD
    xmlNodePtr head = NULL;
    xmlNodePtr cur = doc->children;
    while(cur) {
        if (cur->type == XML_ELEMENT_NODE && xmlStrcasecmp(cur->name, (const xmlChar*)"html") == 0) {
            xmlNodePtr child = cur->children;
            while(child) {
                if (child->type == XML_ELEMENT_NODE && xmlStrcasecmp(child->name, (const xmlChar*)"head") == 0) {
                    head = child;
                    break;
                }
                child = child->next;
            }
            break;
        }
        cur = cur->next;
    }

    if (!head) return;

    // Check existing meta tags
    xmlNodePtr child = head->children;
    int has_encoding = 0;
    while(child) {
        if (child->type == XML_ELEMENT_NODE && xmlStrcasecmp(child->name, (const xmlChar*)"meta") == 0) {
            xmlChar* val = xmlGetProp(child, (const xmlChar*)"charset");
            if (val) {
                has_encoding = 1;
                xmlFree(val);
                break;
            }
            val = xmlGetProp(child, (const xmlChar*)"http-equiv");
            if (val) {
                if (xmlStrcasecmp(val, (const xmlChar*)"Content-Type") == 0) {
                    has_encoding = 1;
                }
                xmlFree(val);
                if (has_encoding) break;
            }
        }
        child = child->next;
    }

    if (!has_encoding) {
        const xmlChar *encoding;
        XSLT_GET_IMPORT_PTR(encoding, style, encoding);
        if (encoding == NULL) encoding = (const xmlChar*)"UTF-8";

        // Construct content string: text/html; charset=ENCODING
        xmlChar* contentValue = xmlStrdup((const xmlChar*)"text/html; charset=");
        contentValue = xmlStrcat(contentValue, encoding);

        xmlNodePtr meta = xmlNewDocNode(doc, NULL, (const xmlChar*)"meta", NULL);
        xmlNewProp(meta, (const xmlChar*)"http-equiv", (const xmlChar*)"Content-Type");
        xmlNewProp(meta, (const xmlChar*)"content", contentValue);
        xmlFree(contentValue);

        if (head->children) {
            xmlAddPrevSibling(head->children, meta);
        } else {
            xmlAddChild(head, meta);
        }
    }
}
  
/**
 * @brief Transforms an XML string using an XSLT string.
 *
 * This function is exposed to JavaScript. It takes XML and XSLT content as strings,
 * performs the transformation, and returns the result as a string. It also accepts
 * an array of strings for XSLT parameters.
 *
 * IMPORTANT: The returned string is allocated in the WASM module's memory
 * and must be freed from the JavaScript side by calling `_free()`.
 *
 * @param xml_content A string containing the source XML document.
 * @param xslt_content A string containing the XSLT stylesheet.
 * @param params An array of key-value pairs for XSLT parameters, terminated by NULL.
 * Example: ["param1", "'value1'", "param2", "'value2'", NULL]
 * @param out_mime_type A pointer to a buffer (at least 32 bytes) where the output MIME type will be written.
 * @return A pointer to a new string containing the transformed document, or NULL on error.
 */
EMSCRIPTEN_KEEPALIVE
char* transform(const char* xml_content, int xml_len, const char* xslt_content, int xslt_len, const char** params, const char* xslt_url, char* out_mime_type) {
    xmlDocPtr xml_doc = NULL;
    xmlDocPtr xslt_doc = NULL;
    xsltStylesheetPtr xslt_sheet = NULL;
    xmlDocPtr result_doc = NULL;
    xsltTransformContextPtr ctxt = NULL;
    xsltSecurityPrefsPtr sec_prefs = NULL;
    char* result_string = NULL;

    // Initialize the XML library. This is important for thread safety.
    xmlInitParser();

    // Enable EXSLT functions.
    exsltRegisterAll();

    // Set our custom document loader.
    xsltSetLoaderFunc(docLoader);

    // Parse the input strings into libxml2 documents using their known length.
    xml_doc = xmlParseMemory(xml_content, xml_len);
    if (xml_doc == NULL) {
        printf("XSLT Transformation Error: Failed to parse XML document.\n");
        goto cleanup;
    }

    xslt_doc = xmlReadMemory(xslt_content, xslt_len, xslt_url, "UTF-8", XSLT_PARSE_OPTIONS | XML_PARSE_HUGE);
    if (xslt_doc == NULL) {
        printf("XSLT Transformation Error: Failed to parse XSLT document.\n");
        goto cleanup;
    }

    xslt_sheet = xsltParseStylesheetDoc(xslt_doc);
    if (xslt_sheet == NULL) {
        // xsltParseStylesheetDoc frees xslt_doc on success, so we only free it on failure.
        xmlFreeDoc(xslt_doc);
        printf("XSLT Transformation Error: Failed to parse XSLT stylesheet from document.\n");
        goto cleanup;
    }
    // No need to free xslt_doc separately from here on, it's owned by xslt_sheet.

    // 1. Omit the XML declaration (e.g., <?xml version="1.0"?>) from the output.
    xslt_sheet->omitXmlDeclaration = 1;

    // 2. Double the number of max variables xslt uses internally.
    xsltMaxVars = 20000;

    // 3. Create a new transformation context.
    ctxt = xsltNewTransformContext(xslt_sheet, xml_doc);
    if (ctxt == NULL) {
        printf("XSLT Transformation Error: Failed to create XSLT transformation context.\n");
        goto cleanup;
    }

    // 4. Set up security preferences to disable file and network access.
    sec_prefs = xsltNewSecurityPrefs();
    if (sec_prefs == NULL) {
        printf("XSLT Transformation Error: Failed to create XSLT security preferences.\n");
        goto cleanup;
    }
    xsltSetSecurityPrefs(sec_prefs, XSLT_SECPREF_WRITE_FILE, xsltSecurityForbid);
    xsltSetSecurityPrefs(sec_prefs, XSLT_SECPREF_CREATE_DIRECTORY, xsltSecurityForbid);
    xsltSetSecurityPrefs(sec_prefs, XSLT_SECPREF_WRITE_NETWORK, xsltSecurityForbid);
    // We don't forbid reading files or from the network, because our custom loader
    // needs to be able to do that. The security is handled by the browser's
    // same-origin policy in fetch().

    if (xsltSetCtxtSecurityPrefs(sec_prefs, ctxt) != 0) {
        printf("XSLT Transformation Error: Failed to set security preferences on context.\n");
        goto cleanup;
    }

    // 5. Apply the transformation using the configured context and parameters.
    result_doc = xsltApplyStylesheetUser(xslt_sheet, xml_doc, (const char**)params, NULL, NULL, ctxt);
    if (result_doc == NULL) {
        printf("XSLT Transformation Error: Failed to apply stylesheet to XML document (see console logs).\n");
        goto cleanup;
    }

    // Determine the MIME type using the helper function
    const char* mime = ResultMIMEType(result_doc, xslt_sheet);
    strncpy(out_mime_type, mime, 32);
    out_mime_type[31] = '\0';

    // 6. Ensure the HTML meta tag for encoding is in the Chrome/Blink format.
    adjust_html_encoding_meta(result_doc, xslt_sheet);

    // 7. Serialize the result document to a string.
    xmlChar* result_buffer = NULL;
    int result_len = 0;
    int bytes_written = xsltSaveResultToString(&result_buffer, &result_len, result_doc, xslt_sheet);

    if (bytes_written == 0 && result_buffer == NULL) {
        // If the output is empty, xsltSaveResultToString might return success (0)
        // but not allocate a buffer. We need to return an empty string, not NULL.
        result_buffer = (xmlChar*) malloc(1);
        if (result_buffer) {
            result_buffer[0] = '\0';
        }
    }

    if (!result_buffer) {
        printf("XSLT Transformation Error: Failed to serialize result document to string.\n");
        goto cleanup;
    }

    // The result_buffer was allocated by libxml2. We will return it directly.
    result_string = (char*)result_buffer;

cleanup:
    // Clean up all the allocated resources in reverse order of creation.
    if (result_doc != xml_doc) xmlFreeDoc(result_doc); // Don't double-free if transform was identity
    if (sec_prefs) xsltFreeSecurityPrefs(sec_prefs);
    if (ctxt) xsltFreeTransformContext(ctxt);
    if (xslt_sheet) xsltFreeStylesheet(xslt_sheet);
    if (xml_doc) xmlFreeDoc(xml_doc);

    // Unset the loader function.
    xsltSetLoaderFunc(NULL);

    // Clean up the parser variables.
    xsltCleanupGlobals();
    xmlCleanupParser();

    // Return the allocated string (or NULL on failure).
    return result_string;
}
