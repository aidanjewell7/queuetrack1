// Use the secure electronAPI bridge instead of direct require
const api = window.electronAPI;

// Constants
const CURRENT_SCHEMA_VERSION = 1;
const MAX_HISTORY_SIZE = 20;
const INITIAL_ROW_LIMIT = 100;
const ROW_INCREMENT = 50;

// Row size configurations
const ROW_SIZES = {
    'ultra-compact': { padding: '3px 12px', testPadding: '4px', fontSize: '10px', testFontSize: '9px', label: 'Ultra-Compact' },
    compact: { padding: '6px 16px', testPadding: '6px', fontSize: '11px', testFontSize: '10px', label: 'Compact' },
    normal: { padding: '12px 16px', testPadding: '12px', fontSize: '12px', testFontSize: '11px', label: 'Normal' },
    comfortable: { padding: '18px 16px', testPadding: '16px', fontSize: '13px', testFontSize: '12px', label: 'Comfortable' }
};

// State
let allTests = [];
let importHistory = []; // Track CSV imports { id, filename, date, testCount }
let settings = {
    juicePercent: 10,
    juiceAnchor: 50000,
    darkMode: false,
    rowSize: 'normal',
    groups: {},
    colorRanges: {
        instants: 1,
        juice: 10,
        excellent: 20,
        good: 40,
        neutral: 60
        // poor is anything above neutral
    }
};
let currentFilter = 'all';
let currentSort = { field: 'change', direction: 'desc' };
let undoHistory = [];
let redoHistory = [];
let visibleRowCount = INITIAL_ROW_LIMIT;
let compareMode = false;
let selectedForCompare = new Set();
let isManualUpdateCheck = false;
let currentPage = 'home'; // 'home' or 'settings'

// HTML escaping utility to prevent XSS
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const s = String(str);
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// ============================
// PAGE NAVIGATION
// ============================
function navigateTo(page) {
    currentPage = page;

    // Update sidebar nav items
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    if (page === 'home') {
        document.getElementById('navHome').classList.add('active');
        document.getElementById('mainContent').style.display = 'flex';
        document.getElementById('settingsPage').style.display = 'none';
        document.getElementById('toolsBar').style.display = 'flex';
        document.getElementById('searchWrapper').style.display = 'flex';
        document.getElementById('importBtn').style.display = 'block';
        document.getElementById('pageTitle').textContent = 'Home';
    } else if (page === 'settings') {
        document.getElementById('navSettings').classList.add('active');
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('settingsPage').style.display = 'block';
        document.getElementById('toolsBar').style.display = 'none';
        document.getElementById('searchWrapper').style.display = 'none';
        document.getElementById('importBtn').style.display = 'none';
        document.getElementById('pageTitle').textContent = 'Settings';

        // Hide timeline/comparison if visible
        document.getElementById('timelinePage').style.display = 'none';
        document.getElementById('comparisonPage').style.display = 'none';
        document.getElementById('backBtn').style.display = 'none';
    }
}

function updateToolsStats() {
    const emails = new Set(allTests.map(t => t.email));
    const toolsStats = document.getElementById('toolsStats');
    if (toolsStats) {
        toolsStats.textContent = `${emails.size} account${emails.size !== 1 ? 's' : ''}`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadSettings();
        await loadData();
        setupEventListeners();
        renderTable();
        updateUndoRedoButtons();
        applyRowSize();
        setupAutoUpdater();
    } catch (error) {
        showToast('Failed to initialize app: ' + error.message, 'error');
        console.error('Init error:', error);
    } finally {
        setTimeout(() => {
            document.getElementById('loadingScreen').classList.add('hidden');
        }, 500);
    }
});

// ============================
// AUTO-UPDATER UI
// ============================
function setupAutoUpdater() {
    api.onUpdateStatus((data) => {
        const bar = document.getElementById('updateBar');
        const icon = document.getElementById('updateIcon');
        const text = document.getElementById('updateText');
        const actions = document.getElementById('updateActions');
        const progress = document.getElementById('updateProgress');
        const progressFill = document.getElementById('updateProgressFill');

        switch (data.status) {
            case 'checking':
                // Don't show anything while checking - too noisy
                break;

            case 'available':
                bar.style.display = 'flex';
                bar.className = 'update-bar update-available';
                icon.textContent = '\u2B06';
                text.textContent = `Update v${data.version} is available`;
                progress.style.display = 'none';
                actions.innerHTML = '';

                // If this was a manual check, reset button and close settings so bar is visible
                if (isManualUpdateCheck) {
                    isManualUpdateCheck = false;
                    const checkBtn = document.getElementById('checkUpdatesBtn');
                    if (checkBtn) { checkBtn.disabled = false; checkBtn.textContent = 'Check for Updates'; }
                    document.getElementById('settingsPanel').classList.remove('open');
                    showToast(`Update v${data.version} found! Click Download in the bar above.`, 'success');
                }

                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'update-btn download';
                downloadBtn.textContent = 'Download';
                downloadBtn.onclick = () => {
                    api.downloadUpdate();
                    downloadBtn.disabled = true;
                    downloadBtn.textContent = 'Starting...';
                };
                actions.appendChild(downloadBtn);

                const dismissBtn = document.createElement('button');
                dismissBtn.className = 'update-btn dismiss';
                dismissBtn.textContent = 'Later';
                dismissBtn.onclick = () => { bar.style.display = 'none'; };
                actions.appendChild(dismissBtn);
                break;

            case 'downloading':
                bar.style.display = 'flex';
                bar.className = 'update-bar update-downloading';
                icon.textContent = '\u2B07';
                text.textContent = `Downloading update... ${data.percent}%`;
                progress.style.display = 'block';
                progressFill.style.width = data.percent + '%';
                actions.innerHTML = '';
                break;

            case 'ready':
                bar.style.display = 'flex';
                bar.className = 'update-bar update-ready';
                icon.textContent = '\u2705';
                text.textContent = `Update v${data.version} ready to install`;
                progress.style.display = 'none';
                actions.innerHTML = '';

                const installBtn = document.createElement('button');
                installBtn.className = 'update-btn install';
                installBtn.textContent = 'Restart & Update';
                installBtn.onclick = () => { api.installUpdate(); };
                actions.appendChild(installBtn);

                const laterBtn = document.createElement('button');
                laterBtn.className = 'update-btn dismiss';
                laterBtn.textContent = 'On Next Launch';
                laterBtn.onclick = () => { bar.style.display = 'none'; };
                actions.appendChild(laterBtn);
                break;

            case 'up-to-date':
                bar.style.display = 'none';
                if (isManualUpdateCheck) {
                    isManualUpdateCheck = false;
                    showToast('You are running the latest version', 'success');
                    const btn = document.getElementById('checkUpdatesBtn');
                    if (btn) { btn.disabled = false; btn.textContent = 'Check for Updates'; }
                }
                break;

            case 'error':
                console.log('Update check error:', data.message);
                bar.style.display = 'none';
                if (isManualUpdateCheck) {
                    isManualUpdateCheck = false;
                    showToast('Could not check for updates', 'error');
                    const btn = document.getElementById('checkUpdatesBtn');
                    if (btn) { btn.disabled = false; btn.textContent = 'Check for Updates'; }
                }
                break;
        }
    });

    // Show current version in settings
    api.getAppVersion().then(version => {
        const versionEl = document.getElementById('appVersion');
        if (versionEl) versionEl.textContent = 'v' + version;
    });
}

