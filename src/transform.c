#include <stdio.h>
#include <string.h>

// Emscripten header for exporting functions
#include <emscripten.h>

// Libxml2 and Libxslt headers
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxslt/xslt.h>
#include <libxslt/xsltutils.h>
#include <libxslt/transform.h>
#include <libxml/catalog.h>

/**
 * @brief Transforms an XML string using an XSLT string.
 *
 * This function is exposed to JavaScript. It takes two strings, parses them
 * as XML and XSLT documents, performs the transformation, and returns the
 * result as a string.
 *
 * IMPORTANT: The returned string is allocated in the WASM module's memory
 * and must be freed from the JavaScript side by calling `_free()`.
 *
 * @param xml_content A string containing the source XML document.
 * @param xslt_content A string containing the XSLT stylesheet.
 * @return A pointer to a new string containing the transformed document, or NULL on error.
 */
EMSCRIPTEN_KEEPALIVE
char* transform(const char* xml_content, const char* xslt_content) {
    // Initialize the XML library. This is important for thread safety.
    xmlInitParser();

    // Parse the input strings into libxml2 documents
    xmlDocPtr xml_doc = xmlParseDoc((const xmlChar*)xml_content);
    if (xml_doc == NULL) {
        fprintf(stderr, "Error: could not parse XML document.\n");
        return NULL;
    }

    xsltStylesheetPtr xslt_sheet = xsltParseStylesheetDoc(xmlParseDoc((const xmlChar*)xslt_content));
    if (xslt_sheet == NULL) {
        fprintf(stderr, "Error: could not parse XSLT stylesheet.\n");
        xmlFreeDoc(xml_doc);
        return NULL;
    }

    // Apply the transformation
    // We should really use all of the bits used right here:
    // https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/xml/xslt_processor_libxslt.cc;l=338;drc=936810fb4d0e0b979b156d5325a52e5b6c40b088
    xmlDocPtr result_doc = xsltApplyStylesheet(xslt_sheet, xml_doc, NULL);
    if (result_doc == NULL) {
        fprintf(stderr, "Error: could not apply stylesheet.\n");
        xmlFreeDoc(xml_doc);
        xsltFreeStylesheet(xslt_sheet);
        return NULL;
    }

    // Serialize the result document to a string
    xmlChar* result_string = NULL;
    int result_len = 0;
    xsltSaveResultToString(&result_string, &result_len, result_doc, xslt_sheet);

    // Clean up all the allocated resources
    xmlFreeDoc(result_doc);
    xmlFreeDoc(xml_doc);
    xsltFreeStylesheet(xslt_sheet);

    // Clean up the parser variables.
    xsltCleanupGlobals();
    xmlCleanupParser();

    if (result_string == NULL) {
        fprintf(stderr, "Error: could not save result to string.\n");
        return NULL;
    }

    // The result_string was allocated by libxml2's internal malloc. We return it
    // directly. The JavaScript side will get a pointer to this memory in the WASM heap.
    return (char*)result_string;
}

