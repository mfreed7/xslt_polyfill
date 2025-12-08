<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                              xmlns:exsl="http://exslt.org/common">
  <xsl:output method="html"/>

  <xsl:variable name="colorvar">
    <entry key="green">color: green</entry>
  </xsl:variable>
  <xsl:variable name="colors" select="exsl:node-set($colorvar)"/>

  <xsl:template match="/">
    <xsl:apply-templates select="/page/message"/>
  </xsl:template>
  <xsl:template match="/page/message">
    <body>
    Should be green:
      <div>
        <xsl:attribute name="style">
          <xsl:value-of select="$colors/entry[@key='green']"/>
        </xsl:attribute>
      <xsl:value-of select="."/>
    </div>
    </body>
  </xsl:template>
</xsl:stylesheet>