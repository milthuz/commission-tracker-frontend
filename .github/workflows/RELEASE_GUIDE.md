# Automated Release Guide

## How to Create a New Release

1. **Make your changes and commit them:**
   ```bash
   git add .
   git commit -m "Add new features for v0.2.1"
   ```

2. **Create and push a version tag:**
   ```bash
   git tag v0.2.1
   git push origin main
   git push origin v0.2.1
   ```

3. **That's it!** GitHub Actions will automatically:
   - Build your project
   - Create a GitHub Release with release notes
   - Mark beta/alpha versions as pre-releases
   - Upload build artifacts

## Version Naming Convention

- **Stable releases**: `v1.0.0`, `v0.2.1`
- **Beta releases**: `v0.2.0-beta`, `v1.0.0-beta.1` (automatically marked as pre-release)
- **Alpha releases**: `v0.1.0-alpha` (automatically marked as pre-release)

## Quick Commands

```bash
# Create a new release
git tag v0.2.1
git push origin v0.2.1

# Create a beta release
git tag v0.2.1-beta
git push origin v0.2.1-beta

# List all tags
git tag

# Delete a tag (if needed)
git tag -d v0.2.1
git push origin --delete v0.2.1
```

## View Your Releases

Visit: https://github.com/milthuz/commission-tracker-frontend/releases

## Notes

- Release notes are automatically generated from your commit messages
- Build artifacts are attached to each release
- Netlify automatically deploys when code is pushed to main
