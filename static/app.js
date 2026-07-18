const { createApp, ref, computed, onMounted } = Vue;

const App = {
    setup() {
        // --- State ---
        const claims = ref([]);
        const currentTab = ref('dashboard');
        const currentFilter = ref(null);
        
        const selectedFile = ref(null);
        const isDragging = ref(false);
        const isProcessing = ref(false);
        const processingStep = ref(0);
        const errorMessage = ref('');
        const activeClaim = ref(null);

        const queues = [
            { id: 'FAST_TRACK', label: 'Fast-track', color: '#22c55e' },
            { id: 'MANUAL_REVIEW', label: 'Manual Review', color: '#f59e0b' },
            { id: 'INVESTIGATION', label: 'Investigation', color: '#ef4444' },
            { id: 'SPECIALIST', label: 'Specialist', color: '#8b5cf6' }
        ];

        // --- Computed Properties ---
        const topbarTitle = computed(() => {
            if (currentTab.value === 'upload') return 'Submit FNOL Document';
            if (currentFilter.value) return queues.find(q => q.id === currentFilter.value).label + ' Queue';
            return 'Dashboard Overview';
        });

        const filteredClaims = computed(() => {
            if (!currentFilter.value) return claims.value;
            return claims.value.filter(c => c.data.recommendedRoute === currentFilter.value);
        });

        const autoRoutedPercent = computed(() => {
            if (claims.value.length === 0) return 0;
            const auto = claims.value.filter(c => c.data.recommendedRoute === 'FAST_TRACK').length;
            return Math.round((auto / claims.value.length) * 100);
        });

        const pendingReviewCount = computed(() => {
            return claims.value.filter(c => 
                c.data.recommendedRoute === 'MANUAL_REVIEW' || c.data.recommendedRoute === 'INVESTIGATION'
            ).length;
        });

        const avgProcessingTime = computed(() => {
            if (claims.value.length === 0) return '0.0';
            const total = claims.value.reduce((acc, c) => acc + (parseFloat(c.processingTime) || 0), 0);
            return (total / claims.value.length).toFixed(1);
        });

        // --- Lifecycle ---
        onMounted(() => {
            loadFromStorage();
        });

        // --- Methods ---
        const loadFromStorage = () => {
            try {
                const stored = localStorage.getItem('synpax_claims');
                if (stored) claims.value = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to load from storage', e);
            }
        };

        const saveToStorage = () => {
            try {
                localStorage.setItem('synpax_claims', JSON.stringify(claims.value));
            } catch (e) {
                console.error('Failed to save to storage', e);
            }
        };

        const filterQueue = (queueId) => {
            currentTab.value = 'dashboard';
            currentFilter.value = queueId;
        };

        const getQueueCount = (queueId) => {
            return claims.value.filter(c => c.data.recommendedRoute === queueId).length;
        };

        const clearCache = () => {
            if (confirm('Are you sure you want to clear all processed claims?')) {
                claims.value = [];
                localStorage.removeItem('synpax_claims');
                currentFilter.value = null;
            }
        };

        const formatCurrency = (amount) => {
            if (amount == null) return '—';
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
        };

        const formatFileSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        };

        const formatRoute = (route) => {
            const q = queues.find(q => q.id === route);
            return q ? q.label : route;
        };

        const getRouteStyle = (route) => {
            const q = queues.find(q => q.id === route);
            if (!q) return {};
            return {
                backgroundColor: `${q.color}22`,
                color: q.color,
                border: `1px solid ${q.color}44`
            };
        };

        const getRouteBannerStyle = (route) => {
            const q = queues.find(q => q.id === route);
            if (!q) return {};
            return {
                backgroundColor: `${q.color}11`,
                borderLeft: `4px solid ${q.color}`
            };
        };

        const getRouteIcon = (route) => {
            if (route === 'FAST_TRACK') return 'ph-fill ph-check-circle text-success';
            if (route === 'MANUAL_REVIEW') return 'ph-fill ph-warning text-warning';
            if (route === 'INVESTIGATION') return 'ph-fill ph-shield-warning text-danger';
            if (route === 'SPECIALIST') return 'ph-fill ph-user-focus text-purple';
            return 'ph-fill ph-info';
        };

        const getCategoryName = (claim) => {
            const fields = claim.data.extractedFields;
            if (fields.involvedParties?.some(p => p.injuryDescription)) return 'Bodily Injury';
            if (fields.assets?.length > 0) return 'Auto Damage';
            return 'General Document';
        };

        const getCategoryIcon = (claim) => {
            const fields = claim.data.extractedFields;
            if (fields.involvedParties?.some(p => p.injuryDescription)) return 'ph-fill ph-first-aid';
            if (fields.assets?.length > 0) return 'ph-fill ph-car-profile';
            return 'ph-fill ph-file-text';
        };

        // --- File Handling & AI Processing ---
        const handleFileSelect = (event) => {
            const file = event.target.files[0];
            if (file) setFile(file);
        };

        const handleDrop = (event) => {
            isDragging.value = false;
            const file = event.dataTransfer.files[0];
            if (file) setFile(file);
        };

        const setFile = (file) => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['pdf', 'txt'].includes(ext)) {
                errorMessage.value = 'Unsupported file type. Please upload PDF or TXT.';
                return;
            }
            selectedFile.value = file;
            errorMessage.value = '';
        };

        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        const analyzeClaim = async () => {
            if (!selectedFile.value) return;

            errorMessage.value = '';
            isProcessing.value = true;
            processingStep.value = 1; // Ingesting

            const formData = new FormData();
            formData.append('file', selectedFile.value);
            const startTime = Date.now();

            try {
                await delay(400);
                processingStep.value = 2; // Extracting

                const response = await fetch('/api/process', {
                    method: 'POST',
                    body: formData,
                });

                processingStep.value = 3; // Validating
                await delay(300);

                if (!response.ok) {
                    let errText = await response.text();
                    let errMsg = 'Processing failed';
                    try {
                        const errJson = JSON.parse(errText);
                        errMsg = errJson.detail || errMsg;
                    } catch (e) {
                        errMsg = `Server Error (${response.status}): ${errText.slice(0, 50)}`;
                    }
                    throw new Error(errMsg);
                }

                const data = await response.json();
                
                processingStep.value = 4; // Routing
                await delay(300);

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                // Create record
                const newClaim = {
                    id: 'CLM-' + Date.now().toString().slice(-6),
                    data: data,
                    fileName: selectedFile.value.name,
                    timestamp: new Date().toISOString(),
                    processingTime: elapsed
                };

                claims.value.unshift(newClaim); // Add to beginning
                saveToStorage();

                // Reset and go to dashboard
                setTimeout(() => {
                    isProcessing.value = false;
                    selectedFile.value = null;
                    processingStep.value = 0;
                    currentTab.value = 'dashboard';
                    currentFilter.value = null;
                }, 800);

            } catch (err) {
                errorMessage.value = err.message;
                isProcessing.value = false;
                processingStep.value = 0;
            }
        };

        const viewClaim = (claim) => {
            activeClaim.value = claim;
        };

        return {
            claims, currentTab, currentFilter, selectedFile, isDragging, isProcessing, processingStep, errorMessage, activeClaim,
            queues, topbarTitle, filteredClaims, autoRoutedPercent, pendingReviewCount, avgProcessingTime,
            filterQueue, getQueueCount, clearCache, formatCurrency, formatFileSize, formatRoute, getRouteStyle, getRouteBannerStyle, getRouteIcon, getCategoryName, getCategoryIcon,
            handleFileSelect, handleDrop, analyzeClaim, viewClaim
        };
    }
};

createApp(App).mount('#app');
