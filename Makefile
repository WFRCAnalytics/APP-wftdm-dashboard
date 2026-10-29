# APP-wftdm-dashboard Makefile
# Builds the Vite JS app and embeds it in the Python package

.PHONY: install dev build package clean

# Install all JS dependencies
install:
	npm install

# Start Vite dev server
dev:
	npm run dev

# Build the JS app (no demo content, 070; relative base, 072) straight into the Python package
build:
	npm run build:package
	@echo "✓ Static files embedded in Python package"

# Build Python wheel (run `make build` first)
package: build
	uv build
	@echo "✓ Python wheel built in dist/"

# Publish to PyPI (or internal index)
publish: package
	uv publish

# Remove build artifacts
clean:
	rm -rf dist
	rm -rf python/wftdm_dashboard/static
	rm -rf node_modules
	rm -rf .venv
