#!/usr/bin/env bash
# deployment/build-open-source.sh
# Packaging script template for CDK assets and solution artifacts

set -e

echo "[INFO] Starting solution build process..."

# Navigate to source directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SOURCE_DIR="$DIR/../source"

cd "$SOURCE_DIR"

echo "[INFO] Installing dependencies..."
npm ci || npm install

echo "[INFO] Compiling TypeScript..."
npm run build

echo "[INFO] Synthesizing CDK template..."
npx cdk synth --output="$DIR/cdk-dist"

echo "[SUCCESS] Build completed successfully. Artifacts output to deployment/cdk-dist"