async function checkForUpdatesManual() {
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Checking...';
    }
    isManualUpdateCheck = true;
    try {
        await api.checkForUpdates();
        // The update-status event listener handles showing toast for up-to-date/error
    } catch (e) {
        isManualUpdateCheck = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Check for Updates'; }
        showToast('Could not check for updates', 'error');
    }
}

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = type === 'error' ? 'error-toast' : 'success-toast';

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    const close = document.createElement('span');
    close.className = 'toast-close';
    close.textContent = '\u2715';
    close.onclick = () => toast.remove();
    toast.appendChild(close);

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Settings
async function loadSettings() {
    const result = await api.loadSettings();
    if (result.success && result.data) {
        settings = { ...settings, ...result.data };
        // Ensure colorRanges has all fields
        settings.colorRanges = {
            instants: 1, juice: 10, excellent: 20, good: 40, neutral: 60,
            ...settings.colorRanges
        };

        document.getElementById('juicePercent').value = settings.juicePercent;
        document.getElementById('juiceAnchor').value = settings.juiceAnchor;

        // Row size
        const rowSizeSelect = document.getElementById('rowSizeSelect');
        if (rowSizeSelect) rowSizeSelect.value = settings.rowSize || 'normal';

        // Color ranges
        const colorInputs = ['instants', 'juice', 'excellent', 'good', 'neutral'];
        colorInputs.forEach(key => {
            const input = document.getElementById(`color${key.charAt(0).toUpperCase() + key.slice(1)}`);
            if (input) input.value = settings.colorRanges[key];
        });

        if (settings.darkMode) {
            document.body.classList.add('dark');
            document.getElementById('darkBtn').classList.add('active');
            document.getElementById('lightBtn').classList.remove('active');
        }
    }
}

async function saveSettings() {
    await api.saveSettings(settings);
}

// Row Size
function applyRowSize() {
    const size = ROW_SIZES[settings.rowSize] || ROW_SIZES.normal;
    document.documentElement.style.setProperty('--row-padding', size.padding);
    document.documentElement.style.setProperty('--test-padding', size.testPadding);
    document.documentElement.style.setProperty('--row-font-size', size.fontSize);
    document.documentElement.style.setProperty('--test-font-size', size.testFontSize);
    document.body.setAttribute('data-row-size', settings.rowSize || 'normal');
}

// Data Migration Functions
function migrateData(data) {
    if (!data.version) {
        console.log('Migrating legacy data to schema v1');
        return {
            version: 1,
            tests: Array.isArray(data) ? data : [],
            imports: []
        };
    }
    // Ensure imports array exists
    if (!data.imports) {
        data.imports = [];
    }
    return data;
}

// Data Management
async function loadData() {
    const result = await api.loadData();
    if (result.success && result.data) {
        if (result.recovered) {
            showToast('Data file was corrupted. Restored from backup.', 'info');
        }
        if (result.corrupted) {
            showToast('Data file was corrupted and no backup available. Starting fresh.', 'error');
        }

        const migratedData = migrateData(result.data);

        if (migratedData.version !== result.data.version) {
            console.log(`Data migrated from v${result.data.version || 0} to v${migratedData.version}`);
            await saveData();
        }

        allTests = migratedData.tests;
        importHistory = migratedData.imports || [];
        recalculateAll();
    }
}

async function saveData() {
    const dataToSave = {
        version: CURRENT_SCHEMA_VERSION,
        tests: allTests,
        imports: importHistory
    };
    await api.saveData(dataToSave);
}

// Confirmation Modal Helper
function showConfirmModal(title, message, actionText, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const actionBtn = document.getElementById('confirmActionBtn');
    actionBtn.textContent = actionText || 'Confirm';

    // Clone to remove old event listeners
    const newBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newBtn, actionBtn);

    newBtn.onclick = () => {
        closeConfirmModal();
        if (onConfirm) onConfirm();
    };

    modal.classList.add('visible');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('visible');
}

// Loading Overlay Helper
function showLoadingOverlay(message) {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingOverlayText');
    text.textContent = message || 'Loading...';
    overlay.classList.add('visible');
}

function hideLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.remove('visible');
}

async function clearAllData() {
    showConfirmModal(
        'Delete All Data',
        'Are you sure you want to delete ALL data? This will permanently remove all imported tests and cannot be undone.',
        'Delete Everything',
        async () => {
            saveToHistory();
            allTests = [];
            await saveData();
            renderTable();
            showToast('All data has been cleared', 'success');
        }
    );
}

// Undo/Redo Functions
function saveToHistory() {
    undoHistory.push(JSON.parse(JSON.stringify(allTests)));
    if (undoHistory.length > MAX_HISTORY_SIZE) {
        undoHistory.shift();
    }
    redoHistory = [];
    updateUndoRedoButtons();
}

function undo() {
    if (undoHistory.length === 0) {
        showToast('Nothing to undo', 'info');
        return;
    }
    redoHistory.push(JSON.parse(JSON.stringify(allTests)));
    allTests = undoHistory.pop();
    recalculateAll();
    saveData();
    renderTable();
    showToast('Undo successful', 'success');
    updateUndoRedoButtons();
}

function redo() {
    if (redoHistory.length === 0) {
        showToast('Nothing to redo', 'info');
        return;
    }
    undoHistory.push(JSON.parse(JSON.stringify(allTests)));
    allTests = redoHistory.pop();
    recalculateAll();
    saveData();
    renderTable();
    showToast('Redo successful', 'success');
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
        undoBtn.style.display = undoHistory.length > 0 ? 'inline-flex' : 'none';
        undoBtn.title = `Undo (${undoHistory.length} available)`;
    }

    if (redoBtn) {
        redoBtn.style.display = redoHistory.length > 0 ? 'inline-flex' : 'none';
        redoBtn.title = `Redo (${redoHistory.length} available)`;
    }
}

// CSV Import
async function importCSV() {
    try {
        const filePath = await api.selectCsvFile();
        if (!filePath) return;

        showToast('Importing CSV...', 'info');

        const result = await api.readCsvFile(filePath);
        if (!result.success) {
            showToast(`Error reading file: ${result.error}`, 'error');
            return;
        }

        const tests = parseCSV(result.data);
        if (tests.length === 0) {
            showToast('No valid data found in CSV', 'error');
            return;
        }

        saveToHistory();

        // Generate import ID and tag tests
        const importId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const filename = filePath.split(/[/\\]/).pop(); // Get filename from path

        tests.forEach(t => {
            t.importId = importId;
        });

        const warnings = processNewTests(tests);

        // Track this import
        importHistory.push({
            id: importId,
            filename: filename,
            date: new Date().toISOString(),
            testCount: tests.length
        });

        recalculateAll();
        await saveData();
        renderTable();

        let msg = `Successfully imported ${tests.length} test${tests.length > 1 ? 's' : ''}!`;
        showToast(msg, 'success');

        if (warnings.length > 0) {
            console.log('Import warnings:', warnings);
            setTimeout(() => {
                showToast(warnings.join('\n'), 'info');
            }, 1000);
        }
    } catch (error) {
        showToast(`Import failed: ${error.message}`, 'error');
        console.error('Import error:', error);
    }
}

// Import History Management
function showImportHistory() {
    const modal = document.getElementById('importHistoryModal');
    renderImportHistory();
    modal.classList.add('visible');
}

function closeImportHistoryModal() {
    document.getElementById('importHistoryModal').classList.remove('visible');
}

