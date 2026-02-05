const { ipcRenderer } = require('electron');

// State
let allTests = [];
let settings = { juicePercent: 10, juiceAnchor: 50000, darkMode: false };
let currentFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadSettings();
        await loadData();
        setupEventListeners();
        renderTable();
    } catch (error) {
        showToast('Failed to initialize app: ' + error.message, 'error');
        console.error('Init error:', error);
    } finally {
        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loadingScreen').classList.add('hidden');
        }, 500);
    }
});

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = type === 'error' ? 'error-toast' : 'success-toast';
    toast.innerHTML = `
        ${message}
        <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Settings
async function loadSettings() {
    const result = await ipcRenderer.invoke('load-settings');
    if (result.success && result.data) {
        settings = result.data;
        document.getElementById('juicePercent').value = settings.juicePercent;
        document.getElementById('juiceAnchor').value = settings.juiceAnchor;
        if (settings.darkMode) {
            document.body.classList.add('dark');
            document.getElementById('darkBtn').classList.add('active');
            document.getElementById('lightBtn').classList.remove('active');
        }
    }
}

async function saveSettings() {
    await ipcRenderer.invoke('save-settings', settings);
}

// Data Management
async function loadData() {
    const result = await ipcRenderer.invoke('load-data');
    if (result.success && result.data) {
        allTests = result.data;
        recalculateAll();
    }
}

async function saveData() {
    await ipcRenderer.invoke('save-data', allTests);
}

// CSV Import
async function importCSV() {
    try {
        const filePath = await ipcRenderer.invoke('select-csv-file');
        if (!filePath) return;

        // Show loading
        const loadingToast = showToast('Importing CSV...', 'info');

        const result = await ipcRenderer.invoke('read-csv-file', filePath);
        if (!result.success) {
            showToast(`Error reading file: ${result.error}`, 'error');
            return;
        }

        const tests = parseCSV(result.data);
        if (tests.length === 0) {
            showToast('No valid data found in CSV', 'error');
            return;
        }

        const warnings = processNewTests(tests);
        recalculateAll();
        await saveData();
        renderTable();

        let msg = `✓ Successfully imported ${tests.length} test${tests.length > 1 ? 's' : ''}!`;
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

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const required = ['Email', 'Testing Date', 'Event Name', 'Queue Number'];
    for (const req of required) {
        if (!headers.includes(req)) throw new Error(`Missing column: ${req}`);
    }

    const tests = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 4) continue;

        tests.push({
            email: values[headers.indexOf('Email')],
            testingDate: values[headers.indexOf('Testing Date')],
            eventName: values[headers.indexOf('Event Name')],
            queueNumber: parseInt(values[headers.indexOf('Queue Number')]),
            queueAnchor: headers.includes('Queue Anchor') && values[headers.indexOf('Queue Anchor')] 
                ? parseInt(values[headers.indexOf('Queue Anchor')]) : null
        });
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
        warnings.push(`⚠ No anchor for "${event}", using ${anchor.toLocaleString()}`);
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
            t.queuePercent = (t.queueNumber / t.queueAnchor) * 100;
            t.queueChangePercent = i > 0 ? t.queuePercent - tests[i-1].queuePercent : 0;
        });
    }
}

// Table Rendering
function renderTable() {
    const data = getTableData();
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        // Show specific message based on filter
        let message = 'No data. Import CSV to start!';
        if (currentFilter === 'improving' || currentFilter === 'declining') {
            message = '⚠️ No results: Accounts need at least 2 tests to show improvement/decline.';
        } else if (allTests.length > 0) {
            message = 'No accounts match this filter.';
        }
        
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#86868b;">${message}</td></tr>`;
        updateStats([]);
        return;
    }

    data.sort((a, b) => (getOverallChange(b.email) || 0) - (getOverallChange(a.email) || 0));

    data.forEach(account => {
        const row = tbody.insertRow();
        
        // Email cell
        const emailCell = row.insertCell();
        const emailDiv = document.createElement('div');
        emailDiv.className = 'email-cell';
        emailDiv.textContent = account.email;
        
        // Add best position diamond
        if (window.bestEmail && account.email === window.bestEmail) {
            const badge = document.createElement('span');
            badge.className = 'badge best';
            badge.textContent = '💎 Best';
            emailDiv.appendChild(badge);
        }
        
        if (hasJuice(account)) {
            const badge = document.createElement('span');
            badge.className = 'badge juice';
            badge.textContent = '🔥 Juice';
            emailDiv.appendChild(badge);
        }
        
        const btn = document.createElement('button');
        btn.className = 'view-all-btn';
        btn.textContent = 'View All';
        btn.onclick = () => showTimeline(account.email);
        emailDiv.appendChild(btn);
        
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

    updateStats(allTests);
}

function createTestCell(test, email) {
    const div = document.createElement('div');
    div.className = 'test-cell ' + getColorClass(test.queuePercent);
    div.style.minWidth = '100px';
    div.onclick = () => showTestDetails(test, email);
    
    const info = document.createElement('span');
    info.className = 'info-icon';
    info.textContent = 'ℹ️';
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
    
    // Handle search filter
    if (currentFilter.startsWith('search:')) {
        const query = currentFilter.replace('search:', '').toLowerCase();
        return email.toLowerCase().includes(query);
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
    document.getElementById('timelinePage').style.display = 'block';
    document.getElementById('backBtn').style.display = 'flex';
    document.getElementById('searchWrapper').style.display = 'none';
    document.getElementById('importBtn').style.display = 'none';
}

function hideTimeline() {
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('timelinePage').style.display = 'none';
    document.getElementById('backBtn').style.display = 'none';
    document.getElementById('searchWrapper').style.display = 'flex';
    document.getElementById('importBtn').style.display = 'block';
}

function renderGraph(tests) {
    const area = document.getElementById('graphArea');
    const svg = area.querySelector('svg');
    
    // Clear points
    area.querySelectorAll('.graph-point').forEach(p => p.remove());

    // Calculate positions
    const xStep = 100 / (tests.length - 1 || 1);
    const points = tests.map((t, i) => ({ x: i * xStep, y: t.queuePercent, test: t }));

    // Update line
    const line = document.getElementById('graphLine');
    line.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));

    // Create point elements
    points.forEach((p, i) => {
        const el = document.createElement('div');
        el.className = 'graph-point';
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        el.dataset.test = p.test.testingNum;
        el.dataset.date = formatDate(p.test.testingDate);
        el.dataset.percent = p.test.queuePercent.toFixed(1);
        el.dataset.queue = formatNum(p.test.queueNumber) + '/' + formatNum(p.test.queueAnchor);
        el.dataset.change = i > 0 ? (p.test.queuePercent - tests[i-1].queuePercent).toFixed(1) : '0';
        el.onmouseenter = showTooltip;
        el.onmouseleave = hideTooltip;
        area.appendChild(el);
    });

    // Update X-axis
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
    tt.style.left = rect.left + 'px';
    tt.style.top = (rect.top - tt.offsetHeight - 10) + 'px';
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

function getColorClass(p) {
    if (p <= 1) return 'instants';
    if (p <= 10) return 'juice';
    if (p <= 20) return 'excellent';
    if (p <= 40) return 'good';
    if (p <= 60) return 'neutral';
    return 'poor';
}

function hasJuice(account) {
    const latest = account.tests[0];
    return latest.queuePercent <= settings.juicePercent && latest.queueAnchor >= settings.juiceAnchor;
}

function getOverallChange(email) {
    const tests = allTests.filter(t => t.email === email).sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
    if (tests.length < 2) return null;
    // INVERTED: previous - current (so lower % = positive change)
    return tests[tests.length - 2].queuePercent - tests[tests.length - 1].queuePercent;
}

function updateStats(tests) {
    const emails = new Set(tests.map(t => t.email));
    document.getElementById('totalAccounts').textContent = emails.size;
    if (tests.length > 0) {
        const bestPercent = Math.min(...tests.map(t => t.queuePercent));
        document.getElementById('bestPosition').textContent = bestPercent.toFixed(1) + '%';
        
        // Store best email for click handler
        const bestTest = tests.find(t => t.queuePercent === bestPercent);
        if (bestTest) {
            window.bestEmail = bestTest.email;
        }
    } else {
        document.getElementById('bestPosition').textContent = '—';
        window.bestEmail = null;
    }
}

function scrollToBestPosition() {
    if (!window.bestEmail) return;
    
    // Find the row with best email
    const rows = document.querySelectorAll('#tableBody tr');
    let targetRow = null;
    
    rows.forEach(row => {
        const emailCell = row.querySelector('.email-cell');
        if (emailCell && emailCell.textContent.includes(window.bestEmail)) {
            targetRow = row;
        }
    });
    
    if (targetRow) {
        // Get table container
        const tableContainer = document.querySelector('.table-container');
        
        // Calculate scroll position
        const rowTop = targetRow.offsetTop;
        const containerHeight = tableContainer.clientHeight;
        const rowHeight = targetRow.clientHeight;
        
        // Scroll to center the row
        tableContainer.scrollTo({
            top: rowTop - (containerHeight / 2) + (rowHeight / 2),
            behavior: 'smooth'
        });
        
        // Add highlight animation
        targetRow.classList.add('highlight');
        setTimeout(() => {
            targetRow.classList.remove('highlight');
        }, 2000);
    }
}

function showTestDetails(test, email) {
    const allEmail = allTests.filter(t => t.email === email).sort((a, b) => new Date(a.testingDate) - new Date(b.testingDate));
    const idx = allEmail.findIndex(t => t.testingDate === test.testingDate && t.queueNumber === test.queueNumber);
    const prev = idx > 0 ? allEmail[idx - 1] : null;
    const change = prev ? (test.queuePercent - prev.queuePercent).toFixed(2) : null;
    const days = Math.floor((new Date() - new Date(test.testingDate)) / 86400000);
    
    // Populate modal
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="modal-detail-row">
            <span class="modal-detail-label">Email</span>
            <span class="modal-detail-value">${email}</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Event</span>
            <span class="modal-detail-value">${test.eventName}</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Test #</span>
            <span class="modal-detail-value">${test.testingNum}</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Date</span>
            <span class="modal-detail-value">${test.testingDate}</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Queue</span>
            <span class="modal-detail-value">${formatNum(test.queueNumber)}/${formatNum(test.queueAnchor)}</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Queue %</span>
            <span class="modal-detail-value">${test.queuePercent.toFixed(2)}%</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Change</span>
            <span class="modal-detail-value">${change !== null ? (change >= 0 ? '+' : '') + change + '%' : 'N/A'}</span>
        </div>
        <div class="modal-detail-row">
            <span class="modal-detail-label">Days Since</span>
            <span class="modal-detail-value">${days} days</span>
        </div>
    `;
    
    // Show modal
    const modal = document.getElementById('testModal');
    modal.classList.add('visible');
    
    // Close on escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeTestModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // Close on backdrop click
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeTestModal();
        }
    };
}

function closeTestModal() {
    const modal = document.getElementById('testModal');
    modal.classList.remove('visible');
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
    // Best Position click
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
    
    document.querySelector('.settings-btn').onclick = () => document.getElementById('settingsPanel').classList.toggle('open');
    document.querySelector('.close-settings').onclick = () => document.getElementById('settingsPanel').classList.remove('open');
    
    document.getElementById('importBtn').onclick = importCSV;
    document.getElementById('backBtn').onclick = hideTimeline;
    
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.onclick = () => {
            currentFilter = chip.dataset.filter;
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
        
        // Clear previous timeout
        clearTimeout(searchTimeout);
        
        if (query) {
            currentFilter = 'search:' + query;
            // Deactivate all filter chips when searching
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        } else {
            currentFilter = 'all';
            // Re-activate "All" chip
            document.querySelectorAll('.filter-chip')[0].classList.add('active');
        }
        
        // Show loading and debounce
        showLoadingState();
        searchTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                renderTable();
                hideLoadingState();
            });
        }, 300); // Wait 300ms after typing stops
    };
    
    document.getElementById('juicePercent').onchange = async (e) => {
        settings.juicePercent = parseFloat(e.target.value);
        await saveSettings();
        renderTable();
    };
    
    document.getElementById('juiceAnchor').onchange = async (e) => {
        settings.juiceAnchor = parseInt(e.target.value);
        await saveSettings();
        renderTable();
    };

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + I = Import
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            importCSV();
        }
        // Ctrl/Cmd + , = Settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            document.getElementById('settingsPanel').classList.toggle('open');
        }
        // Escape = Close settings/timeline
        if (e.key === 'Escape') {
            if (document.getElementById('settingsPanel').classList.contains('open')) {
                document.getElementById('settingsPanel').classList.remove('open');
            } else if (document.getElementById('timelinePage').style.display === 'block') {
                hideTimeline();
            }
        }
        // Ctrl/Cmd + F = Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
    });
}
