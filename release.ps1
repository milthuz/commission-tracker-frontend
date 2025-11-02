# Version Release Script (PowerShell)
# This script automates the version release process

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

Write-Host "🚀 Starting release process for version $Version..." -ForegroundColor Cyan

# Update package.json version
Write-Host "📝 Updating package.json..." -ForegroundColor Yellow
npm version $Version --no-git-tag-version

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to update package.json" -ForegroundColor Red
    exit 1
}

# Commit the version change
Write-Host "💾 Committing version change..." -ForegroundColor Yellow
git add package.json
git commit -m "chore: bump version to $Version"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to commit changes" -ForegroundColor Red
    exit 1
}

# Push to main
Write-Host "⬆️  Pushing to main..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to push to main" -ForegroundColor Red
    exit 1
}

# Create and push tag
Write-Host "🏷️  Creating and pushing tag v$Version..." -ForegroundColor Yellow
git tag "v$Version"
git push origin "v$Version"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to push tag" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Release process completed successfully!" -ForegroundColor Green
Write-Host "📦 GitHub Actions will now build and create the release automatically" -ForegroundColor Cyan
Write-Host "🌐 Netlify will deploy the new version" -ForegroundColor Cyan
Write-Host ""
Write-Host "View your release at: https://github.com/milthuz/commission-tracker-frontend/releases" -ForegroundColor Magenta
