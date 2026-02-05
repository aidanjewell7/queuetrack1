#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

clear
echo -e "${BLUE}"
echo "========================================"
echo "   QueueTrack - Production Launcher"
echo "========================================"
echo -e "${NC}"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js is not installed!"
    echo
    echo "Please install Node.js from: https://nodejs.org"
    echo "Download the LTS version and run this again."
    echo
    read -p "Press Enter to exit..."
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Node.js detected ($(node --version))"
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[INFO]${NC} First time setup - Installing dependencies..."
    echo "This will take 1-2 minutes..."
    echo
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} Installation failed!"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo
    echo -e "${GREEN}[OK]${NC} Dependencies installed successfully!"
    echo
fi

# Start the application
echo -e "${BLUE}[INFO]${NC} Starting QueueTrack..."
echo
npm start
