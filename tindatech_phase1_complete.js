// ============================================
// TindaTech Phase 1 Complete Integration
// ARIMA/SARIMA Forecasting + CSV Import/Export + Cognitive Ergonomics
// ============================================

// ============================================
// PART 1: ARIMA/SARIMA FORECASTING MODELS
// ============================================

class SimpleARIMA {
    constructor(p = 1, d = 1, q = 1) {
        this.p = p; // AR order
        this.d = d; // Differencing order
        this.q = q; // MA order
        this.phi = []; // AR coefficients
        this.theta = []; // MA coefficients
    }

    // Difference the series
    difference(data, order = 1) {
        let result = [...data];
        for (let i = 0; i < order; i++) {
            const diffed = [];
            for (let j = 1; j < result.length; j++) {
                diffed.push(result[j] - result[j-1]);
            }
            result = diffed;
        }
        return result;
    }

    // Calculate autocorrelation
    autocorrelation(data, lag) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < data.length - lag; i++) {
            numerator += (data[i] - mean) * (data[i + lag] - mean);
        }

        for (let i = 0; i < data.length; i++) {
            denominator += Math.pow(data[i] - mean, 2);
        }

        return numerator / denominator;
    }

    // Simple parameter estimation using Yule-Walker
    estimateParameters(data) {
        const diffed = this.difference(data, this.d);

        // Estimate AR parameters
        this.phi = [];
        for (let i = 1; i <= this.p; i++) {
            this.phi.push(this.autocorrelation(diffed, i));
        }

        // Estimate MA parameters (simplified)
        this.theta = [];
        for (let i = 1; i <= this.q; i++) {
            this.theta.push(0.3 / i); // Simple heuristic
        }
    }

    // Train the model
    train(timeSeries) {
        if (!timeSeries || timeSeries.length < 10) {
            throw new Error('Need at least 10 data points for ARIMA');
        }
        this.data = timeSeries;
        this.estimateParameters(timeSeries);
        return this;
    }

    // Predict next n steps
    predict(steps = 7) {
        const predictions = [];
        const lastValues = this.data.slice(-Math.max(this.p, this.q));

        for (let i = 0; i < steps; i++) {
            let forecast = 0;

            // AR component
            for (let j = 0; j < this.p && j < lastValues.length; j++) {
                forecast += this.phi[j] * lastValues[lastValues.length - 1 - j];
            }

            // Add trend component
            const trend = (this.data[this.data.length - 1] - this.data[0]) / this.data.length;
            forecast += trend * (i + 1);

            predictions.push(Math.max(0, forecast));
            lastValues.push(forecast);
        }

        return predictions;
    }
}

// SARIMA model extending ARIMA with seasonality
class SimpleSARIMA extends SimpleARIMA {
    constructor(p = 1, d = 1, q = 1, P = 1, D = 1, Q = 1, s = 7) {
        super(p, d, q);
        this.P = P; // Seasonal AR order
        this.D = D; // Seasonal differencing
        this.Q = Q; // Seasonal MA order
        this.s = s; // Seasonal period (7 for weekly)
    }

    // Detect seasonality
    detectSeasonality(data) {
        if (data.length < this.s * 2) return false;

        let seasonalCorr = 0;
        for (let i = 0; i < data.length - this.s; i++) {
            seasonalCorr += Math.abs(data[i] - data[i + this.s]);
        }

        const avgDiff = data.slice(1).reduce((sum, val, i) => 
            sum + Math.abs(val - data[i]), 0) / (data.length - 1);

        return (seasonalCorr / (data.length - this.s)) < avgDiff * 0.8;
    }

    // Seasonal differencing
    seasonalDifference(data) {
        const result = [];
        for (let i = this.s; i < data.length; i++) {
            result.push(data[i] - data[i - this.s]);
        }
        return result;
    }

