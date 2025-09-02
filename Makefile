HTML_FILES := $(shell find . -name "*.html")
JS_FILES := $(shell find . -name "*.js")
ALL_FILES := $(HTML_FILES) $(JS_FILES)

.PHONY: all
all: fix check

.PHONY: fix
fix:
	npx prettier --write $(ALL_FILES)

.PHONY: check
check:
	npx prettier --check $(ALL_FILES)