function renderImportHistory() {
    const container = document.getElementById('importHistoryList');
    container.innerHTML = '';

    if (importHistory.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'import-history-empty';
        empty.textContent = 'No imports yet. Import a CSV to get started!';
        container.appendChild(empty);
        return;
    }

    // Sort by date descending (newest first)
    const sorted = [...importHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(imp => {
        const row = document.createElement('div');
        row.className = 'import-history-row';

        const info = document.createElement('div');
        info.className = 'import-history-info';

        const filename = document.createElement('div');
        filename.className = 'import-history-filename';
        filename.textContent = imp.filename;
        info.appendChild(filename);

        const meta = document.createElement('div');
        meta.className = 'import-history-meta';
        const date = new Date(imp.date);
        meta.textContent = `${date.toLocaleDateString()} at ${date.toLocaleTimeString()} • ${imp.testCount} tests`;
        info.appendChild(meta);

        row.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'import-remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => removeImport(imp.id);
        row.appendChild(removeBtn);

        container.appendChild(row);
    });
}

function removeImport(importId) {
    const imp = importHistory.find(i => i.id === importId);
    if (!imp) return;

    showConfirmModal(
        'Remove Import',
        `Are you sure you want to remove "${imp.filename}"? This will delete ${imp.testCount} tests from this import.`,
        'Remove',
        async () => {
            saveToHistory();

            // Remove tests with this import ID
            allTests = allTests.filter(t => t.importId !== importId);

            // Remove from import history
            importHistory = importHistory.filter(i => i.id !== importId);

            recalculateAll();
            await saveData();
            renderTable();
            renderImportHistory();
            showToast('Import removed successfully', 'success');
        }
    );
}

// Validation helpers
function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Normalize any common date format to YYYY-MM-DD
function normalizeDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const s = dateString.trim();

    let year, month, day;

    // YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (isoMatch) {
        year = parseInt(isoMatch[1]);
        month = parseInt(isoMatch[2]);
        day = parseInt(isoMatch[3]);
    } else {
        // MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY, M/D/YY, etc.
        const otherMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (otherMatch) {
            let a = parseInt(otherMatch[1]);
            let b = parseInt(otherMatch[2]);
            let c = parseInt(otherMatch[3]);

            // Handle 2-digit year
            if (c < 100) c += c < 50 ? 2000 : 1900;

            // Determine if a/b is month/day or day/month
            if (a > 12 && b <= 12) {
                // a must be day (DD/MM/YYYY format)
                day = a; month = b; year = c;
            } else if (b > 12 && a <= 12) {
                // b must be day (MM/DD/YYYY format)
                month = a; day = b; year = c;
            } else {
                // Both could be month or day - default to MM/DD/YYYY (US format)
                month = a; day = b; year = c;
            }
        } else {
            return null;
        }
    }

    // Validate ranges
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;

    // Validate the actual date
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

    // Return normalized YYYY-MM-DD
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidDate(dateString) {
    return normalizeDate(dateString) !== null;
}

function validateTestData(test, rowIndex) {
    const errors = [];

    if (!isValidEmail(test.email)) {
        errors.push(`Row ${rowIndex}: Invalid email format "${test.email}"`);
    }

    if (!isValidDate(test.testingDate)) {
        errors.push(`Row ${rowIndex}: Invalid date "${test.testingDate}" (use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY)`);
    }

    if (test.eventName.length === 0) {
        errors.push(`Row ${rowIndex}: Event name cannot be empty`);
    }
    if (test.eventName.length > 200) {
        errors.push(`Row ${rowIndex}: Event name too long (max 200 characters)`);
    }

    if (isNaN(test.queueNumber) || test.queueNumber < 0) {
        errors.push(`Row ${rowIndex}: Invalid queue number "${test.queueNumber}"`);
    }
    if (test.queueNumber > 10000000) {
        errors.push(`Row ${rowIndex}: Queue number too large (max 10,000,000)`);
    }

    if (test.queueAnchor !== null) {
        if (isNaN(test.queueAnchor) || test.queueAnchor < 0) {
            errors.push(`Row ${rowIndex}: Invalid queue anchor "${test.queueAnchor}"`);
        }
        if (test.queueAnchor > 10000000) {
            errors.push(`Row ${rowIndex}: Queue anchor too large (max 10,000,000)`);
        }
        if (test.queueAnchor < test.queueNumber) {
            errors.push(`Row ${rowIndex}: Queue anchor (${test.queueAnchor}) cannot be less than queue number (${test.queueNumber})`);
        }
    }

    return errors;
}

function parseCSV(csvText) {
    const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        trimHeaders: true,
        transformHeader: (h) => h.trim()
    });

    if (parsed.errors.length > 0) {
        console.warn('CSV parsing warnings:', parsed.errors);
    }

    const headers = parsed.meta.fields || [];
    const required = ['Email', 'Testing Date', 'Event Name', 'Queue Number'];

    for (const req of required) {
        if (!headers.includes(req)) {
            throw new Error(`Missing required column: ${req}`);
        }
    }

    const tests = [];
    const validationErrors = [];
    let rowIndex = 2;

    for (const row of parsed.data) {
        if (!row.Email || !row['Testing Date'] || !row['Event Name'] || !row['Queue Number']) {
            rowIndex++;
            continue;
        }

        const rawDate = row['Testing Date'].trim();
        const normalizedDate = normalizeDate(rawDate) || rawDate;

        const test = {
            email: row.Email.trim(),
            testingDate: normalizedDate,
            eventName: row['Event Name'].trim(),
            queueNumber: parseInt(row['Queue Number']),
            queueAnchor: row['Queue Anchor'] ? parseInt(row['Queue Anchor']) : null
        };

        const errors = validateTestData(test, rowIndex);
        if (errors.length > 0) {
            validationErrors.push(...errors);
        } else {
            tests.push(test);
        }

        rowIndex++;
    }

    if (validationErrors.length > 0) {
        const errorMsg = validationErrors.slice(0, 10).join('\n');
        const remaining = validationErrors.length - 10;
        throw new Error(
            `Found ${validationErrors.length} validation error(s):\n\n${errorMsg}` +
            (remaining > 0 ? `\n\n...and ${remaining} more errors` : '')
        );
    }

    if (tests.length === 0) {
        throw new Error('No valid data rows found in CSV');
    }

    return tests;
}

function processNewTests(newTests) {
    const warnings = [];
    const events = {};

    newTests.forEach(test => {
        if (test.queueAnchor === null) {
            if (!events[test.eventName]) events[test.eventName] = [];
            events[test.eventName].push(test.queueNumber);
        }
    });

    for (const [event, nums] of Object.entries(events)) {
        const anchor = Math.ceil(Math.max(...nums) / 1000) * 1000;
        warnings.push(`No anchor for "${event}", using ${anchor.toLocaleString()}`);
        newTests.forEach(t => {
            if (t.eventName === event && t.queueAnchor === null) t.queueAnchor = anchor;
        });
    }

    allTests.push(...newTests);
    return warnings;
}

function recalculateAll() {
    const groups = {};
    allTests.forEach(t => {
        if (!groups[t.email]) groups[t.email] = [];
        groups[t.email].push(t);
    });

    for (const email in groups) {
        const tests = groups[email].sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
        tests.forEach((t, i) => {
            t.testingNum = i + 1;
            // Guard against division by zero
            t.queuePercent = (t.queueAnchor && t.queueAnchor > 0)
                ? (t.queueNumber / t.queueAnchor) * 100
                : 0;
            t.queueChangePercent = i > 0 ? t.queuePercent - tests[i-1].queuePercent : 0;
        });
    }
}

// Sorting
function updateSortIndicators() {
    document.querySelectorAll('.sortable-header').forEach(header => {
        const indicator = header.querySelector('.sort-indicator');
        if (header.dataset.sort === currentSort.field) {
            header.classList.add('active');
            indicator.textContent = currentSort.direction === 'asc' ? '\u25B2' : '\u25BC';
        } else {
            header.classList.remove('active');
            indicator.textContent = '';
        }
    });
}

function toggleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'desc';
    }
    visibleRowCount = INITIAL_ROW_LIMIT;
    renderTable();
}

