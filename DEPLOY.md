# GitHub Pages Deployment Instructions

## Current Configuration

- **Repository**: `Koba42Corp/splitxch-builder`
- **Base Href**: `/splitxch-builder/` (configured in `angular.json`)
- **Build Output**: `docs/` folder (configured in `angular.json`)
- **GitHub Pages Source**: `docs/` folder from `main` branch

## Deployment Steps

1. **Build the application for production**:
   ```bash
   cd client
   npm run build -- --configuration production
   ```
   
   This will output files to the `docs/` folder at the root of the repository.

2. **Verify the build output**:
   ```bash
   # Check that index.html has the correct base href
   grep "base href" docs/index.html
   # Should show: <base href="/splitxch-builder/">
   
   # Verify key files exist
   ls -la docs/index.html docs/runtime.* docs/main.* docs/polyfills.* docs/styles.*
   ```

3. **Commit and push**:
   ```bash
   git add docs/
   git commit -m "Deploy to GitHub Pages"
   git push origin main
   ```

4. **Configure GitHub Pages** (if not already done):
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` / `/docs`
   - Save

5. **Wait for deployment**:
   - GitHub Pages typically takes 1-2 minutes to build
   - Check Actions tab for deployment status

## Verification

After deployment, verify:
- Application loads at: `https://koba42corp.github.io/splitxch-builder/`
- All assets load correctly (no 404 errors in console)
- Angular routing works (navigate between pages)
- Favicon displays correctly

## Troubleshooting

If you see 404 errors:
1. Verify files are in the `docs/` folder
2. Check that `base href` in `docs/index.html` is `/splitxch-builder/`
3. Ensure GitHub Pages is configured to serve from `/docs` folder
4. Clear browser cache and try again
5. Check GitHub Actions for deployment errors

## Custom Domain (if applicable)

If using a custom domain (e.g., `ifstt.koba42.com`):
- The base href should still be `/splitxch-builder/` if the repo name is `splitxch-builder`
- Or change base href to `/` if the custom domain points directly to the root
- Update `angular.json` production configuration accordingly

