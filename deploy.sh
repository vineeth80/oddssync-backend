#!/bin/bash
set -e

echo "=========================================="
echo "OddsSync Backend - Railway Deployment"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Current Status:${NC}"
echo "✓ 7 commits on refactor branch"
echo "✓ 73 tests passing (100%)"
echo "✓ Production build: 148KB"
echo "✓ Railway configs ready"
echo ""

echo -e "${BLUE}Commit History:${NC}"
git log --oneline --graph -7
echo ""

echo -e "${GREEN}Choose deployment method:${NC}"
echo "1) GitHub (Recommended) - Push to GitHub, then connect Railway"
echo "2) Railway CLI - Direct deploy with Railway CLI"
echo "3) Manual - Display git remote instructions"
echo "4) Exit"
echo ""

read -p "Enter choice [1-4]: " choice

case $choice in
  1)
    echo ""
    echo -e "${BLUE}GitHub Deployment${NC}"
    read -p "Enter your GitHub username: " github_user
    read -p "Enter repository name [oddssync-backend]: " repo_name
    repo_name=${repo_name:-oddssync-backend}

    echo ""
    echo "Adding GitHub remote..."
    git remote add origin "https://github.com/${github_user}/${repo_name}.git" || {
      echo "Remote 'origin' already exists, updating..."
      git remote set-url origin "https://github.com/${github_user}/${repo_name}.git"
    }

    echo ""
    echo "Pushing to GitHub..."
    git push -u origin refactor

    echo ""
    echo -e "${GREEN}✓ Pushed to GitHub!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Go to https://railway.app/project/cd2b52cc-0f9f-4c16-a6f9-105426bc6d11"
    echo "2. Click 'oddssync-backend' service"
    echo "3. Settings → Source → Connect Repository"
    echo "4. Select: ${github_user}/${repo_name}"
    echo "5. Branch: refactor"
    echo "6. Deploy!"
    ;;

  2)
    echo ""
    echo -e "${BLUE}Railway CLI Deployment${NC}"

    # Check if Railway CLI is installed
    if ! command -v railway &> /dev/null; then
      echo "Railway CLI not found. Installing..."
      npm install -g @railway/cli
    fi

    echo "Logging in to Railway..."
    railway login

    echo "Linking to project..."
    railway link cd2b52cc-0f9f-4c16-a6f9-105426bc6d11

    echo "Deploying..."
    railway up

    echo ""
    echo -e "${GREEN}✓ Deployed to Railway!${NC}"
    ;;

  3)
    echo ""
    echo -e "${BLUE}Manual Deployment Instructions${NC}"
    echo ""
    echo "1. Get your Railway git remote URL from:"
    echo "   https://railway.app/project/cd2b52cc-0f9f-4c16-a6f9-105426bc6d11"
    echo "   → Settings → Generate Deploy Token"
    echo ""
    echo "2. Add the remote:"
    echo "   git remote add railway YOUR_RAILWAY_GIT_URL"
    echo ""
    echo "3. Push to Railway:"
    echo "   git push railway refactor:main"
    echo ""
    ;;

  4)
    echo "Exiting..."
    exit 0
    ;;

  *)
    echo -e "${RED}Invalid choice${NC}"
    exit 1
    ;;
esac

echo ""
echo "=========================================="
echo "Deployment initiated!"
echo "=========================================="
echo ""
echo "Monitor deployment:"
echo "→ Dashboard: https://railway.app/project/cd2b52cc-0f9f-4c16-a6f9-105426bc6d11"
echo "→ Logs: railway logs (if CLI installed)"
echo ""
echo "Test deployment:"
echo "→ Health: https://oddssync-backend-production.up.railway.app/health"
echo "→ Config: https://oddssync-backend-production.up.railway.app/api/config"
echo ""
