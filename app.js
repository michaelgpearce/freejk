// Google Sheets configuration
const GOOGLE_SHEETS_CONFIG = {
    // Replace with your Google Sheet ID (from the URL)
    SHEET_ID: '1dJdlvxDd4yKczQbVeookSYM28NzC1ABTgvhSrAXZNcQ',
};

class FreeJKApp {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.markets = new Set();

        this.initializeElements();
        this.bindEvents();
        this.loadCampaigns();
        this.loadData();
    }

    initializeElements() {
        this.marketFilter = document.getElementById('marketFilter');
        this.cardsContainer = document.getElementById('cardsContainer');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.results = document.getElementById('results');
        this.campaignName = 'Free Jimmy Kimmel';
    }

    bindEvents() {
        this.marketFilter.addEventListener('change', () => {
            this.filterData();
        });
    }

    async loadData() {
        try {
            this.showLoading();

            // Construct the Google Sheets CSV URL
            const csvUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=data`;

            const response = await fetch(csvUrl);

            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
            }

            const csvText = await response.text();
            this.data = this.parseCSV(csvText, ['campaign', 'name', 'market', 'url', 'contact_email', 'contact_phone', 'contact_url', 'observed_on']);

            if (this.data.length === 0) {
                throw new Error('No data found in the sheet');
            }

            this.processData();
            this.populateMarketFilter();
            this.filterData();
            this.hideLoading();

        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(`Failed to load data: ${error.message}`);
        }
    }

    async loadCampaigns() {
        try {
            this.showLoading();

            // Construct the Google Sheets CSV URL
            const csvUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=campaigns`;

            const response = await fetch(csvUrl);

            if (!response.ok) {
                throw new Error(`Failed to fetch campaigns: ${response.status} ${response.statusText}`);
            }

            const csvText = await response.text();
            this.campaigns = this.parseCSV(csvText, ['name', 'description_html']);

            if (this.campaigns.length === 0) {
                throw new Error('No data found in the sheet');
            }

            this.processCampaigns();

            this.campaign = this.campaigns.find(c => c.name === this.campaignName);
            if (!this.campaign) {
                throw new Error(`Campaign "${this.campaignName}" not found in campaigns sheet`);
            }

            document.querySelector('header h1').textContent = this.campaign.name;
            document.querySelector('header .subtitle').innerHTML = this.campaign.description_html;

            // this.populateMarketFilter();
            // this.filterData();
            this.hideLoading();

        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(`Failed to load data: ${error.message}`);
        }
    }

    parseCSV(csvText, columnNames) {
        // Split into lines and filter out empty lines
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        // Parse header row
        const headers = this.parseCSVRow(lines[0]).map(h => h.toLowerCase().trim());

        const columnIndices = columnNames.reduce((acc, name) => {
            acc[name] = headers.indexOf(name);

            if (acc[name] === -1) {
                throw new Error(`Required column "${name}" not found in sheet`);
            }
            return acc;
        }, {});

        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const row = this.parseCSVRow(lines[i]);
            if (row.length > 0 && row[0]?.trim()) {
                const item = columnNames.reduce((obj, col) => {
                    obj[col] = this.cleanValue(row[columnIndices[col]]);
                    return obj;
                }, {});
                data.push(item);
            }
        }

        return data;
    }

    parseCSVRow(row) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < row.length; i++) {
            const char = row[i];

            if (char === '"') {
                if (inQuotes && row[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    cleanValue(value) {
        return value ? value.trim().replace(/^"|"$/g, '') : '';
    }

    processCampaigns() {
        // Sort data by name
        this.campaigns.sort((a, b) => a.name.localeCompare(b.name));
    }

    processData() {
        // Extract unique markets
        this.markets = new Set();
        this.data.forEach(item => {
            if (item.market && item.campaign === this.campaignName) {
                this.markets.add(item.market);
            }
        });

        // Sort data by name
        this.data.sort((a, b) => a.name.localeCompare(b.name));
    }

    populateMarketFilter() {
        // Clear existing options except "All Markets"
        const allOption = this.marketFilter.querySelector('option[value=""]');
        this.marketFilter.innerHTML = '';
        this.marketFilter.appendChild(allOption);

        // Add market options
        const sortedMarkets = Array.from(this.markets).sort();
        sortedMarkets.forEach(market => {
            const option = document.createElement('option');
            option.value = market;
            option.textContent = market;
            this.marketFilter.appendChild(option);
        });
    }

    filterData() {
        const selectedMarket = this.marketFilter.value;

        let filteredData;

        if (selectedMarket) {
            filteredData = this.data.filter(item => item.market === selectedMarket);
        } else {
            filteredData = [...this.data];
        }

        filteredData = filteredData.filter(item => item.campaign === this.campaignName);

        this.filteredData = filteredData;

        this.renderCards();
    }

    renderCards() {
        if (this.filteredData.length === 0) {
            this.cardsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No results found</h3>
                    <p>Try selecting a different market or check back later.</p>
                </div>
            `;
            return;
        }

        this.cardsContainer.innerHTML = this.filteredData.map(item => this.createCard(item)).join('');
    }

    createCard(item) {
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString();
            } catch {
                return dateStr;
            }
        };

        const formatUrl = (url) => {
            if (!url) return '';
            // Add https:// if no protocol is specified
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return `https://${url}`;
            }
            return url;
        };

        const displayUrl = item.url || '';
        const fullUrl = formatUrl(item.url);

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        ${item.url ?
                            `<a href="${this.escapeHtml(formatUrl(item.url))}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(item.name)}</a>` :
                            this.escapeHtml(item.name)
                        }
                    </h3>
                    ${item.market ? `<span class="card-market">${this.escapeHtml(item.market)}</span>` : ''}
                </div>

                <div class="card-body">
                    <div class="card-contacts">
                        <h4>Contact Information</h4>

                        ${item.contact_email ? `
                            <div class="contact-item">
                                <span>📧</span>
                                <a href="mailto:${this.escapeHtml(item.contact_email)}?subject=Inquiry&body=Hello">
                                    ${this.escapeHtml(item.contact_email)}
                                </a>
                            </div>
                        ` : ''}

                        ${item.contact_phone ? `
                            <div class="contact-item">
                                <span>📞</span>
                                <a href="tel:${this.escapeHtml(item.contact_phone.replace(/\s+/g, ''))}">
                                    ${this.escapeHtml(item.contact_phone)}
                                </a>
                            </div>
                        ` : ''}

                        ${item.contact_url ? `
                            <div class="contact-item">
                                <span>🌐</span>
                                <a href="${this.escapeHtml(item.contact_url)}" target="_blank" rel="noopener noreferrer">
                                    ${this.escapeHtml(item.contact_url)}
                                </a>
                            </div>
                        ` : ''}
                    </div>
                </div>

                ${item.observed_on ? `
                    <div class="card-footer">
                        Observed On: ${formatDate(item.observed_on)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading() {
        this.loading.style.display = 'block';
        this.error.style.display = 'none';
        this.results.style.display = 'none';
    }

    hideLoading() {
        this.loading.style.display = 'none';
        this.results.style.display = 'block';
    }

    showError(message) {
        this.loading.style.display = 'none';
        this.error.style.display = 'block';
        this.error.textContent = message;
        this.results.style.display = 'none';
    }
}

// Demo data fallback for when Google Sheets is not configured
const DEMO_DATA = [
    {
        name: "Community Resource Center",
        market: "Downtown",
        url: "example.com/resource-center",
        contact_email: "info@resourcecenter.org",
        contact_phone: "(555) 123-4567",
        contact_url: "(555) 12url-4567",
        observed_on: "2024-01-15"
    },
    {
        name: "Legal Aid Society",
        market: "Midtown",
        url: "legalaid-example.org",
        contact_email: "help@legalaid.org",
        contact_phone: "(555) 234-5678",
        contact_url: "(555) 23url-5678",
        observed_on: "2024-01-10"
    },
    {
        name: "Food Bank Network",
        market: "Suburbs",
        url: "foodbank-network.org",
        contact_email: "contact@foodbank.org",
        contact_phone: "(555) 345-6789",
        contact_url: "(555) 34url-6789",
        observed_on: "2024-01-20"
    },
    {
        name: "Housing Authority",
        market: "Downtown",
        url: "housing-authority.gov",
        contact_email: "housing@city.gov",
        contact_phone: "(555) 456-7890",
        contact_url: "(555) 45url-7890",
        observed_on: "2024-01-12"
    }
];

// Modified FreeJKApp to use demo data when Google Sheets is not configured
class FreeJKAppWithDemo extends FreeJKApp {
    async loadData() {
        try {
            // Check if Google Sheets is configured
            if (GOOGLE_SHEETS_CONFIG.SHEET_ID === 'YOUR_SHEET_ID_HERE') {
                console.log('Google Sheets not configured, using demo data');
                this.showLoading();

                // Simulate network delay
                await new Promise(resolve => setTimeout(resolve, 1000));

                this.data = DEMO_DATA;
                this.processData();
                this.populateMarketFilter();
                this.filterData();
                this.hideLoading();

                // Show configuration message
                this.showConfigurationMessage();
                return;
            }

            // Use the original loadData method if configured
            await super.loadData();

        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(`Failed to load data: ${error.message}`);
        }
    }

    showConfigurationMessage() {
        const message = document.createElement('div');
        message.style.cssText = `
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            text-align: center;
        `;
        message.innerHTML = `
            <strong>Demo Mode:</strong> Configure your Google Sheet ID in app.js to use real data.
            <br><small>Currently showing sample data for demonstration purposes.</small>
        `;

        this.results.insertBefore(message, this.cardsContainer);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FreeJKAppWithDemo();
});