// Table Rendering
function renderTable() {
    const data = getTableData();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    // Update compare button visibility
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
        compareBtn.style.display = compareMode ? 'none' : 'inline-flex';
    }

    if (data.length === 0) {
        let message = 'No data. Import CSV to start!';
        if (currentFilter === 'improving' || currentFilter === 'declining') {
            message = 'No results: Accounts need at least 2 tests to show improvement/decline.';
        } else if (currentFilter.startsWith('group:')) {
            message = 'No accounts in this group yet.';
        } else if (allTests.length > 0) {
            message = 'No accounts match this filter.';
        }

        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 7;
        cell.style.textAlign = 'center';
        cell.style.padding = '40px';
        cell.style.color = '#86868b';
        cell.textContent = message;
        updateStats([]);
        return;
    }

    // Sort data based on currentSort
    if (currentSort.field === 'email') {
        data.sort((a, b) => {
            const cmp = a.email.localeCompare(b.email);
            return currentSort.direction === 'asc' ? cmp : -cmp;
        });
    } else {
        // Default: sort by change %
        data.sort((a, b) => {
            const aChange = getOverallChange(a.email) || 0;
            const bChange = getOverallChange(b.email) || 0;
            return currentSort.direction === 'asc' ? aChange - bChange : bChange - aChange;
        });
    }

    // Update sort indicator in headers
    updateSortIndicators();

    const visibleData = data.slice(0, visibleRowCount);
    const hasMore = data.length > visibleRowCount;

    visibleData.forEach(account => {
        const row = tbody.insertRow();

        // Email cell
        const emailCell = row.insertCell();
        const emailDiv = document.createElement('div');
        emailDiv.className = 'email-cell';

        // Compare checkbox
        if (compareMode) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'compare-checkbox';
            cb.checked = selectedForCompare.has(account.email);
            cb.onchange = () => {
                if (cb.checked) {
                    selectedForCompare.add(account.email);
                } else {
                    selectedForCompare.delete(account.email);
                }
                updateCompareButton();
            };
            emailDiv.appendChild(cb);
        }

        const emailText = document.createElement('span');
        emailText.textContent = account.email;
        emailDiv.appendChild(emailText);

        // Group badge
        const groupName = getAccountGroup(account.email);
        if (groupName) {
            const groupBadge = document.createElement('span');
            groupBadge.className = 'badge group-badge';
            groupBadge.textContent = groupName;
            emailDiv.appendChild(groupBadge);
        }

        if (window.bestEmail && account.email === window.bestEmail) {
            const badge = document.createElement('span');
            badge.className = 'badge best';
            badge.textContent = 'Best';
            emailDiv.appendChild(badge);
        }

        if (hasJuice(account)) {
            const badge = document.createElement('span');
            badge.className = 'badge juice';
            badge.textContent = 'Juice';
            emailDiv.appendChild(badge);
        }

        const btn = document.createElement('button');
        btn.className = 'view-all-btn';
        btn.textContent = 'Timeline';
        btn.dataset.email = account.email;
        emailDiv.appendChild(btn);

        // Add to Group button
        const groupAddBtn = document.createElement('button');
        groupAddBtn.className = 'view-all-btn group-add-quick';
        groupAddBtn.textContent = groupName ? '\u270E' : '+';
        groupAddBtn.title = groupName ? 'Change group' : 'Add to group';
        groupAddBtn.dataset.email = account.email;
        groupAddBtn.onclick = (e) => {
            e.stopPropagation();
            showQuickGroupPicker(account.email);
        };
        emailDiv.appendChild(groupAddBtn);

        emailCell.appendChild(emailDiv);

        // Change cell
        const changeCell = row.insertCell();
        const change = getOverallChange(account.email);
        const span = document.createElement('span');
        span.className = 'change-cell ' + (change === null ? 'no-change' : change > 0 ? 'improved' : 'declined');
        span.textContent = change === null ? 'N/A' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
        changeCell.appendChild(span);

        // Test cells
        const recent = account.tests.slice(0, 5);
        for (let i = 0; i < 5; i++) {
            const cell = row.insertCell();
            if (i < recent.length) cell.appendChild(createTestCell(recent[i], account.email));
        }
    });

    if (hasMore) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 7;
        cell.style.textAlign = 'center';
        cell.style.padding = '20px';

        const remaining = data.length - visibleRowCount;
        const btn = document.createElement('button');
        btn.className = 'show-more-btn';
        btn.textContent = `Show ${Math.min(ROW_INCREMENT, remaining)} More (${remaining} remaining)`;
        btn.onclick = () => {
            visibleRowCount += ROW_INCREMENT;
            renderTable();
        };
        cell.appendChild(btn);
    }

    updateStats(allTests);

    if (data.length > INITIAL_ROW_LIMIT) {
        console.log(`Performance: Showing ${visibleData.length} of ${data.length} accounts`);
    }
}

function createTestCell(test, email) {
    const div = document.createElement('div');
    div.className = 'test-cell ' + getColorClass(test.queuePercent);
    div.style.minWidth = '100px';
    div.dataset.email = email;
    div.dataset.testData = JSON.stringify(test);

    const info = document.createElement('span');
    info.className = 'info-icon';
    info.textContent = 'i';
    div.appendChild(info);

    const nums = document.createElement('div');
    nums.className = 'queue-numbers';
    nums.textContent = formatNum(test.queueNumber) + '/' + formatNum(test.queueAnchor);
    div.appendChild(nums);

    const pct = document.createElement('div');
    pct.className = 'queue-percent';
    pct.textContent = test.queuePercent.toFixed(1) + '%';
    div.appendChild(pct);

    return div;
}

function getTableData() {
    const groups = {};
    allTests.forEach(t => {
        if (!groups[t.email]) groups[t.email] = [];
        groups[t.email].push(t);
    });

    const data = [];
    for (const email in groups) {
        const tests = groups[email].sort((a, b) => new Date(b.testingDate) - new Date(a.testingDate));
        if (shouldInclude(email, tests)) data.push({ email, tests });
    }
    return data;
}

function shouldInclude(email, tests) {
    const latest = tests[0];
    const change = getOverallChange(email);

    if (currentFilter.startsWith('search:')) {
        const query = currentFilter.replace('search:', '').toLowerCase();
        return email.toLowerCase().includes(query);
    }

    if (currentFilter.startsWith('group:')) {
        const groupName = currentFilter.replace('group:', '');
        return getAccountGroup(email) === groupName;
    }

    switch (currentFilter) {
        case 'instants': return latest.queuePercent <= 1;
        case 'juice': return latest.queuePercent <= settings.juicePercent && latest.queueAnchor >= settings.juiceAnchor;
        case 'excellent': return latest.queuePercent > 10 && latest.queuePercent <= 20;
        case 'improving': return change !== null && change > 0;
        case 'declining': return change !== null && change < 0;
        default: return true;
    }
}

// ============================
// ACCOUNT GROUPING
// ============================

function getAccountGroup(email) {
    if (!settings.groups) return null;
    for (const [groupName, emails] of Object.entries(settings.groups)) {
        if (emails.includes(email)) return groupName;
    }
    return null;
}

function showGroupManager() {
    const modal = document.getElementById('groupModal');
    modal.classList.add('visible');
    renderGroupList();
}

function closeGroupModal() {
    document.getElementById('groupModal').classList.remove('visible');
}

