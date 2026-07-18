(() => {
    // ===== State =====
    let claims = []; // in-memory store of processed claims
    let selectedFile = null;
    let claimCounter = 0;

    // Load from local storage
    try {
        const stored = localStorage.getItem('claimsense_claims');
        if (stored) {
            claims = JSON.parse(stored);
            claimCounter = claims.length;
        }
    } catch (e) {
        console.error("Failed to load claims from local storage", e);
    }

    // ===== DOM =====
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileRemove = document.getElementById('fileRemove');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const btnText = document.getElementById('btnText');
    const btnSpinner = document.getElementById('btnSpinner');
    const errorDisplay = document.getElementById('errorDisplay');
    const errorText = document.getElementById('errorText');
    const pipeline = document.getElementById('pipeline');
    const claimsBody = document.getElementById('claimsBody');
    const jsonOutput = document.getElementById('jsonOutput');

    let currentFilter = null; // null means show all

    // ===== Routing =====
    function handleRouteChange() {
        const hash = window.location.hash || '#/dashboard';
        currentFilter = null; // default clear

        // Reset nav highlights
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

        if (hash === '#/upload') {
            activateTab('uploadPanel');
            const nav = document.querySelector('.nav-item[data-tab="upload"]');
            if (nav) nav.classList.add('active');
        } else if (hash.startsWith('#/queue/')) {
            const queueFilter = hash.split('#/queue/')[1];
            currentFilter = queueFilter;
            activateTab('queue');
            const nav = document.querySelector(`.nav-item[data-filter="${queueFilter}"]`);
            if (nav) nav.classList.add('active');
        } else {
            // Default to dashboard
            activateTab('queue');
            const nav = document.querySelector('.nav-item[data-tab="dashboard"]');
            if (nav) nav.classList.add('active');
        }

        updateTable();
    }

    // Listen for URL changes
    window.addEventListener('hashchange', handleRouteChange);

    // Top bar buttons - just change the URL now!
    document.getElementById('topUploadBtn').addEventListener('click', () => {
        window.location.hash = '#/upload';
    });

    document.getElementById('topProcessBtn').addEventListener('click', () => {
        window.location.hash = '#/dashboard';
    });

    // ===== Tabs =====
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.panel === 'queue') {
                currentFilter = null; // Clear filter if main queue tab is clicked
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.querySelector('.nav-item[data-tab="dashboard"]').classList.add('active');
                updateTable();
            }
            activateTab(tab.dataset.panel);
        });
    });

    function activateTab(panelName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');

        const matchingTab = document.querySelector(`.tab[data-panel="${panelName}"]`);
        if (matchingTab) matchingTab.classList.add('active');

        const panel = document.getElementById(panelName + 'Panel');
        if (panel) panel.style.display = '';
    }

    // ===== File Handling =====
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('active');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('active');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    fileRemove.addEventListener('click', clearFile);

    function handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'txt'].includes(ext)) {
            showError('Unsupported file type. Please upload a PDF or TXT file.');
            return;
        }
        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = formatSize(file.size);
        fileInfo.style.display = 'flex';
        dropzone.style.display = 'none';
        analyzeBtn.disabled = false;
        hideError();
    }

    function clearFile() {
        selectedFile = null;
        fileInput.value = '';
        fileInfo.style.display = 'none';
        dropzone.style.display = '';
        analyzeBtn.disabled = true;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ===== Analysis =====
    analyzeBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        hideError();
        analyzeBtn.disabled = true;
        btnText.textContent = 'Processing...';
        btnSpinner.style.display = 'inline-block';

        // Show pipeline
        pipeline.style.display = 'flex';
        resetPipeline();
        setPipeStep(1); // Ingest

        const formData = new FormData();
        formData.append('file', selectedFile);
        const startTime = Date.now();

        try {
            await delay(300);
            setPipeStep(2); // Extract

            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
            });

            setPipeStep(3); // Validate
            await delay(200);

            if (!response.ok) {
                let errText = await response.text();
                let errMsg = 'Processing failed';
                try {
                    const errJson = JSON.parse(errText);
                    errMsg = errJson.detail || errMsg;
                } catch (e) {
                    errMsg = `Server Error (${response.status}): ${errText.slice(0, 50) || 'Empty response'}`;
                }
                throw new Error(errMsg);
            }

            const data = await response.json();

            setPipeStep(4); // Route
            await delay(200);
            setPipeStep(5); // Complete

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // Store claim
            claimCounter++;
            const claimId = 'CLM-2025-' + String(claimCounter).padStart(4, '0');
            const claim = {
                id: claimId,
                data: data,
                fileName: selectedFile.name,
                timestamp: new Date(),
                processingTime: elapsed
            };
            claims.push(claim);

            // Persist to local storage
            try {
                localStorage.setItem('claimsense_claims', JSON.stringify(claims));
            } catch (e) {
                console.error("Failed to save to local storage", e);
            }

            // Update everything
            updateTable();
            updateStats();
            updateQueueCounts();
            jsonOutput.textContent = JSON.stringify(data, null, 2);

            // Switch to dashboard tab to show result via routing
            setTimeout(() => {
                window.location.hash = '#/dashboard';
            }, 600);

            clearFile();

        } catch (err) {
            showError(err.message);
            pipeline.style.display = 'none';
        } finally {
            analyzeBtn.disabled = false;
            btnText.textContent = 'Analyze Claim';
            btnSpinner.style.display = 'none';
        }
    });

    // ===== Pipeline Steps =====
    const pipeSteps = ['pipeIngest', 'pipeExtract', 'pipeValidate', 'pipeRoute', 'pipeComplete'];
    const pipeLines = ['pipeLine1', 'pipeLine2', 'pipeLine3', 'pipeLine4'];

    function resetPipeline() {
        pipeSteps.forEach(id => {
            document.getElementById(id).className = 'pipeline-step';
        });
        pipeLines.forEach(id => {
            document.getElementById(id).className = 'pipeline-line';
        });
    }

    function setPipeStep(n) {
        for (let i = 0; i < pipeSteps.length; i++) {
            const el = document.getElementById(pipeSteps[i]);
            el.className = 'pipeline-step';
            if (i < n - 1) el.classList.add('done');
            if (i === n - 1) el.classList.add('active');
        }
        for (let i = 0; i < pipeLines.length; i++) {
            const el = document.getElementById(pipeLines[i]);
            el.className = 'pipeline-line';
            if (i < n - 1) el.classList.add('done');
        }
    }

    // ===== Update Table =====
    function updateTable() {
        const filteredClaims = currentFilter 
            ? claims.filter(c => c.data.recommendedRoute === currentFilter)
            : claims;

        if (filteredClaims.length === 0) {
            const msg = currentFilter ? `No claims found in the ${currentFilter.replace('_', ' ').toLowerCase()} queue.` : 'No claims processed yet.';
            claimsBody.innerHTML = `<tr class="empty-row"><td colspan="6">${msg}</td></tr>`;
            return;
        }

        claimsBody.innerHTML = '';
        filteredClaims.forEach((claim, idx) => {
            const d = claim.data;
            const fields = d.extractedFields;
            const route = d.recommendedRoute;
            const routeClass = route.toLowerCase().replace(/_/g, '-');

            const routeLabels = {
                'FAST_TRACK': 'Fast-track',
                'MANUAL_REVIEW': 'Manual Review',
                'INVESTIGATION': 'Investigation',
                'SPECIALIST': 'Specialist'
            };

            const statusMap = {
                'FAST_TRACK': { label: 'Processed', color: 'var(--green)' },
                'MANUAL_REVIEW': { label: 'Review', color: 'var(--yellow)' },
                'INVESTIGATION': { label: 'Flagged', color: 'var(--red)' },
                'SPECIALIST': { label: 'Assigned', color: 'var(--blue)' }
            };

            const status = statusMap[route] || { label: 'Processed', color: 'var(--green)' };
            const holder = fields.policy?.policyholderName || 'Unknown';
            const damage = fields.initialEstimate != null
                ? '$' + Number(fields.initialEstimate).toLocaleString()
                : '—';

            // Determine type from assets or injuries
            let type = 'Document';
            if (fields.involvedParties?.some(p => p.injuryDescription)) type = 'Injury';
            else if (fields.assets?.length > 0) type = 'Vehicle';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="claim-id">${esc(claim.id)}</span></td>
                <td>${esc(holder)}</td>
                <td>${esc(type)}</td>
                <td>${damage}</td>
                <td><span class="status-indicator"><span class="status-dot" style="background:${status.color}"></span>${esc(status.label)}</span></td>
                <td><span class="route-badge ${routeClass}">${esc(routeLabels[route] || route)}</span></td>
            `;
            tr.addEventListener('click', () => openClaimModal(claim));
            claimsBody.appendChild(tr);
        });
    }

    // ===== Update Stats =====
    function updateStats() {
        document.getElementById('statTotal').textContent = claims.length;
        document.getElementById('statTotalSub').textContent =
            claims.length === 1 ? '1 claim processed' : claims.length + ' claims processed';

        // Avg time
        if (claims.length > 0) {
            const avg = claims.reduce((s, c) => s + parseFloat(c.processingTime), 0) / claims.length;
            document.getElementById('statAvgTime').textContent = avg.toFixed(1) + 's';
        }

        // Pending review
        const pending = claims.filter(c =>
            c.data.recommendedRoute === 'MANUAL_REVIEW' || c.data.recommendedRoute === 'INVESTIGATION'
        ).length;
        document.getElementById('statPending').textContent = pending;
        const pendingSub = document.getElementById('statPendingSub');
        if (pending > 0) {
            pendingSub.textContent = 'Missing fields';
            pendingSub.className = 'stat-sub warning';
        } else {
            pendingSub.textContent = '—';
            pendingSub.className = 'stat-sub';
        }

        // Auto-routed
        const autoRouted = claims.filter(c => c.data.recommendedRoute === 'FAST_TRACK').length;
        const pct = claims.length > 0 ? Math.round((autoRouted / claims.length) * 100) : 0;
        document.getElementById('statAutoRouted').textContent = pct + '%';
        document.getElementById('statAutoSub').textContent =
            claims.length > 0 ? autoRouted + ' of ' + claims.length : '—';

        // Claim count badge
        document.getElementById('claimCount').textContent = claims.length;
    }

    // ===== Update Queue Counts =====
    function updateQueueCounts() {
        const counts = { FAST_TRACK: 0, MANUAL_REVIEW: 0, INVESTIGATION: 0, SPECIALIST: 0 };
        claims.forEach(c => {
            if (counts[c.data.recommendedRoute] !== undefined) {
                counts[c.data.recommendedRoute]++;
            }
        });
        document.getElementById('qFastTrack').textContent = counts.FAST_TRACK;
        document.getElementById('qManualReview').textContent = counts.MANUAL_REVIEW;
        document.getElementById('qInvestigation').textContent = counts.INVESTIGATION;
        document.getElementById('qSpecialist').textContent = counts.SPECIALIST;
    }

    // ===== Claim Detail Modal =====
    const modal = document.getElementById('claimModal');
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');

    document.getElementById('modalClose').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    function openClaimModal(claim) {
        const d = claim.data;
        const fields = d.extractedFields;
        const route = d.recommendedRoute;
        const routeClass = route.toLowerCase().replace(/_/g, '-');
        const routeLabels = {
            'FAST_TRACK': 'Fast-track',
            'MANUAL_REVIEW': 'Manual Review',
            'INVESTIGATION': 'Investigation',
            'SPECIALIST': 'Specialist'
        };

        modalTitle.textContent = claim.id;

        let html = '';

        // Routing banner
        html += `<div class="routing-banner-modal ${routeClass}">
            <div class="rb-title">Route: ${esc(routeLabels[route] || route)}</div>
            <div class="rb-reason">${esc(d.reasoning)}</div>
        </div>`;

        // Policy
        html += `<div class="detail-section">
            <h3>Policy Information</h3>
            <div class="detail-grid">
                <dl class="detail-item"><dt>Policy Number</dt><dd>${esc(fields.policy?.policyNumber || '—')}</dd></dl>
                <dl class="detail-item"><dt>Policyholder</dt><dd>${esc(fields.policy?.policyholderName || '—')}</dd></dl>
                <dl class="detail-item"><dt>Effective Start</dt><dd>${esc(fields.policy?.effectiveDateStart || '—')}</dd></dl>
                <dl class="detail-item"><dt>Effective End</dt><dd>${esc(fields.policy?.effectiveDateEnd || '—')}</dd></dl>
            </div>
        </div>`;

        // Incident
        html += `<div class="detail-section">
            <h3>Incident Details</h3>
            <div class="detail-grid">
                <dl class="detail-item"><dt>Date</dt><dd>${esc(fields.incident?.date || '—')}</dd></dl>
                <dl class="detail-item"><dt>Time</dt><dd>${esc(fields.incident?.time || '—')}</dd></dl>
                <dl class="detail-item detail-full"><dt>Location</dt><dd>${esc(fields.incident?.location || '—')}</dd></dl>
                <dl class="detail-item detail-full"><dt>Description</dt><dd>${esc(fields.incident?.description || '—')}</dd></dl>
                <dl class="detail-item"><dt>Authority</dt><dd>${esc(fields.incident?.authorityContacted || '—')}</dd></dl>
                <dl class="detail-item"><dt>Report #</dt><dd>${esc(fields.incident?.reportNumber || '—')}</dd></dl>
            </div>
        </div>`;

        // Parties
        if (fields.involvedParties && fields.involvedParties.length > 0) {
            html += `<div class="detail-section"><h3>Involved Parties</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Injury</th></tr></thead><tbody>`;
            fields.involvedParties.forEach(p => {
                html += `<tr><td>${esc(p.name || '—')}</td><td>${esc(p.role || '—')}</td><td>${esc(p.injuryDescription || 'None')}</td></tr>`;
            });
            html += `</tbody></table></div></div>`;
        }

        // Assets
        if (fields.assets && fields.assets.length > 0) {
            html += `<div class="detail-section"><h3>Assets</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Description</th><th>VIN</th><th>Damage</th></tr></thead><tbody>`;
            fields.assets.forEach(a => {
                html += `<tr><td>${esc(a.description || '—')}</td><td>${esc(a.vin || '—')}</td><td>${esc(a.damageDescription || '—')}</td></tr>`;
            });
            html += `</tbody></table></div></div>`;
        }

        // Missing Fields
        if (d.missingFields && d.missingFields.length > 0) {
            html += `<div class="detail-section"><h3>Missing Fields (${d.missingFields.length})</h3><ul style="list-style:none;display:flex;flex-direction:column;gap:4px;">`;
            d.missingFields.forEach(f => {
                html += `<li style="font-size:12px;color:var(--yellow);background:var(--yellow-bg);padding:4px 10px;border-radius:4px;">${esc(f)}</li>`;
            });
            html += `</ul></div>`;
        }

        modalBody.innerHTML = html;
        modal.style.display = 'flex';
    }

    // ===== Utilities =====
    function showError(msg) {
        errorText.textContent = msg;
        errorDisplay.style.display = 'block';
    }

    function hideError() {
        errorDisplay.style.display = 'none';
    }

    function esc(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ===== Initial Render =====
    updateTable();
    updateStats();
    updateQueueCounts();
})();
