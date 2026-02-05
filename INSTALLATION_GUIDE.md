# 🚀 QueueTrack - Complete Installation Guide

## 📦 What You're Getting

A complete, production-ready Electron desktop application for tracking Ticketmaster queue positions.

---

## ⚡ QUICK START (Recommended)

### Windows Users:
1. Extract all files to a folder (e.g., `C:\QueueTrack`)
2. **Double-click `START.bat`**
3. Wait 2-3 minutes (first time only - installs dependencies automatically)
4. App launches! 🎉

### Mac/Linux Users:
1. Extract all files to a folder
2. Open Terminal in that folder
3. Run: `chmod +x START.sh && ./START.sh`
4. Wait 2-3 minutes (first time only)
5. App launches! 🎉

---

## 📋 What's Included

### Core Application Files (9 files):
1. **main.js** - Electron main process (window management, file operations)
2. **app.js** - Application logic (CSV import, filtering, calculations)
3. **index.html** - User interface structure
4. **styles.css** - All styling and animations
5. **package.json** - Project configuration
6. **README.md** - Full documentation
7. **BUILD_INSTRUCTIONS.md** - How to build .exe installer
8. **START.bat** - Windows one-click launcher
9. **START.sh** - Mac/Linux one-click launcher

### Test Data Files (3 files):
- **test_data_light.csv** - 50 accounts, 123 tests
- **test_data_medium.csv** - 200 accounts, 795 tests
- **test_data_heavy.csv** - 1000 accounts, 7456 tests (stress test!)

---

## 🖥️ System Requirements