function renderGroupList() {
    const container = document.getElementById('groupList');
    container.innerHTML = '';

    if (!settings.groups || Object.keys(settings.groups).length === 0) {
        const empty = document.createElement('div');
        empty.className = 'group-empty';
        empty.textContent = 'No groups yet. Create one above!';
        container.appendChild(empty);
        return;
    }

    for (const [name, emails] of Object.entries(settings.groups)) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group-item';

        const header = document.createElement('div');
        header.className = 'group-item-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-item-name';
        nameSpan.textContent = name;
        header.appendChild(nameSpan);

        const countSpan = document.createElement('span');
        countSpan.className = 'group-item-count';
        countSpan.textContent = `${emails.length} account${emails.length !== 1 ? 's' : ''}`;
        header.appendChild(countSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'group-delete-btn';
        deleteBtn.textContent = '\u2715';
        deleteBtn.title = 'Delete group';
        deleteBtn.onclick = () => deleteGroup(name);
        header.appendChild(deleteBtn);

        groupDiv.appendChild(header);

        const emailList = document.createElement('div');
        emailList.className = 'group-email-list';
        emails.forEach(email => {
            const emailRow = document.createElement('div');
            emailRow.className = 'group-email-row';

            const emailSpan = document.createElement('span');
            emailSpan.textContent = email;
            emailRow.appendChild(emailSpan);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'group-email-remove';
            removeBtn.textContent = '\u2715';
            removeBtn.onclick = () => removeFromGroup(name, email);
            emailRow.appendChild(removeBtn);

            emailList.appendChild(emailRow);
        });
        groupDiv.appendChild(emailList);

        // Add account input
        const addRow = document.createElement('div');
        addRow.className = 'group-add-row';
        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.placeholder = 'Add email to group...';
        addInput.className = 'group-add-input';

        const addBtn = document.createElement('button');
        addBtn.className = 'group-add-btn';
        addBtn.textContent = 'Add';
        addBtn.onclick = () => {
            const email = addInput.value.trim();
            if (email) {
                addToGroup(name, email);
                addInput.value = '';
            }
        };
        addInput.onkeydown = (e) => {
            if (e.key === 'Enter') addBtn.click();
        };
        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);
        groupDiv.appendChild(addRow);

        container.appendChild(groupDiv);
    }

    // Update filter chips for groups
    renderGroupFilterChips();
}

function createGroup() {
    const input = document.getElementById('newGroupName');
    const name = input.value.trim();
    if (!name) {
        showToast('Enter a group name', 'error');
        return;
    }
    if (!settings.groups) settings.groups = {};
    if (settings.groups[name]) {
        showToast('Group already exists', 'error');
        return;
    }
    settings.groups[name] = [];
    saveSettings();
    renderGroupList();
    input.value = '';
    showToast(`Group "${name}" created`, 'success');
}

function deleteGroup(name) {
    delete settings.groups[name];
    saveSettings();
    renderGroupList();
    if (currentFilter === 'group:' + name) {
        currentFilter = 'all';
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');
        renderTable();
    }
    showToast(`Group "${name}" deleted`, 'success');
}

function addToGroup(groupName, email) {
    // Check if email exists in data
    const exists = allTests.some(t => t.email === email);
    if (!exists) {
        showToast(`Email "${email}" not found in your data`, 'error');
        return;
    }

    // Remove from other groups first
    for (const [name, emails] of Object.entries(settings.groups)) {
        const idx = emails.indexOf(email);
        if (idx !== -1) emails.splice(idx, 1);
    }

    if (!settings.groups[groupName].includes(email)) {
        settings.groups[groupName].push(email);
    }
    saveSettings();
    renderGroupList();
    renderTable();
}

function removeFromGroup(groupName, email) {
    const idx = settings.groups[groupName].indexOf(email);
    if (idx !== -1) {
        settings.groups[groupName].splice(idx, 1);
        saveSettings();
        renderGroupList();
        renderTable();
    }
}

function showQuickGroupPicker(email) {
    const currentGroup = getAccountGroup(email);

    // Create a quick picker dropdown
    const existingPicker = document.getElementById('quickGroupPicker');
    if (existingPicker) existingPicker.remove();

    const picker = document.createElement('div');
    picker.id = 'quickGroupPicker';
    picker.className = 'quick-group-picker';

    const title = document.createElement('div');
    title.className = 'quick-group-title';
    title.textContent = currentGroup ? `In group: ${currentGroup}` : 'Add to group';
    picker.appendChild(title);

    // Create group buttons
    const groups = Object.keys(settings.groups || {});
    if (groups.length === 0) {
        const noGroups = document.createElement('div');
        noGroups.className = 'quick-group-empty';
        noGroups.textContent = 'No groups yet. Create one in Groups manager.';
        picker.appendChild(noGroups);
    } else {
        groups.forEach(groupName => {
            const groupBtn = document.createElement('button');
            groupBtn.className = 'quick-group-option' + (currentGroup === groupName ? ' active' : '');
            groupBtn.textContent = groupName;
            groupBtn.onclick = () => {
                addToGroup(groupName, email);
                picker.remove();
            };
            picker.appendChild(groupBtn);
        });
    }

    // Remove from group button
    if (currentGroup) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'quick-group-option remove';
        removeBtn.textContent = 'Remove from group';
        removeBtn.onclick = () => {
            removeFromGroup(currentGroup, email);
            picker.remove();
        };
        picker.appendChild(removeBtn);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'quick-group-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = () => picker.remove();
    picker.appendChild(closeBtn);

    document.body.appendChild(picker);

    // Position near the clicked button
    const targetBtn = document.querySelector(`.group-add-quick[data-email="${email}"]`);
    if (targetBtn) {
        const rect = targetBtn.getBoundingClientRect();
        picker.style.top = rect.bottom + 5 + 'px';
        picker.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    }

    // Close when clicking outside
    const closeHandler = (e) => {
        if (!picker.contains(e.target) && e.target !== targetBtn) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

function renderGroupFilterChips() {
    // Remove existing group chips
    document.querySelectorAll('.filter-chip.group-chip').forEach(c => c.remove());

    if (!settings.groups) return;

    const chipContainer = document.querySelector('.filter-chips');
    for (const name of Object.keys(settings.groups)) {
        if (settings.groups[name].length === 0) continue;
        const chip = document.createElement('button');
        chip.className = 'filter-chip group-chip';
        chip.dataset.filter = 'group:' + name;
        chip.textContent = name;
        if (currentFilter === 'group:' + name) chip.classList.add('active');
        chip.onclick = () => {
            currentFilter = 'group:' + name;
            visibleRowCount = INITIAL_ROW_LIMIT;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            showLoadingState();
            requestAnimationFrame(() => {
                renderTable();
                hideLoadingState();
            });
        };
        chipContainer.appendChild(chip);
    }
}

// ============================
// MULTI-ACCOUNT COMPARISON
// ============================

function toggleCompareMode() {
    compareMode = !compareMode;
    selectedForCompare.clear();

    const compareBtn = document.getElementById('compareBtn');
    const compareActions = document.getElementById('compareActions');

    if (compareMode) {
        compareBtn.style.display = 'none';
        compareActions.style.display = 'flex';
    } else {
        compareBtn.style.display = 'inline-flex';
        compareActions.style.display = 'none';
    }

    renderTable();
}

function updateCompareButton() {
    const runBtn = document.getElementById('runCompareBtn');
    if (runBtn) {
        runBtn.disabled = selectedForCompare.size < 2;
        runBtn.textContent = `Compare (${selectedForCompare.size})`;
    }
}

function cancelCompare() {
    compareMode = false;
    selectedForCompare.clear();
    document.getElementById('compareBtn').style.display = 'inline-flex';
    document.getElementById('compareActions').style.display = 'none';
    renderTable();
}

function runComparison() {
    if (selectedForCompare.size < 2) {
        showToast('Select at least 2 accounts to compare', 'error');
        return;
    }

    // Show loading overlay
    showLoadingOverlay('Generating comparison...');

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
        showComparisonView(Array.from(selectedForCompare));
        hideLoadingOverlay();
    }, 100);
}

