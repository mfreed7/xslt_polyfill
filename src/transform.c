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
    }).catch(function() {
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
    printf("About to load URL %s...\n",url);
    const char* content = fetch_and_load_document(url);
    printf("Finished loading URL %s. Content is %llu.\n",url,(uint64_t)content);
    
    if (content == NULL) {
        return NULL;
    }

    xmlDocPtr doc = xmlParseDoc((const xmlChar*)content);
    printf("Finished PARSING URL %s. docptr is %llu.\n",url,(uint64_t)doc);
    free((void*)content); // The content was allocated by stringToNewUTF8.

    return doc;
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
 * @return A pointer to a new string containing the transformed document, or NULL on error.
 */
EMSCRIPTEN_KEEPALIVE
char* transform(const char* xml_content, const char* xslt_content, const char** params) {
    xmlDocPtr xml_doc = NULL;
    xmlDocPtr xslt_doc = NULL;
    xsltStylesheetPtr xslt_sheet = NULL;
    xmlDocPtr result_doc = NULL;
    xsltTransformContextPtr ctxt = NULL;
    xsltSecurityPrefsPtr sec_prefs = NULL;
    char* result_string = NULL;

    // Initialize the XML library. This is important for thread safety.
    xmlInitParser();

    // Set our custom document loader.
    xsltSetLoaderFunc(docLoader);

    printf("Starting XSLT Transformation...\n");

    // Parse the input strings into libxml2 documents.
    xml_doc = xmlParseDoc((const xmlChar*)xml_content);
    if (xml_doc == NULL) {
        printf("XSLT Transformation Error: Failed to parse XML document.\n");
        goto cleanup;
    }

    xslt_doc = xmlParseDoc((const xmlChar*)xslt_content);
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
        printf("XSLT Transformation Error: Failed to apply stylesheet to XML document.\n");
        goto cleanup;
    }

    printf("Got here...\n");


    // 6. Serialize the result document to a string.
    xmlChar* result_buffer = NULL;
    int result_len = 0;
    xsltSaveResultToString(&result_buffer, &result_len, result_doc, xslt_sheet);

    printf("Got here, after saving to string...\n");

    if (result_buffer == NULL) {
        printf("XSLT Transformation Error: Failed to serialize result document to string.\n");
        goto cleanup;
    }

    printf("Got here, afterafter, %llu...\n",(uint64_t)result_buffer);

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
    printf("RETURNING: %llu\n",(uint64_t)result_string);

    return result_string;
}
