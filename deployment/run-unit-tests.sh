#!/usr/bin/env bash
# deployment/run-unit-tests.sh
# Test runner template for infrastructure constructs and microservices

set -e

echo "[INFO] Running unit tests..."

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SOURCE_DIR="$DIR/../source"

cd "$SOURCE_DIR"

if [ -f "package.json" ]; then
    echo "[INFO] Running CDK unit tests..."
    npm test --if-present
fi

echo "[SUCCESS] Unit tests executed."