function showComparisonView(emails) {
    compareMode = false;
    document.getElementById('compareBtn').style.display = 'inline-flex';
    document.getElementById('compareActions').style.display = 'none';

    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('timelinePage').style.display = 'none';
    document.getElementById('comparisonPage').style.display = 'block';
    document.getElementById('backBtn').style.display = 'flex';
    document.getElementById('searchWrapper').style.display = 'none';
    document.getElementById('importBtn').style.display = 'none';

    const container = document.getElementById('comparisonContent');
    container.innerHTML = '';

    // Colors for each account line
    const colors = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00'];

    // Build comparison stats table
    const statsTable = document.createElement('div');
    statsTable.className = 'comparison-table';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.className = 'comparison-header-row';
    const headerLabels = ['Account', 'Tests', 'Best %', 'Worst %', 'Average %', 'Latest %', 'Change %'];
    headerLabels.forEach(label => {
        const cell = document.createElement('div');
        cell.className = 'comparison-header-cell';
        cell.textContent = label;
        headerRow.appendChild(cell);
    });
    statsTable.appendChild(headerRow);

    const accountData = [];

    emails.forEach((email, idx) => {
        const tests = allTests.filter(t => t.email === email).sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
        if (tests.length === 0) return;

        const pcts = tests.map(t => t.queuePercent);
        const best = Math.min(...pcts);
        const worst = Math.max(...pcts);
        const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
        const latest = pcts[pcts.length - 1];
        const change = getOverallChange(email);

        accountData.push({ email, tests, color: colors[idx % colors.length] });

        const row = document.createElement('div');
        row.className = 'comparison-data-row';

        const colorDot = document.createElement('span');
        colorDot.className = 'comparison-color-dot';
        colorDot.style.backgroundColor = colors[idx % colors.length];

        const emailCell = document.createElement('div');
        emailCell.className = 'comparison-cell comparison-email';
        emailCell.appendChild(colorDot);
        const emailSpan = document.createElement('span');
        emailSpan.textContent = email;
        emailCell.appendChild(emailSpan);
        row.appendChild(emailCell);

        const values = [
            tests.length.toString(),
            best.toFixed(1) + '%',
            worst.toFixed(1) + '%',
            avg.toFixed(1) + '%',
            latest.toFixed(1) + '%',
            change !== null ? (change >= 0 ? '+' : '') + change.toFixed(1) + '%' : 'N/A'
        ];

        values.forEach((val, vi) => {
            const cell = document.createElement('div');
            cell.className = 'comparison-cell';
            if (vi === 5) { // change column
                cell.classList.add(change === null ? 'no-change' : change > 0 ? 'improved' : 'declined');
            }
            cell.textContent = val;
            row.appendChild(cell);
        });

        statsTable.appendChild(row);
    });

    container.appendChild(statsTable);

    // Comparison graph
    const graphTitle = document.createElement('div');
    graphTitle.className = 'comparison-graph-title';
    graphTitle.textContent = 'Position Over Time';
    container.appendChild(graphTitle);

    const graphWrapper = document.createElement('div');
    graphWrapper.className = 'comparison-graph-wrapper';

    // Build SVG overlay graph
    const graphCanvas = document.createElement('div');
    graphCanvas.className = 'comparison-graph-canvas';

    // Y-axis
    const yAxis = document.createElement('div');
    yAxis.className = 'y-axis';
    [0, 25, 50, 75, 100].forEach(v => {
        const lbl = document.createElement('div');
        lbl.className = 'y-label';
        lbl.textContent = v + '%';
        yAxis.appendChild(lbl);
    });
    graphCanvas.appendChild(yAxis);

    // Grid
    const gridLines = document.createElement('div');
    gridLines.className = 'grid-lines';
    [0, 25, 50, 75, 100].forEach(v => {
        const line = document.createElement('div');
        line.className = 'grid-line';
        line.style.top = v + '%';
        gridLines.appendChild(line);
    });
    graphCanvas.appendChild(gridLines);

    // Graph area with SVG
    const graphArea = document.createElement('div');
    graphArea.className = 'graph-area';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');

    accountData.forEach(({ tests, color }) => {
        if (tests.length < 2) return;
        const displayTests = downsampleData(tests, 150);
        const xStep = 100 / (displayTests.length - 1 || 1);
        const points = displayTests.map((t, i) => `${i * xStep},${t.queuePercent}`).join(' ');

        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', color);
        polyline.setAttribute('stroke-width', '2.5');
        polyline.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(polyline);
    });

    graphArea.appendChild(svg);
    graphCanvas.appendChild(graphArea);

    graphWrapper.appendChild(graphCanvas);
    container.appendChild(graphWrapper);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'comparison-legend';
    accountData.forEach(({ email, color }) => {
        const item = document.createElement('div');
        item.className = 'comparison-legend-item';
        const dot = document.createElement('span');
        dot.className = 'comparison-color-dot';
        dot.style.backgroundColor = color;
        item.appendChild(dot);
        const label = document.createElement('span');
        label.textContent = email;
        item.appendChild(label);
        legend.appendChild(item);
    });
    container.appendChild(legend);
}

function hideComparisonView() {
    document.getElementById('comparisonPage').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('searchWrapper').style.display = 'flex';
    document.getElementById('importBtn').style.display = 'block';
    selectedForCompare.clear();
}

// ============================
// HELP SYSTEM
// ============================

function showHelp() {
    document.getElementById('helpModal').classList.add('visible');
}

function closeHelpModal() {
    document.getElementById('helpModal').classList.remove('visible');
}

// Timeline
function showTimeline(email) {
    const tests = allTests.filter(t => t.email === email).sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
    if (tests.length === 0) return;

    document.getElementById('timelineEmail').textContent = email;
    document.getElementById('timelineSubtitle').textContent = `${tests.length} total tests`;

    const pcts = tests.map(t => t.queuePercent);
    document.getElementById('timelineBest').textContent = Math.min(...pcts).toFixed(1) + '%';
    document.getElementById('timelineWorst').textContent = Math.max(...pcts).toFixed(1) + '%';
    document.getElementById('timelineAvg').textContent = (pcts.reduce((a,b) => a+b, 0) / pcts.length).toFixed(1) + '%';
    document.getElementById('timelineTotal').textContent = tests.length;

    renderGraph(tests);

    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('comparisonPage').style.display = 'none';
    document.getElementById('timelinePage').style.display = 'block';
    document.getElementById('backBtn').style.display = 'flex';
    document.getElementById('searchWrapper').style.display = 'none';
    document.getElementById('importBtn').style.display = 'none';
}

function hideTimeline() {
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('timelinePage').style.display = 'none';
    document.getElementById('comparisonPage').style.display = 'none';
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('searchWrapper').style.display = 'flex';
    document.getElementById('importBtn').style.display = 'block';
}

function downsampleData(tests, maxPoints = 100) {
    if (tests.length <= maxPoints) return tests;
    const result = [tests[0]];
    const step = (tests.length - 1) / (maxPoints - 1);
    for (let i = 1; i < maxPoints - 1; i++) {
        const idx = Math.round(i * step);
        result.push(tests[idx]);
    }
    result.push(tests[tests.length - 1]);
    return result;
}

