#!/bin/bash

# Commission Tracker Release Script
# Version: 0.2.5 - Invoice Management Overhaul

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Version to release
VERSION="0.2.5"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Commission Tracker Release v${VERSION}              ║${NC}"
echo -e "${BLUE}║  Invoice Management Overhaul                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if we're in the right directory
check_directory() {
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Error: package.json not found${NC}"
        echo -e "${YELLOW}Please run this script from the commission-tracker-frontend directory${NC}"
        exit 1
    fi
}

# Function to check if git is clean
check_git_status() {
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
        echo ""
        git status --short
        echo ""
        read -p "Do you want to continue? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Release cancelled${NC}"
            exit 1
        fi
    fi
}

# Function to update package.json version
update_version() {
    echo -e "${BLUE}📝 Updating package.json to v${VERSION}...${NC}"
    npm version $VERSION --no-git-tag-version
    echo -e "${GREEN}✅ Version updated${NC}"
    echo ""
}

# Function to create commit
create_commit() {
    echo -e "${BLUE}💾 Creating release commit...${NC}"
    
    git add package.json
    
    # Multi-line commit message
    git commit -m "release: v${VERSION} - Invoice Management Overhaul

✨ New Features:
- Print invoice functionality with instant print dialog
- Email invoice with branded modal interface
- Real-time sync progress tracking (X/X invoices)
- Custom success/error notifications with animations

🐛 Bug Fixes:
- Fixed sync timeout with background processing (Heroku 30s limit)
- Resolved invoice_id fetching issues (auto-fetch from Zoho)
- Fixed preview 'Invoice ID not found' errors
- Fixed PDF download failures

🎨 UI Improvements:
- Branded email modal with Cluster orange theme
- Smooth fade-in animations for notifications
- Auto-dismiss notifications (3 seconds)
- Better error messages and loading states
- No more browser alerts

🔧 Technical Changes:
- Background sync with SSE (Server-Sent Events)
- Auto-fetch invoice_id from Zoho when NULL
- New /api/invoices/:id/email endpoint
- Enhanced error logging and handling"
    
    echo -e "${GREEN}✅ Commit created${NC}"
    echo ""
}

# Function to create and push tag
create_tag() {
    echo -e "${BLUE}🏷️  Creating git tag v${VERSION}...${NC}"
    git tag -a v$VERSION -m "Release v$VERSION - Invoice Management Overhaul

Major Features:
- Print & Email invoices
- Real-time sync progress
- Branded notifications
- Background processing

See full release notes at:
https://github.com/milthuz/commission-tracker-frontend/releases/tag/v$VERSION"
    
    echo -e "${GREEN}✅ Tag created${NC}"
    echo ""
}

# Function to push to GitHub
push_to_github() {
    echo -e "${BLUE}🚀 Pushing to GitHub...${NC}"
    git push origin main
    git push origin v$VERSION
    echo -e "${GREEN}✅ Pushed to GitHub${NC}"
    echo ""
}

# Function to show next steps
show_next_steps() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  🎉 Release v${VERSION} Created Successfully!         ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo ""
    echo -e "  1. ${BLUE}GitHub Actions${NC} will automatically:"
    echo -e "     • Build the project"
    echo -e "     • Create GitHub release"
    echo -e "     • Attach build artifacts"
    echo ""
    echo -e "  2. ${BLUE}Netlify${NC} will automatically deploy to:"
    echo -e "     https://sparkly-kulfi-c7641a.netlify.app"
    echo ""
    echo -e "  3. ${BLUE}Deploy Backend${NC} to Heroku:"
    echo -e "     ${YELLOW}cd ../commission-tracker${NC}"
    echo -e "     ${YELLOW}git push heroku main${NC}"
    echo ""
    echo -e "  4. ${BLUE}Create Release Notes${NC} on GitHub:"
    echo -e "     https://github.com/milthuz/commission-tracker-frontend/releases/new?tag=v${VERSION}"
    echo ""
    echo -e "${GREEN}✅ Frontend Deployment Status:${NC}"
    echo -e "   • Netlify: ${YELLOW}Deploying...${NC}"
    echo -e "   • Check: https://app.netlify.com/sites/sparkly-kulfi-c7641a/deploys"
    echo ""
    echo -e "${YELLOW}⏱️  Estimated Time:${NC}"
    echo -e "   • GitHub Actions: ~2-3 minutes"
    echo -e "   • Netlify Deploy: ~2 minutes"
    echo -e "   • Total: ~5 minutes"
    echo ""
}

# Main execution
main() {
    echo -e "${YELLOW}Starting release process...${NC}"
    echo ""
    
    # Check if we're in the right directory
    check_directory
    
    # Check git status
    check_git_status
    
    # Update version
    update_version
    
    # Create commit
    create_commit
    
    # Create tag
    create_tag
    
    # Push to GitHub
    read -p "Push to GitHub and trigger deployment? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        push_to_github
        show_next_steps
    else
        echo -e "${YELLOW}⚠️  Release created locally but not pushed${NC}"
        echo -e "${YELLOW}To push manually, run:${NC}"
        echo -e "  git push origin main"
        echo -e "  git push origin v${VERSION}"
    fi
}

# Run main function
main
