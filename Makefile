BASE_DIR := $(CURDIR)
BUILD_DIR := $(BASE_DIR)/dist
XML2_INSTALL_DIR := $(BUILD_DIR)/libxml2-install
XSLT_INSTALL_DIR := $(BUILD_DIR)/libxslt-install

DEBUG ?= 0

ifeq ($(DEBUG), 1)
	BUILD_MODE := debug
	OUT_FILE := $(BUILD_DIR)/xslt-wasm-debug.js
	EMCC_OPT_LEVEL := -O0
	EMCC_ASSERTIONS := -s ASSERTIONS=2
	EMCC_SAFE_HEAP := -s SAFE_HEAP=1
	EMCC_ASYNCIFY_DEBUG := -s ASYNCIFY_DEBUG=1
	EMCC_DEBUG_FLAGS := -gsource-map
else
	BUILD_MODE := release
	OUT_FILE := $(BUILD_DIR)/xslt-wasm.js
	EMCC_OPT_LEVEL := -Os
	EMCC_ASSERTIONS := -s ASSERTIONS=0
	EMCC_SAFE_HEAP := -s SAFE_HEAP=0
	EMCC_ASYNCIFY_DEBUG :=
	EMCC_DEBUG_FLAGS :=
endif

export PKG_CONFIG_PATH := $(XML2_INSTALL_DIR)/lib/pkgconfig:$(XSLT_INSTALL_DIR)/lib/pkgconfig

.PHONY: all clean clean-libs

all: $(OUT_FILE)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(XML2_INSTALL_DIR)/lib/pkgconfig/libxml-2.0.pc: | $(BUILD_DIR)
	@echo "--- Configuring and building libxml2 ---"
	cd $(BASE_DIR)/src/libxml2 && NOCONFIGURE=1 ./autogen.sh
	cd $(BASE_DIR)/src/libxml2 && emconfigure ./configure \
		--host=wasm32-unknown-emscripten \
		--prefix=$(XML2_INSTALL_DIR) \
		--with-output --with-writer --with-html --with-reader --with-sax1 \
		--with-legacy=no --with-c14n=no --with-schemas=no --with-schematron=no \
		--without-debug --without-modules --without-push --without-regexps \
		--without-valid --without-xptr --without-xinclude --with-xpath \
		--without-threads --without-catalog --without-http --without-ftp \
		--without-python --without-zlib --without-lzma \
		--disable-shared --enable-static CC="emcc -Os -s ASYNCIFY" LDFLAGS="-Os -s ASYNCIFY"
	cd $(BASE_DIR)/src/libxml2 && emmake make
	cd $(BASE_DIR)/src/libxml2 && emmake make install

$(XSLT_INSTALL_DIR)/lib/pkgconfig/libxslt.pc: $(XML2_INSTALL_DIR)/lib/pkgconfig/libxml-2.0.pc
	@echo "--- Configuring and building libxslt ---"
	cd $(BASE_DIR)/src/libxslt && ./autogen.sh
	cd $(BASE_DIR)/src/libxslt && emconfigure ./configure \
		--host=wasm32-unknown-emscripten \
		--prefix=$(XSLT_INSTALL_DIR) \
		--with-libxml-prefix=$(XML2_INSTALL_DIR) \
		--without-python --without-debugger --without-profiler --without-plugins \
		--with-crypto=no --disable-shared --enable-static CC="emcc -Os -s ASYNCIFY" LDFLAGS="-Os -s ASYNCIFY"
	cd $(BASE_DIR)/src/libxslt && emmake make
	cd $(BASE_DIR)/src/libxslt && emmake make install

$(OUT_FILE): src/transform.c $(XSLT_INSTALL_DIR)/lib/pkgconfig/libxslt.pc
	@echo "--- Building in $(BUILD_MODE) mode ---"
			emcc $(EMCC_OPT_LEVEL) $(EMCC_DEBUG_FLAGS) \
		src/transform.c \
		-o $(OUT_FILE) \
		`pkg-config --cflags libxml-2.0 libxslt libexslt` \
		-s MODULARIZE \
		-s SINGLE_FILE \
		-s SINGLE_FILE_BINARY_ENCODE=1 \
		-s ALLOW_MEMORY_GROWTH \
		$(EMCC_SAFE_HEAP) \
		$(EMCC_ASSERTIONS) \
		-s INITIAL_MEMORY=8MB \
		-s STACK_SIZE=2MB \
		-s EXPORT_NAME=createXSLTTransformModule \
		-s EXPORTED_FUNCTIONS=_transform,_malloc,_free,Asyncify \
		-s EXPORTED_RUNTIME_METHODS=cwrap,UTF8ToString,wasmMemory,Asyncify,stringToNewUTF8 \
		-s WASM_ASYNC_COMPILATION=0 \
		-s ASYNCIFY \
		$(EMCC_ASYNCIFY_DEBUG) \
		-s ASYNCIFY_IMPORTS=fetch_and_load_document \
		-s ASYNCIFY_STACK_SIZE=256KB \
		-Wl,--export-memory \
		`pkg-config --libs libxml-2.0 libxslt libexslt`
	@echo "--- $(OUT_FILE) (embedded WASM) ---"

clean:
	rm -f $(BUILD_DIR)/xslt-wasm.js $(BUILD_DIR)/xslt-wasm-debug.js

clean-libs:
	rm -rf $(BUILD_DIR)