function renderGraph(tests) {
    const area = document.getElementById('graphArea');
    const svg = area.querySelector('svg');

    area.querySelectorAll('.graph-point').forEach(p => p.remove());

    const maxPoints = 150;
    const displayTests = downsampleData(tests, maxPoints);

    const xStep = 100 / (displayTests.length - 1 || 1);
    const points = displayTests.map((t, i) => ({ x: i * xStep, y: t.queuePercent, test: t }));

    const line = document.getElementById('graphLine');
    line.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));

    points.forEach((p, i) => {
        const el = document.createElement('div');
        el.className = 'graph-point';
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        el.dataset.test = p.test.testingNum;
        el.dataset.date = formatDate(p.test.testingDate);
        el.dataset.percent = p.test.queuePercent.toFixed(1);
        el.dataset.queue = formatNum(p.test.queueNumber) + '/' + formatNum(p.test.queueAnchor);
        el.dataset.change = i > 0 ? (p.test.queuePercent - displayTests[i-1].queuePercent).toFixed(1) : '0';
        el.onmouseenter = showTooltip;
        el.onmouseleave = hideTooltip;
        area.appendChild(el);
    });

    const xAxis = document.getElementById('xAxis');
    xAxis.innerHTML = '';
    const step = Math.max(1, Math.floor(tests.length / 5));
    tests.forEach((t, i) => {
        if (i % step === 0 || i === tests.length - 1) {
            const lbl = document.createElement('div');
            lbl.className = 'x-label';
            lbl.textContent = formatDate(t.testingDate);
            lbl.style.left = ((i / (tests.length - 1)) * 100) + '%';
            xAxis.appendChild(lbl);
        }
    });

    if (tests.length > maxPoints) {
        console.log(`Graph downsampled: showing ${displayTests.length} of ${tests.length} data points for performance`);
    }
}

function showTooltip(e) {
    const tt = document.getElementById('pointTooltip');
    document.getElementById('tooltipTest').textContent = e.target.dataset.test;
    document.getElementById('tooltipDate').textContent = e.target.dataset.date;
    document.getElementById('tooltipQueue').textContent = e.target.dataset.queue;
    document.getElementById('tooltipPercent').textContent = e.target.dataset.percent + '%';
    document.getElementById('tooltipChange').textContent = (parseFloat(e.target.dataset.change) >= 0 ? '+' : '') + e.target.dataset.change + '%';
    tt.classList.add('visible');

    const rect = e.target.getBoundingClientRect();
    const ttWidth = tt.offsetWidth;
    const ttHeight = tt.offsetHeight;

    // Keep tooltip within viewport
    let left = rect.left;
    let top = rect.top - ttHeight - 10;

    if (left + ttWidth > window.innerWidth) {
        left = window.innerWidth - ttWidth - 10;
    }
    if (left < 10) left = 10;
    if (top < 10) {
        top = rect.bottom + 10;
    }

    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
}

function hideTooltip() {
    document.getElementById('pointTooltip').classList.remove('visible');
}

// Helpers
function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return n.toString();
}

function formatDate(d) {
    const date = new Date(d);
    return (date.getMonth() + 1).toString().padStart(2, '0') + '/' + date.getDate().toString().padStart(2, '0');
}

function formatDateLong(d) {
    const date = new Date(d);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const day = date.getDate();
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st' :
                   (day === 2 || day === 22) ? 'nd' :
                   (day === 3 || day === 23) ? 'rd' : 'th';
    return `${months[date.getMonth()]} ${day}${suffix}, ${date.getFullYear()}`;
}

function getColorClass(p) {
    const ranges = settings.colorRanges || { instants: 1, juice: 10, excellent: 20, good: 40, neutral: 60 };
    if (p <= ranges.instants) return 'instants';
    if (p <= ranges.juice) return 'juice';
    if (p <= ranges.excellent) return 'excellent';
    if (p <= ranges.good) return 'good';
    if (p <= ranges.neutral) return 'neutral';
    return 'poor';
}

function hasJuice(account) {
    const latest = account.tests[0];
    return latest.queuePercent <= settings.juicePercent && latest.queueAnchor >= settings.juiceAnchor;
}

function getOverallChange(email) {
    const tests = allTests.filter(t => t.email === email).sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
    if (tests.length < 2) return null;
    return tests[tests.length - 2].queuePercent - tests[tests.length - 1].queuePercent;
}

function updateStats(tests) {
    const emails = new Set(tests.map(t => t.email));
    document.getElementById('totalAccounts').textContent = emails.size;

    // Update data stats in settings
    const dataStats = document.getElementById('dataStats');
    if (dataStats) {
        dataStats.textContent = `${emails.size} account${emails.size !== 1 ? 's' : ''}, ${tests.length} test${tests.length !== 1 ? 's' : ''}`;
    }

    // Update tools bar stats
    updateToolsStats();

    if (tests.length > 0) {
        const bestPercent = Math.min(...tests.map(t => t.queuePercent));
        document.getElementById('bestPosition').textContent = bestPercent.toFixed(1) + '%';
        const bestTest = tests.find(t => t.queuePercent === bestPercent);
        if (bestTest) {
            window.bestEmail = bestTest.email;
        }
    } else {
        document.getElementById('bestPosition').textContent = '\u2014';
        window.bestEmail = null;
    }
}

function scrollToBestPosition() {
    if (!window.bestEmail) return;

    // First, find the index of best email in the current sorted data
    const data = getTableData();
    data.sort((a, b) => (getOverallChange(b.email) || 0) - (getOverallChange(a.email) || 0));

    const bestIndex = data.findIndex(account => account.email === window.bestEmail);

    if (bestIndex === -1) {
        showToast('Best position account not found in current filter', 'error');
        return;
    }

    // If the best email is beyond visible rows, expand and re-render
    if (bestIndex >= visibleRowCount) {
        visibleRowCount = bestIndex + 10; // Show a few more rows past the target
        renderTable();
    }

    // Now find and scroll to the row
    setTimeout(() => {
        const rows = document.querySelectorAll('#tableBody tr');
        let targetRow = null;

        rows.forEach(row => {
            const emailCell = row.querySelector('.email-cell');
            if (emailCell) {
                // Match against the email span text, not the full cell (which includes badge text)
                const emailSpan = emailCell.querySelector('span:not(.badge)');
                if (emailSpan && emailSpan.textContent.trim() === window.bestEmail) {
                    targetRow = row;
                }
            }
        });

        if (targetRow) {
            const tableContainer = document.querySelector('.table-container');
            const rowTop = targetRow.offsetTop;
            const containerHeight = tableContainer.clientHeight;
            const rowHeight = targetRow.clientHeight;

            tableContainer.scrollTo({
                top: rowTop - (containerHeight / 2) + (rowHeight / 2),
                behavior: 'smooth'
            });

            targetRow.classList.add('highlight');
            setTimeout(() => {
                targetRow.classList.remove('highlight');
            }, 2000);
        } else {
            showToast('Could not locate best position row', 'error');
        }
    }, 100);
}

function showTestDetails(test, email) {
    const allEmail = allTests.filter(t => t.email === email).sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
    const idx = allEmail.findIndex(t => t.testingDate === test.testingDate && t.queueNumber === test.queueNumber);
    const prev = idx > 0 ? allEmail[idx - 1] : null;
    const change = prev ? (test.queuePercent - prev.queuePercent).toFixed(2) : null;
    const days = Math.floor((new Date() - new Date(test.testingDate)) / 86400000);

    // Populate modal safely using textContent (no innerHTML XSS)
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = '';

    const details = [
        { label: 'Email', value: email },
        { label: 'Event', value: test.eventName },
        { label: 'Test #', value: String(test.testingNum) },
        { label: 'Date', value: formatDateLong(test.testingDate) },
        { label: 'Queue', value: formatNum(test.queueNumber) + '/' + formatNum(test.queueAnchor) },
        { label: 'Queue %', value: test.queuePercent.toFixed(2) + '%' },
        { label: 'Change', value: change !== null ? (change >= 0 ? '+' : '') + change + '%' : 'N/A' },
        { label: 'Days Since', value: days + ' days' }
    ];

    details.forEach(d => {
        const row = document.createElement('div');
        row.className = 'modal-detail-row';

        const label = document.createElement('span');
        label.className = 'modal-detail-label';
        label.textContent = d.label;
        row.appendChild(label);

        const value = document.createElement('span');
        value.className = 'modal-detail-value';
        value.textContent = d.value;
        row.appendChild(value);

        modalBody.appendChild(row);
    });

    const modal = document.getElementById('testModal');
    modal.classList.add('visible');
}