    train(timeSeries) {
        if (!timeSeries || timeSeries.length < this.s * 2) {
            // Fall back to regular ARIMA
            return super.train(timeSeries);
        }

        this.data = timeSeries;
        this.hasSeason = this.detectSeasonality(timeSeries);

        if (this.hasSeason) {
            const seasonalDiffed = this.seasonalDifference(timeSeries);
            this.estimateParameters(seasonalDiffed);
        } else {
            this.estimateParameters(timeSeries);
        }

        return this;
    }

    predict(steps = 7) {
        const predictions = super.predict(steps);

        // Add seasonal component if detected
        if (this.hasSeason && this.data.length >= this.s) {
            for (let i = 0; i < predictions.length; i++) {
                const seasonalIndex = (this.data.length + i) % this.s;
                const historicalSeasonal = this.data[this.data.length - this.s + seasonalIndex] || 0;
                const recentValue = this.data[this.data.length - 1];
                const seasonalFactor = recentValue > 0 ? historicalSeasonal / recentValue : 1;
                predictions[i] *= (0.7 + 0.3 * seasonalFactor);
            }
        }

        return predictions.map(p => Math.max(0, Math.round(p * 100) / 100));
    }
}

// ============================================
// PART 2: CSV IMPORT/EXPORT WITH VALIDATION
// ============================================

class CSVHandler {
    constructor() {
        this.validationRules = {
            name: { required: true, type: 'string', maxLength: 100 },
            category: { required: true, type: 'string' },
            buyPrice: { required: true, type: 'number', min: 0 },
            sellPrice: { required: true, type: 'number', min: 0 },
            stock: { required: true, type: 'number', min: 0, integer: true },
            minStock: { required: false, type: 'number', min: 0, integer: true, default: 5 }
        };
    }

    // Validate a single row
    validateRow(row, rowIndex) {
        const errors = [];
        const validatedRow = {};

        for (const [field, rules] of Object.entries(this.validationRules)) {
            const value = row[field];

            // Check required
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`Row ${rowIndex}: Missing required field '${field}'`);
                continue;
            }

            // Apply default
            if (!value && rules.default !== undefined) {
                validatedRow[field] = rules.default;
                continue;
            }

