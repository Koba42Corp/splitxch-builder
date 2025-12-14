#!/bin/bash
# Script to build and prepare for GitHub Pages deployment

echo "Building Angular app for production..."
cd client
npm run build -- --configuration production

echo "Copying 404.html to docs folder..."
cp ../docs/404.html ../docs/404.html 2>/dev/null || echo "404.html already in place"

echo "Build complete! Files are in docs/ folder at the root"
echo "To deploy:"
echo "  1. git add docs/"
echo "  2. git commit -m 'Deploy to GitHub Pages'"
echo "  3. git push"