function closeTestModal() {
    document.getElementById('testModal').classList.remove('visible');
}

// Loading State Helpers
function showLoadingState() {
    const tbody = document.getElementById('tableBody');
    tbody.style.opacity = '0.5';
    tbody.style.pointerEvents = 'none';
}

function hideLoadingState() {
    const tbody = document.getElementById('tableBody');
    tbody.style.opacity = '1';
    tbody.style.pointerEvents = 'auto';
}

// Event Listeners
function setupEventListeners() {
    const tableBody = document.getElementById('tableBody');
    tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-all-btn')) {
            const email = e.target.dataset.email;
            if (email) showTimeline(email);
        }

        const testCell = e.target.closest('.test-cell');
        if (testCell && testCell.dataset.testData) {
            try {
                const test = JSON.parse(testCell.dataset.testData);
                const email = testCell.dataset.email;
                showTestDetails(test, email);
            } catch (err) {
                console.error('Error parsing test data:', err);
            }
        }
    });

    const bestCard = document.getElementById('bestPositionCard');
    if (bestCard) {
        bestCard.onclick = scrollToBestPosition;
    }

    document.getElementById('lightBtn').onclick = () => {
        document.body.classList.remove('dark');
        document.getElementById('lightBtn').classList.add('active');
        document.getElementById('darkBtn').classList.remove('active');
        settings.darkMode = false;
        saveSettings();
    };

    document.getElementById('darkBtn').onclick = () => {
        document.body.classList.add('dark');
        document.getElementById('darkBtn').classList.add('active');
        document.getElementById('lightBtn').classList.remove('active');
        settings.darkMode = true;
        saveSettings();
    };

    // Sidebar Navigation
    const navHome = document.getElementById('navHome');
    if (navHome) {
        navHome.onclick = () => navigateTo('home');
    }
    const navSettings = document.getElementById('navSettings');
    if (navSettings) {
        navSettings.onclick = () => navigateTo('settings');
    }

    document.getElementById('importBtn').onclick = importCSV;
    document.getElementById('backBtn').onclick = () => {
        if (document.getElementById('comparisonPage').style.display === 'block') {
            hideComparisonView();
        } else {
            hideTimeline();
        }
    };
    document.getElementById('undoBtn').onclick = undo;
    document.getElementById('redoBtn').onclick = redo;

    // Help button
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) helpBtn.onclick = showHelp;

    // Modal overlay click handlers (close when clicking outside content)
    document.getElementById('testModal').onclick = (e) => {
        if (e.target.id === 'testModal') closeTestModal();
    };
    document.getElementById('groupModal').onclick = (e) => {
        if (e.target.id === 'groupModal') closeGroupModal();
    };
    document.getElementById('helpModal').onclick = (e) => {
        if (e.target.id === 'helpModal') closeHelpModal();
    };
    document.getElementById('confirmModal').onclick = (e) => {
        if (e.target.id === 'confirmModal') closeConfirmModal();
    };
    document.getElementById('importHistoryModal').onclick = (e) => {
        if (e.target.id === 'importHistoryModal') closeImportHistoryModal();
    };

    // Modal close button handlers (ensure they work)
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('visible');
        };
    });

    // Compare buttons
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) compareBtn.onclick = toggleCompareMode;

    const cancelCompareBtn = document.getElementById('cancelCompareBtn');
    if (cancelCompareBtn) cancelCompareBtn.onclick = cancelCompare;

    const runCompareBtn = document.getElementById('runCompareBtn');
    if (runCompareBtn) runCompareBtn.onclick = runComparison;

    // Group manager
    const groupBtn = document.getElementById('groupBtn');
    if (groupBtn) groupBtn.onclick = showGroupManager;

    const createGroupBtn = document.getElementById('createGroupBtn');
    if (createGroupBtn) createGroupBtn.onclick = createGroup;

    const newGroupInput = document.getElementById('newGroupName');
    if (newGroupInput) {
        newGroupInput.onkeydown = (e) => {
            if (e.key === 'Enter') createGroup();
        };
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.onclick = () => {
            currentFilter = chip.dataset.filter;
            visibleRowCount = INITIAL_ROW_LIMIT;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            showLoadingState();
            requestAnimationFrame(() => {
                renderTable();
                hideLoadingState();
            });
        };
    });

    // Debounced search
    let searchTimeout;
    document.getElementById('searchInput').oninput = (e) => {
        const query = e.target.value.toLowerCase();
        clearTimeout(searchTimeout);

        if (query) {
            currentFilter = 'search:' + query;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        } else {
            currentFilter = 'all';
            document.querySelectorAll('.filter-chip')[0].classList.add('active');
        }

        visibleRowCount = INITIAL_ROW_LIMIT;
        showLoadingState();
        searchTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                renderTable();
                hideLoadingState();
            });
        }, 300);
    };

    // Settings with bounds validation
    document.getElementById('juicePercent').onchange = async (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        if (val > 100) val = 100;
        e.target.value = val;
        settings.juicePercent = val;
        await saveSettings();
        showToast('Juice threshold updated', 'success');
        renderTable();
    };

    document.getElementById('juiceAnchor').onchange = async (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        if (val > 10000000) val = 10000000;
        e.target.value = val;
        settings.juiceAnchor = val;
        await saveSettings();
        showToast('Juice anchor updated', 'success');
        renderTable();
    };

    // Row size selector
    const rowSizeSelect = document.getElementById('rowSizeSelect');
    if (rowSizeSelect) {
        rowSizeSelect.onchange = async (e) => {
            settings.rowSize = e.target.value;
            applyRowSize();
            await saveSettings();
            showToast(`Row size set to ${ROW_SIZES[settings.rowSize].label}`, 'success');
        };
    }

    // Color range inputs
    const colorRangeKeys = ['instants', 'juice', 'excellent', 'good', 'neutral'];
    colorRangeKeys.forEach(key => {
        const inputId = `color${key.charAt(0).toUpperCase() + key.slice(1)}`;
        const input = document.getElementById(inputId);
        if (input) {
            input.onchange = async (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                if (val > 100) val = 100;
                e.target.value = val;
                settings.colorRanges[key] = val;
                await saveSettings();
                renderTable();
                showToast('Color range updated', 'success');
            };
        }
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            importCSV();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            navigateTo(currentPage === 'settings' ? 'home' : 'settings');
        }
        if (e.key === 'Escape') {
            if (document.getElementById('confirmModal').classList.contains('visible')) {
                closeConfirmModal();
            } else if (document.getElementById('importHistoryModal').classList.contains('visible')) {
                closeImportHistoryModal();
            } else if (document.getElementById('helpModal').classList.contains('visible')) {
                closeHelpModal();
            } else if (document.getElementById('groupModal').classList.contains('visible')) {
                closeGroupModal();
            } else if (currentPage === 'settings') {
                navigateTo('home');
            } else if (document.getElementById('comparisonPage').style.display === 'block') {
                hideComparisonView();
            } else if (document.getElementById('timelinePage').style.display === 'block') {
                hideTimeline();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
    });

    // Render group filter chips on startup
    renderGroupFilterChips();

    // Sortable column headers
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.onclick = () => {
            const field = header.dataset.sort;
            if (field) toggleSort(field);
        };
    });
}