            // Type validation
            if (rules.type === 'number') {
                const num = parseFloat(value);
                if (isNaN(num)) {
                    errors.push(`Row ${rowIndex}: '${field}' must be a number`);
                    continue;
                }

                if (rules.min !== undefined && num < rules.min) {
                    errors.push(`Row ${rowIndex}: '${field}' must be >= ${rules.min}`);
                    continue;
                }

                if (rules.integer && !Number.isInteger(num)) {
                    errors.push(`Row ${rowIndex}: '${field}' must be an integer`);
                    continue;
                }

                validatedRow[field] = num;
            } else if (rules.type === 'string') {
                const str = String(value).trim();

                if (rules.maxLength && str.length > rules.maxLength) {
                    errors.push(`Row ${rowIndex}: '${field}' exceeds max length ${rules.maxLength}`);
                    continue;
                }

                validatedRow[field] = str;
            }
        }

        // Business rule: sellPrice should be > buyPrice
        if (validatedRow.sellPrice && validatedRow.buyPrice && 
            validatedRow.sellPrice <= validatedRow.buyPrice) {
            errors.push(`Row ${rowIndex}: Sell price must be greater than buy price`);
        }

        return { validatedRow, errors };
    }

    // Parse CSV content
    parseCSV(csvContent) {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) {
            return { success: false, error: 'CSV file must have header and at least one data row' };
        }

        // Parse header
        const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

        // Validate required columns
        const requiredCols = Object.entries(this.validationRules)
            .filter(([, rules]) => rules.required)
            .map(([field]) => field);

        const missingCols = requiredCols.filter(col => !header.includes(col));
        if (missingCols.length > 0) {
            return { 
                success: false, 
                error: `Missing required columns: ${missingCols.join(', ')}` 
            };
        }

        // Parse data rows
        const validRows = [];
        const allErrors = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue; // Skip empty lines

            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};

            header.forEach((col, index) => {
                row[col] = values[index];
            });

            const { validatedRow, errors } = this.validateRow(row, i + 1);

            if (errors.length > 0) {
                allErrors.push(...errors);
            } else {
                validRows.push(validatedRow);
            }
        }

        return {
            success: allErrors.length === 0,
            data: validRows,
            errors: allErrors,
            summary: {
                totalRows: lines.length - 1,
                validRows: validRows.length,
                errorRows: allErrors.length
            }
        };
    }

    // Export products to CSV
    exportToCSV(products) {
        const headers = ['name', 'category', 'buyPrice', 'sellPrice', 'stock', 'minStock'];
        const csvRows = [headers.join(',')];

        products.forEach(product => {
            const row = headers.map(header => {
                const value = product[header] || '';
                // Escape commas and quotes
                return typeof value === 'string' && value.includes(',') 
                    ? `"${value.replace(/"/g, '""')}"` 
                    : value;
            });
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    // Export sales history to CSV
    exportSalesHistory(salesHistory) {
        const headers = ['date', 'productName', 'quantity', 'revenue', 'profit'];
        const csvRows = [headers.join(',')];

        salesHistory.forEach(sale => {
            csvRows.push([
                sale.date,
                `"${sale.productName}"`,
                sale.quantity,
                sale.revenue,
                sale.profit
            ].join(','));
        });

        return csvRows.join('\n');
    }

    // Download CSV file
    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ============================================
// PART 3: ENHANCED FORECASTING ENGINE
// ============================================

class ForecastingEngine {
    constructor() {
        this.models = {
            ma7: this.movingAverage,
            ses: this.simpleExponentialSmoothing,
            arima: this.arimaForecast,
            sarima: this.sarimaForecast
        };
    }

    // Existing Moving Average
    movingAverage(data, window = 7) {
        if (data.length < window) return data[data.length - 1] || 0;
        const recent = data.slice(-window);
        return recent.reduce((a, b) => a + b, 0) / window;
    }

    // Existing Simple Exponential Smoothing
    simpleExponentialSmoothing(data, alpha = 0.3) {
        if (data.length === 0) return 0;
        let forecast = data[0];
        for (let i = 1; i < data.length; i++) {
            forecast = alpha * data[i] + (1 - alpha) * forecast;
        }
        return forecast;
    }

    // ARIMA Forecast
    arimaForecast(data, steps = 7) {
        try {
            const model = new SimpleARIMA(1, 1, 1);
            model.train(data);
            return model.predict(steps);
        } catch (e) {
            console.warn('ARIMA failed, falling back to SES:', e);
            return Array(steps).fill(this.simpleExponentialSmoothing(data));
        }
    }

    // SARIMA Forecast
    sarimaForecast(data, steps = 7, seasonalPeriod = 7) {
        try {
            const model = new SimpleSARIMA(1, 1, 1, 1, 0, 1, seasonalPeriod);
            model.train(data);
            return model.predict(steps);
        } catch (e) {
            console.warn('SARIMA failed, falling back to ARIMA:', e);
            return this.arimaForecast(data, steps);
        }
    }

    // Automatic model selection
    selectBestModel(data) {
        if (data.length < 10) return 'ma7';
        if (data.length < 14) return 'ses';
        if (data.length < 21) return 'arima';
        return 'sarima'; // Use SARIMA for sufficient data
    }

    // Generate forecast with confidence intervals
    forecastWithConfidence(data, steps = 7, model = 'auto') {
        if (model === 'auto') {
            model = this.selectBestModel(data);
        }

        let predictions;
        if (model === 'arima') {
            predictions = this.arimaForecast(data, steps);
        } else if (model === 'sarima') {
            predictions = this.sarimaForecast(data, steps);
        } else if (model === 'ses') {
            const sesForecast = this.simpleExponentialSmoothing(data);
            predictions = Array(steps).fill(sesForecast);
        } else {
            const maForecast = this.movingAverage(data);
            predictions = Array(steps).fill(maForecast);
        }

        // Calculate confidence intervals (±1.96 * std for 95% CI)
        const stdDev = this.calculateStdDev(data);
        const confidenceIntervals = predictions.map((pred, i) => ({
            forecast: pred,
            lower: Math.max(0, pred - 1.96 * stdDev * Math.sqrt(i + 1)),
            upper: pred + 1.96 * stdDev * Math.sqrt(i + 1)
        }));

        return {
            model: model.toUpperCase(),
            predictions: predictions,
            confidenceIntervals: confidenceIntervals
        };
    }

    calculateStdDev(data) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
        return Math.sqrt(variance);
    }
}

// ============================================
// PART 4: PRIORITY ALERT SYSTEM (Cognitive Ergonomics)
// ============================================

function updatePriorityAlerts() {
    const alertContainer = document.getElementById('priority-alerts-container');
    if (!alertContainer) return;

    const products = JSON.parse(localStorage.getItem('products')) || [];
    const alerts = [];

    let criticalCount = 0;
    let warningCount = 0;
    let optimalCount = 0;

    products.forEach(product => {
        const daysUntilStockout = product.stock / (product.dailySales || 1);

        // CRITICAL: Out of stock or <1 day remaining
        if (product.stock === 0) {
            alerts.push({
                priority: 'critical',
                icon: '🔴',
                title: 'OUT OF STOCK',
                message: `${product.name} - Restock immediately!`,
                action: 'Restock Now',
                productId: product.id
            });
            criticalCount++;
        }
        // CRITICAL: Below minimum stock
        else if (product.stock <= product.minStock) {
            alerts.push({
                priority: 'critical',
                icon: '⚠️',
                title: 'LOW STOCK ALERT',
                message: `${product.name} - Only ${product.stock} left (min: ${product.minStock})`,
                action: 'Add Stock',
                productId: product.id
            });
            criticalCount++;
        }
        // WARNING: Will run out in 1-3 days
        else if (daysUntilStockout <= 3 && product.dailySales > 0) {
            alerts.push({
                priority: 'warning',
                icon: '⚡',
                title: 'RESTOCK SOON',
                message: `${product.name} - Estimated ${Math.ceil(daysUntilStockout)} days remaining`,
                action: 'Plan Restock',
                productId: product.id
            });
            warningCount++;
        }
        // SUCCESS: Optimal stock levels
        else if (product.stock > product.minStock * 2) {
            optimalCount++;
        }
    });

    // Sort by priority (critical first)
    alerts.sort((a, b) => {
        const priorityOrder = { critical: 0, warning: 1, success: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Display top 5 alerts only (cognitive load management)
    alertContainer.innerHTML = alerts.slice(0, 5).map(alert => `
        <div class="priority-alert ${alert.priority}">
            <div class="icon">${alert.icon}</div>
            <div class="content">
                <div class="title">${alert.title}</div>
                <div class="message">${alert.message}</div>
            </div>
            <button class="action-btn" onclick="openRestockModal('${alert.productId}')">
                ${alert.action}
            </button>
        </div>
    `).join('');

    // Update simplified dashboard
    const criticalEl = document.getElementById('critical-count');
    const warningEl = document.getElementById('warning-count');
    const optimalEl = document.getElementById('optimal-count');
    const totalEl = document.getElementById('total-items');

    if (criticalEl) criticalEl.textContent = criticalCount;
    if (warningEl) warningEl.textContent = warningCount;
    if (optimalEl) optimalEl.textContent = optimalCount;
    if (totalEl) totalEl.textContent = products.length;
}

// ============================================
// PART 5: CSV IMPORT/EXPORT FUNCTIONS
// ============================================

// Global variable to store parsed CSV data temporarily
let pendingCSVImport = null;

// Initialize CSV upload handlers
function initializeCSVHandlers() {
    const uploadZone = document.getElementById('csv-upload-zone');
    const fileInput = document.getElementById('csv-file-input');

    if (!uploadZone || !fileInput) return;

    // Click to upload
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag and drop support
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleCSVUpload(file);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleCSVUpload(file);
        fileInput.value = ''; // Reset input
    });
}

// Handle CSV file upload
function handleCSVUpload(file) {
    if (!file.name.endsWith('.csv')) {
        showNotification('❌ Please select a CSV file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvContent = e.target.result;
        const result = window.csvHandler.parseCSV(csvContent);
        displayValidationResults(result);

        if (result.success && result.data.length > 0) {
            pendingCSVImport = result.data;
        }
    };
    reader.readAsText(file);
}

// Display validation results
function displayValidationResults(result) {
    const resultsDiv = document.getElementById('csv-validation-results');
    if (!resultsDiv) return;

    resultsDiv.style.display = 'block';

    if (result.success) {
        resultsDiv.innerHTML = `
            <div class="validation-success">
                ✅ Successfully validated ${result.summary.validRows} products!
            </div>
            <button class="btn-primary" onclick="confirmImport()" style="margin-top: 12px;">
                Import ${result.summary.validRows} Products
            </button>
        `;
    } else {
        resultsDiv.innerHTML = `
            <div style="color: #ff4444; font-weight: 600; margin-bottom: 12px;">
                ❌ Validation Errors Found:
            </div>
            ${result.errors.slice(0, 10).map(err => `
                <div class="validation-error">${err}</div>
            `).join('')}
            ${result.errors.length > 10 ? `
                <div style="margin-top: 12px; color: var(--text-secondary);">
                    ... and ${result.errors.length - 10} more errors
                </div>
            ` : ''}
        `;
    }
}

// Confirm and import validated products
function confirmImport() {
    if (!pendingCSVImport || pendingCSVImport.length === 0) {
        showNotification('❌ No data to import', 'error');
        return;
    }

    const existingProducts = JSON.parse(localStorage.getItem('products')) || [];

    pendingCSVImport.forEach(newProduct => {
        // Generate unique ID
        newProduct.id = Date.now() + Math.random();
        newProduct.dailySales = 0;
        newProduct.salesHistory = [];
        existingProducts.push(newProduct);
    });

    localStorage.setItem('products', JSON.stringify(existingProducts));
    showNotification(`✅ Successfully imported ${pendingCSVImport.length} products!`, 'success');

    // Clear pending import
    pendingCSVImport = null;

    // Hide validation results
    const resultsDiv = document.getElementById('csv-validation-results');
    if (resultsDiv) resultsDiv.style.display = 'none';

    // Refresh UI
    updatePriorityAlerts();
    if (typeof refreshDashboard === 'function') refreshDashboard();
    if (typeof loadProducts === 'function') loadProducts();
}

// Export products to CSV
function exportProductsCSV() {
    const products = JSON.parse(localStorage.getItem('products')) || [];
    if (products.length === 0) {
        showNotification('❌ No products to export', 'error');
        return;
    }

    const csvContent = window.csvHandler.exportToCSV(products);
    const filename = `TindaTech_Products_${new Date().toISOString().split('T')[0]}.csv`;
    window.csvHandler.downloadCSV(csvContent, filename);
    showNotification('✅ Products exported successfully!', 'success');
}

// Export sales history to CSV
function exportSalesCSV() {
    const sales = JSON.parse(localStorage.getItem('salesHistory')) || [];
    if (sales.length === 0) {
        showNotification('❌ No sales history to export', 'error');
        return;
    }

    const csvContent = window.csvHandler.exportSalesHistory(sales);
    const filename = `TindaTech_Sales_${new Date().toISOString().split('T')[0]}.csv`;
    window.csvHandler.downloadCSV(csvContent, filename);
    showNotification('✅ Sales history exported successfully!', 'success');
}

// Download sample CSV template
function downloadSampleCSV() {
    const sampleData = [
        'name,category,buyPrice,sellPrice,stock,minStock',
        'Coca-Cola 1.5L,Beverages,45,55,24,10',
        'Lucky Me Pancit Canton,Noodles,8,12,50,20',
        'Piattos Cheese,Snacks,15,20,30,15',
        'Alaska Evap Milk,Dairy & Eggs,25,30,18,10',
        'Palmolive Shampoo 12ml,Personal Care,8,10,40,20'
    ].join('\n');

    window.csvHandler.downloadCSV(sampleData, 'TindaTech_Sample_Template.csv');
    showNotification('✅ Sample CSV template downloaded!', 'success');
}

// ============================================
// PART 6: ENHANCED FORECASTING UI
// ============================================

let selectedForecastModel = 'auto';

function selectForecastModel(model) {
    selectedForecastModel = model;

    // Update UI
    document.querySelectorAll('.model-badge').forEach(badge => {
        badge.classList.remove('active');
    });
    const selectedBadge = document.querySelector(`[data-model="${model}"]`);
    if (selectedBadge) selectedBadge.classList.add('active');

    // Regenerate forecasts
    updateProductForecasts();
}

function updateProductForecasts() {
    const forecastResults = document.getElementById('forecast-results');
    if (!forecastResults) return;

    const products = JSON.parse(localStorage.getItem('products')) || [];

    const forecasts = products.map(product => {
        const salesData = product.salesHistory || [];
        if (salesData.length < 3) return null;

        const result = window.forecastingEngine.forecastWithConfidence(
            salesData, 
            7, 
            selectedForecastModel
        );

        return {
            productName: product.name,
            model: result.model,
            nextWeekDemand: result.predictions.reduce((a, b) => a + b, 0),
            avgDaily: result.predictions.reduce((a, b) => a + b, 0) / 7,
            confidence: result.confidenceIntervals,
            currentStock: product.stock
        };
    }).filter(f => f !== null);

    if (forecasts.length === 0) {
        forecastResults.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
                📊 No forecast data available yet. Start recording sales!
            </div>
        `;
        return;
    }

    // Sort by demand (highest first)
    forecasts.sort((a, b) => b.nextWeekDemand - a.nextWeekDemand);

    forecastResults.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 12px; color: var(--accent-primary);">
            Using ${forecasts[0].model} Model
        </div>
        ${forecasts.slice(0, 5).map(f => {
            const stockStatus = f.currentStock < f.nextWeekDemand ? '⚠️' : '✅';
            return `
                <div class="forecast-confidence">
                    <div style="flex: 0 0 150px; font-weight: 600;">
                        ${stockStatus} ${f.productName}
                    </div>
                    <div class="confidence-bar">
                        <div class="confidence-marker" style="left: 50%;"></div>
                    </div>
                    <div style="flex: 0 0 120px; text-align: right; font-size: 14px;">
                        <div><strong>${f.avgDaily.toFixed(1)}</strong> units/day</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${f.nextWeekDemand.toFixed(0)} next week
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
        ${forecasts.length > 5 ? `
            <div style="text-align: center; margin-top: 12px; color: var(--text-secondary); font-size: 14px;">
                ... and ${forecasts.length - 5} more products
            </div>
        ` : ''}
    `;
}

// ============================================
// PART 7: NOTIFICATION SYSTEM
// ============================================

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    // Set background based on type
    switch(type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #00cc66 0%, #009944 100%)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #ffaa00 0%, #ff8800 100%)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #64ffda 0%, #4db8c4 100%)';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// PART 8: INITIALIZATION
// ============================================

// Initialize global instances
window.csvHandler = new CSVHandler();
window.forecastingEngine = new ForecastingEngine();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 TindaTech Phase 1 Initialized');

    // Initialize CSV handlers
    initializeCSVHandlers();

    // Update priority alerts
    updatePriorityAlerts();

    // Update forecasts
    updateProductForecasts();

    // Refresh alerts every 30 seconds
    setInterval(updatePriorityAlerts, 30000);

    console.log('✅ Phase 1 modules loaded: ARIMA/SARIMA, CSV Handler, Enhanced Forecasting');
});

// Export functions for global access
window.TindaTechPhase1 = {
    updatePriorityAlerts,
    selectForecastModel,
    updateProductForecasts,
    exportProductsCSV,
    exportSalesCSV,
    downloadSampleCSV,
    showNotification
};
