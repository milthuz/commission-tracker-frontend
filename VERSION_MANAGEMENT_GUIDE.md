# Version Management Guide

## 📋 Overview

Your app now uses **package.json** as the single source of truth for version numbers. This ensures consistency across:
- Sidebar display
- Versions page
- GitHub releases
- Netlify deployments

## 🚀 How to Release a New Version

### Option 1: Using the Release Script (Recommended)

1. **Run the release script:**
   ```bash
   bash release.sh 0.2.2
   ```

   This automatically:
   - ✅ Updates package.json version
   - ✅ Commits the change
   - ✅ Pushes to main
   - ✅ Creates and pushes the git tag
   - ✅ Triggers GitHub Actions to create release
   - ✅ Netlify auto-deploys the new version

2. **Wait for automation:**
   - GitHub Actions builds and creates the release (~2-3 minutes)
   - Netlify deploys the new version (~2 minutes)

### Option 2: Manual Process

1. **Update package.json version:**
   ```bash
   npm version 0.2.2 --no-git-tag-version
   ```

2. **Commit and push:**
   ```bash
   git add package.json
   git commit -m "chore: bump version to 0.2.2"
   git push origin main
   ```

3. **Create and push tag:**
   ```bash
   git tag v0.2.2
   git push origin v0.2.2
   ```

4. **Wait for automation** (same as Option 1)

## 📦 What Gets Updated Automatically

When you create a new version:

✅ **Sidebar** - Shows `v{version}` from package.json  
✅ **GitHub Release** - Created with tag and release notes  
✅ **Build Artifacts** - Zipped dist folder attached to release  
✅ **Netlify Deploy** - Auto-deploys from main branch  

## 🔄 Version Sync Flow

```
package.json (v0.2.2)
    ↓
Sidebar reads version dynamically
    ↓
Git tag matches package.json (v0.2.2)
    ↓
GitHub Actions verifies match
    ↓
Release created + artifacts uploaded
    ↓
Netlify deploys with new version
```

## 🎯 Best Practices

### Semantic Versioning
- **Major (1.0.0)**: Breaking changes
- **Minor (0.2.0)**: New features, backwards compatible
- **Patch (0.2.1)**: Bug fixes, small changes

### Release Types
- **Stable**: `0.2.1`, `1.0.0`
- **Beta**: `0.2.1-beta`, `1.0.0-beta.1` (marked as pre-release)
- **Alpha**: `0.2.1-alpha` (marked as pre-release)

### Commit Messages
Good commit messages help generate better release notes:
```bash
feat: Add new commission calculation feature
fix: Correct sidebar alignment issue
chore: Update dependencies
docs: Update README with new instructions
```

## 📝 For Your Versions Page

If you have a Versions page that displays release history, update it to fetch from:
- **GitHub Releases API**: `https://api.github.com/repos/milthuz/commission-tracker-frontend/releases`
- **Latest release**: `https://api.github.com/repos/milthuz/commission-tracker-frontend/releases/latest`

Example React component:
```tsx
import { useEffect, useState } from 'react';
import packageJson from '../package.json';

const VersionsPage = () => {
  const [releases, setReleases] = useState([]);
  
  useEffect(() => {
    fetch('https://api.github.com/repos/milthuz/commission-tracker-frontend/releases')
      .then(res => res.json())
      .then(data => setReleases(data));
  }, []);

  return (
    <div>
      <h1>Current Version: v{packageJson.version}</h1>
      <h2>Release History</h2>
      {releases.map(release => (
        <div key={release.id}>
          <h3>{release.name}</h3>
          <p>{release.body}</p>
        </div>
      ))}
    </div>
  );
};
```

## 🐛 Troubleshooting

### Version mismatch error
If GitHub Actions fails with "Git tag doesn't match package.json version":
```bash
# Check current package.json version
npm version

# Update to match desired tag
npm version 0.2.2 --no-git-tag-version
git add package.json
git commit -m "chore: fix version mismatch"
git push origin main

# Delete and recreate tag
git tag -d v0.2.2
git push origin --delete v0.2.2
git tag v0.2.2
git push origin v0.2.2
```

### Wrong version showing in app
Clear browser cache or do a hard refresh (Ctrl+Shift+R)

### Release not created
Check GitHub Actions tab in your repository for error logs

## 📚 Quick Reference

```bash
# Check current version
npm version

# Release new version (automated)
bash release.sh 0.2.3

# Manual version update
npm version 0.2.3 --no-git-tag-version

# List all tags
git tag

# Delete a tag
git tag -d v0.2.1
git push origin --delete v0.2.1

# View releases
https://github.com/milthuz/commission-tracker-frontend/releases
```

## 🎉 Summary

Your version management is now fully automated! Just run:
```bash
bash release.sh 0.2.2
```

And everything updates automatically across your entire stack.
