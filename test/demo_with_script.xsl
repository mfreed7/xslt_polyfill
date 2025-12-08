<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:r="https://wunsch.dk/robots-txt">
  <xsl:output method="html"/>

  <xsl:template match="/">
    XSLT-replaced document. There should be an alert() that fires.
    <script xmlns="http://www.w3.org/1999/xhtml">
      alert('SUCCESS');
    </script>
  </xsl:template>
</xsl:stylesheet>