### To Run the App:
- **Windows 10/11**, **macOS 10.13+**, or **Linux**
- **Node.js 16+** (download from https://nodejs.org)
- **200MB free disk space**

### To Build .exe Installer:
- Same as above, plus ~5 minutes for first build

---

## 📖 DETAILED INSTALLATION

### Step 1: Install Node.js (If Not Already Installed)

**Check if you have it:**
```bash
node --version
```

**If you see a version number (e.g., v20.10.0), skip to Step 2!**

**If not installed:**
1. Go to https://nodejs.org
2. Download the **LTS version** (recommended)
3. Run the installer (accept all defaults)
4. Restart your terminal/command prompt

### Step 2: Extract QueueTrack Files

Extract all files to a folder of your choice. **All 9 core files must be in the same directory!**

Example folder structure:
```
QueueTrack/
├── main.js
├── app.js
├── index.html
├── styles.css
├── package.json
├── START.bat
├── START.sh
├── README.md
└── BUILD_INSTRUCTIONS.md
```

### Step 3A: Run Using Launcher (Easiest)

**Windows:**
- Double-click `START.bat`
- First time: Installs dependencies automatically (2-3 minutes)
- Every time after: Instant launch!

**Mac/Linux:**
- Make executable: `chmod +x START.sh`
- Run: `./START.sh`

### Step 3B: Run Using Terminal (Alternative)

Open terminal/command prompt in the QueueTrack folder:

**First Time Only:**
```bash
npm install
```
(This downloads ~200MB of dependencies - takes 2-3 minutes)

**Every Time:**
```bash
npm start
```

---

## 🎯 BUILDING .EXE INSTALLER (Optional)

Want a standalone .exe that you can share?

### Steps:
1. Open terminal in QueueTrack folder
2. Run: `npm install` (if you haven't already)
3. Run: `npm run build`
4. Wait 5-10 minutes (first time only)
5. Find your installer: `dist/QueueTrack Setup 1.0.0.exe`

### What You Get:
- **~150-180 MB installer file**
- One-click installation for end users
- Desktop shortcut created automatically
- Start menu entry
- Proper Windows uninstaller
- **No Node.js required for end users!**

### Share It:
Once built, you can share the `.exe` file with anyone. They just double-click to install!

---

## 📊 USING THE APP

### Import Data:
1. Click **"Import CSV"** button (top right)
2. Select your CSV file
3. Data loads instantly!

### CSV Format Required:
```csv
Email,Testing Date,Event Name,Queue Number,Queue Anchor
john@example.com,2026-01-15,Concert A,1500,10000
sarah@example.com,2026-01-16,Concert A,5500,10000
```

**Required Columns:**
- `Email` - Account email address
- `Testing Date` - Format: YYYY-MM-DD
- `Event Name` - Any event identifier
- `Queue Number` - Position in queue
- `Queue Anchor` - Total queue size (optional - auto-calculated if missing)

### Test with Sample Data:
Use the included test files:
- `test_data_light.csv` - Quick test (50 accounts)
- `test_data_medium.csv` - Realistic test (200 accounts)
- `test_data_heavy.csv` - Stress test (1000 accounts)

---

## ✨ FEATURES

### Main View:
✅ Shows 5 most recent tests per account  
✅ Color-coded by queue % (green = good, red = bad)  
✅ Auto-sorted by improvement (best performers first)  
✅ Search by email (instant filtering)  
✅ Smart filters: Instants, Juice, Excellent, Improving, Declining  
✅ Click "Best Position" to jump to best account (with 💎 badge)  
✅ Click any cell to see detailed test info (custom modal)

### Timeline View:
✅ Click "View All" on any account  
✅ Horizontal line graph showing all tests  
✅ Hover points for detailed tooltips  
✅ Stats: Best, Worst, Average, Total tests

### Settings:
✅ Customize "Juice" thresholds  
✅ Toggle Light/Dark mode (smooth transitions)  
✅ All settings persist automatically

### Performance:
✅ Handles 1000+ accounts smoothly  
✅ Debounced search (no lag when typing)  
✅ Smooth animations (GPU-accelerated)  
✅ Efficient rendering with loading indicators

---

## 🎨 UI FEATURES

### Color Coding:
- ⚡ **Instants** (≤1%) - Bright green
- 🔥 **Juice** (≤10% + ≥50k anchor) - Green  
- ⭐ **Excellent** (10.1-20%) - Light green
- **Good** (20.1-40%) - Yellow
- **Neutral** (40.1-60%) - Orange
- **Poor** (60.1-80%) - Orange-red
- **Bad** (80.1-100%) - Red

### Badges:
- 💎 **Best** - Lowest queue % across all accounts
- 🔥 **Juice** - Meets juice criteria (customizable)

### Change % Logic:
- **+17%** = IMPROVED (went from 20% → 3%) ✓ Green
- **-17%** = DECLINED (went from 3% → 20%) ✓ Red

---

## 💾 DATA STORAGE

All data stored locally and securely:

**Windows:** `%APPDATA%\queuetrack\`  
**Mac:** `~/Library/Application Support/queuetrack/`  
**Linux:** `~/.config/queuetrack/`

### Files:
- `queuetrack-data.json` - All your test data
- `queuetrack-data.backup.json` - Automatic backup
- `settings.json` - Your preferences

---

## ⌨️ KEYBOARD SHORTCUTS

- `Ctrl/Cmd + I` - Import CSV
- `Ctrl/Cmd + ,` - Open Settings
- `Ctrl/Cmd + F` - Focus Search
- `Escape` - Close Settings/Timeline/Modal
- `Ctrl/Cmd + Q` - Quit Application

---

## 🐛 TROUBLESHOOTING

### "Node.js not installed"
**Fix:** Install Node.js from https://nodejs.org (LTS version)

### App won't start after `npm install`
**Fix:** 
1. Delete `node_modules` folder
2. Delete `package-lock.json` file
3. Run `npm install` again

### "Cannot find module 'electron'"
**Fix:** You're in the wrong folder. Navigate to the folder with `package.json`

### Search is slow with 1000+ accounts
**This is normal!** The app uses:
- 300ms debounce (waits after you stop typing)
- Loading indicator (table fades during filter)
- Should feel smooth, not frozen

### Import CSV fails
**Check:**
- CSV has all required columns (Email, Testing Date, Event Name, Queue Number)
- Date format is YYYY-MM-DD
- Numbers are valid integers
- File encoding is UTF-8

### Data not showing after import
**Check:** Look in the console (Help → Toggle Developer Tools) for errors

---

## 🔄 UPDATING THE APP

To get new features/fixes:
1. Download new files
2. Replace old `app.js`, `styles.css`, `index.html`, `main.js`
3. Keep your `package.json` and `node_modules` folder
4. Restart app

Your data is safe! It's stored separately in the user data folder.

---

## 🤝 SUPPORT

### For Issues:
1. Check this README first
2. Check `BUILD_INSTRUCTIONS.md` for build issues
3. Look in Developer Tools console for errors (Help → Toggle Developer Tools)

### Common Questions:

**Q: Can I use this on multiple computers?**  
A: Yes! Just copy the folder. Data is stored locally on each computer.

**Q: Can I export my data?**  
A: Your data is in JSON format. Find it in the user data folder (paths listed above).

**Q: Can I customize the colors?**  
A: Yes! Edit `styles.css` - look for the color class definitions.

**Q: Can multiple people use the same .exe?**  
A: Yes! Once you build the .exe, anyone can install and use it.

---

## 📝 VERSION HISTORY

### Version 1.0.0 (Current)
✅ Complete CSV import with validation  
✅ Timeline graph view  
✅ Smart filters (6 types)  
✅ Custom modal dialogs  
✅ Click Best Position to scroll + highlight  
✅ Debounced search for performance  
✅ Smooth dark mode transitions  
✅ 💎 Diamond badge for best account  
✅ Corrected change % logic (lower = better)  
✅ Auto-backup data on save  
✅ Keyboard shortcuts  
✅ Production-ready performance  

---

## 🎉 YOU'RE READY!

### Next Steps:
1. ✅ Launch the app using `START.bat` or `START.sh`
2. ✅ Import one of the test CSV files
3. ✅ Explore the features!
4. ✅ Import your real data
5. ✅ (Optional) Build .exe to share with others

**Enjoy QueueTrack!** 🚀
