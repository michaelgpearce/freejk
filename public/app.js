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
        this.loadAllData();
    }

    async loadAllData() {
        try {
            this.showLoading();

            // Load both campaigns and data in parallel
            await Promise.all([
                this.loadCampaigns(),
                this.loadData()
            ]);

            // Now that both are loaded, render the UI
            this.processData();
            this.populateMarketFilter();
            this.filterData();
            this.hideLoading();

        } catch (error) {
            console.error('Error loading data:', error);
            this.showError(`Failed to load data: ${error.message}`);
        }
    }

    initializeElements() {
        this.marketFilter = document.getElementById('marketFilter');
        this.contactedFilter = document.getElementById('contactedFilter');
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
        this.contactedFilter.addEventListener('change', () => {
            this.filterData();
        });
    }

    async loadData() {
        const jsonResponse = await this.fetchGoogleSpreadsheetJson('data');
        let data = this.parseGoogleSheetsJSON(jsonResponse, ['identifier', 'campaign', 'company_name', 'market', 'url', 'contact_email', 'contact_phone', 'contact_url', 'observed_on', 'observed_source_url', 'enabled']);

        // Filter to only include enabled items
        data = data.filter(item => item.enabled === 'true');

        // Generate identifiers for any items that don't have them
        data.forEach(item => {
            if (!item.identifier) {
                item.identifier = this.generateDataIdentifier(item);
            }
        });

        this.data = data;
    }

    async loadCampaigns() {
        const jsonResponse = await this.fetchGoogleSpreadsheetJson('campaigns');
        this.campaigns = this.parseGoogleSheetsJSON(jsonResponse, ['name', 'description_html', 'contact_template']);

        this.processCampaigns();

        this.campaign = this.campaigns.find(c => c.name === this.campaignName);
        if (!this.campaign) {
            throw new Error(`Campaign "${this.campaignName}" not found in campaigns sheet`);
        }

        document.querySelector('header h1').textContent = this.campaign.name;
        document.querySelector('header .subtitle').innerHTML = this.campaign.description_html;
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

    parseGoogleSheetsJSON(response, columnNames) {
        try {
            if (!response.table || !response.table.rows) {
                throw new Error('Invalid JSON response format');
            }

            // Get column headers and types
            const headers = response.table.cols.map(col =>
                col.label ? col.label.toLowerCase().trim() : ''
            );

            const columnTypes = response.table.cols.map(col => col.type || 'string');

            // Map column names to indices
            const columnIndices = columnNames.reduce((acc, name) => {
                acc[name] = headers.indexOf(name);
                if (acc[name] === -1) {
                    throw new Error(`Required column "${name}" not found in sheet`);
                }
                return acc;
            }, {});

            // Parse data rows
            const data = [];
            response.table.rows.forEach((row, index) => {
                if (row.c && row.c.length > 0) {
                    const item = columnNames.reduce((obj, col) => {
                        const cell = row.c[columnIndices[col]];
                        const columnType = columnTypes[columnIndices[col]];
                        let value = '';

                        if (cell && cell.v !== null && cell.v !== undefined) {
                            // Handle different column types
                            if (columnType === 'date') {
                                value = this.parseDateValue(cell);
                            } else {
                                // For non-date columns, just convert to string
                                value = String(cell.v);
                            }
                        }

                        obj[col] = this.cleanValue(value);

                        return obj;
                    }, {});

                    data.push(item);
                }
            });

            if (data.length === 0) {
                throw new Error('No data found in the sheet');
            }

            return data;

        } catch (error) {
            console.error('Error parsing Google Sheets JSON:', error);
            throw new Error(`Failed to parse JSON response: ${error.message}`);
        }
    }

    async fetchGoogleSpreadsheetJson(sheetName) {
        // Construct the Google Sheets JSON URL
        const jsonUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${sheetName}`;

        const response = await fetch(jsonUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${sheetName}: ${response.status} ${response.statusText}`);
        }

        const jsonText = await response.text();

        try {
            // Remove the leading "/*O_o*/\ngoogle.visualization.Query.setResponse(" and trailing ");" to isolate JSON
            const start = jsonText.indexOf('{');
            const end = jsonText.lastIndexOf('}') + 1;
            const jsonString = jsonText.slice(start, end);

            // Parse the extracted JSON string
            return JSON.parse(jsonString);
        } catch (error) {
            throw new Error(`Failed to parse JSON response from ${sheetName}: ${error.message}`);
        }
    }

    parseDateValue(cell) {
        let value = '';

        if (cell.f) {
            // If there's a formatted value (f), use it for dates
            value = cell.f;
        } else if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
            // Handle Google Sheets Date() format like "Date(2024,0,15)"
            const dateMatch = cell.v.match(/Date\((\d+),(\d+),(\d+)\)/);
            if (dateMatch) {
                const year = parseInt(dateMatch[1]);
                const month = parseInt(dateMatch[2]); // Google Sheets months are 0-based
                const day = parseInt(dateMatch[3]);
                const date = new Date(year, month, day);
                value = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
            } else {
                value = String(cell.v);
            }
        } else if (typeof cell.v === 'number') {
            // Handle Excel/Google Sheets serial date numbers
            // Google Sheets uses days since December 30, 1899
            const date = new Date((cell.v - 25569) * 86400 * 1000);
            value = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        } else {
            value = String(cell.v);
        }

        return value;
    }

    cleanValue(value) {
        if (!value) return '';

        // For JSON, we shouldn't need to remove quotes, but we still want to trim
        let cleaned = String(value).trim();

        // Convert common newline representations back to actual newlines (just in case)
        cleaned = cleaned
            .replace(/\\n/g, '\n')           // Convert literal \n to actual newlines
            .replace(/\r\n/g, '\n')         // Convert Windows line endings
            .replace(/\r/g, '\n');          // Convert Mac line endings

        return cleaned;
    }

    generateDataIdentifier(dataElement) {
        // Create identifier from campaign, company_name, and market
        const parts = [
            dataElement.campaign || '',
            dataElement.market || '',
            dataElement.company_name || ''
        ];

        // Join parts, convert to lowercase, and replace sequential non-alphanumeric chars with dash
        return parts
            .join(' ')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')  // Replace one or more non-alphanumeric chars with single dash
            .replace(/^-+|-+$/g, '');     // Remove leading/trailing dashes
    }

    getCompanyContactedAtMap() {
        try {
            const stored = localStorage.getItem('companyContactedAtMap');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error reading companyContactedAtMap from localStorage:', error);
            return {};
        }
    }

    setCompanyContacted(identifier, contactedAt = null) {
        try {
            const contactMap = this.getCompanyContactedAtMap();

            if (contactedAt) {
                contactMap[identifier] = contactedAt;
            } else {
                delete contactMap[identifier];
            }

            localStorage.setItem('companyContactedAtMap', JSON.stringify(contactMap));
        } catch (error) {
            console.error('Error updating companyContactedAtMap in localStorage:', error);
        }
    }

    isCompanyContacted(identifier) {
        const contactMap = this.getCompanyContactedAtMap();
        return !!contactMap[identifier];
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

        // Sort data by observed_on date (most recent first), then by company name
        // Items with no observed_on date appear last
        this.data.sort((a, b) => {
            const hasDateA = a.observed_on && a.observed_on.trim() !== '';
            const hasDateB = b.observed_on && b.observed_on.trim() !== '';
            
            const dateA = hasDateA ? new Date(a.observed_on) : null;
            const dateB = hasDateB ? new Date(b.observed_on) : null;
            
            // If both have valid dates, sort by date (most recent first)
            if (dateA && dateB) {
                const dateComparison = dateB.getTime() - dateA.getTime();
                if (dateComparison !== 0) {
                    return dateComparison;
                }
            }
            // If only A has a date, A comes first
            else if (dateA && !dateB) {
                return -1;
            }
            // If only B has a date, B comes first
            else if (!dateA && dateB) {
                return 1;
            }
            // If neither has a date, or dates are equal, sort by company name
            return a.company_name.localeCompare(b.company_name);
        });
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
        const selectedContactStatus = this.contactedFilter.value;

        let filteredData;

        if (selectedMarket) {
            filteredData = this.data.filter(item => item.market === selectedMarket);
        } else {
            filteredData = [...this.data];
        }

        // Filter by campaign
        filteredData = filteredData.filter(item => item.campaign === this.campaignName);

        // Filter by contact status
        if (selectedContactStatus === 'contacted') {
            filteredData = filteredData.filter(item => this.isCompanyContacted(item.identifier));
        } else if (selectedContactStatus === 'not-contacted') {
            filteredData = filteredData.filter(item => !this.isCompanyContacted(item.identifier));
        }
        // If selectedContactStatus is empty ("Any"), no additional filtering is needed

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
        this.setupContactTemplateEventListeners();
        this.setupContactCheckboxEventListeners();
    }

    setupContactTemplateEventListeners() {
        document.querySelectorAll('.contact-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemData = JSON.parse(btn.getAttribute('data-item'));
                this.showContactTemplateModal(itemData);
            });
        });
    }

    setupContactCheckboxEventListeners() {
        document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const identifier = checkbox.getAttribute('data-identifier');

                if (checkbox.checked) {
                    // Add to localStorage with current timestamp
                    this.setCompanyContacted(identifier, Date.now());
                } else {
                    // Remove from localStorage
                    this.setCompanyContacted(identifier, null);
                }
            });
        });
    }

    showContactTemplateModal(item) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('contact-template-modal');
        if (!modal) {
            modal = this.createContactTemplateModal();
            document.body.appendChild(modal);
        }

        // Render the template with the item data
        const renderedTemplate = this.renderTemplate(this.campaign.contact_template, item);

        // Update modal content
        const modalBody = modal.querySelector('.modal-body');
        const copyBtn = modal.querySelector('.modal-copy-btn');

        modalBody.textContent = renderedTemplate;
        copyBtn.onclick = () => this.copyToClipboard(renderedTemplate);

        // Show modal
        modal.style.display = 'flex';
    }

    renderTemplate(template, data) {
        return template.replace(/{(.*?)}/g, (match, p1) => {
            const key = p1.trim();
            return data[key] || '';
        });
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Template copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy text. Please try manually.');
        });
    }

    createContactTemplateModal() {
        const modal = document.createElement('div');
        modal.id = 'contact-template-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Contact Template</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body"></div>
                <div class="modal-footer">
                    <button class="modal-copy-btn">📋 Copy to Clipboard</button>
                    <button class="modal-close-btn">Close</button>
                </div>
            </div>
        `;

        // Set up close functionality
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.querySelector('.modal-close-btn').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        return modal;
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
        const isContacted = this.isCompanyContacted(item.identifier);

        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        ${item.url ?
                            `<a href="${this.escapeHtml(formatUrl(item.url))}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(item.company_name)}</a>` :
                            this.escapeHtml(item.company_name)
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

                        <div class="contact-status-section">
                            <label class="contact-checkbox-label">
                                <input type="checkbox" class="contact-checkbox"
                                       data-identifier="${this.escapeHtml(item.identifier)}"
                                       ${isContacted ? 'checked' : ''}>
                                <span class="checkbox-text">Contacted</span>
                            </label>
                        </div>

                        ${this.campaign && this.campaign.contact_template ? `
                            <div class="contact-template-section">
                                <button class="contact-template-btn" data-company-name="${this.escapeHtml(item.company_name)}" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                                    💬 Contact Template
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>

                ${item.observed_on ? `
                    <div class="card-footer">
                        Observed On: ${item.observed_source_url ?
                            `<a href="${this.escapeHtml(formatUrl(item.observed_source_url))}" target="_blank" rel="noopener noreferrer">${formatDate(item.observed_on)}</a>` :
                            formatDate(item.observed_on)
                        }
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
const DEMO_CAMPAIGNS = [
    {
        name: "Free Jimmy Kimmel",
        description_html: "A campaign to support organizations that provide resources and aid.",
        contact_template: `Subject: Partnership Inquiry - {company_name}

Dear {company_name} Team,

I hope this message finds you well. I'm reaching out regarding a potential partnership opportunity with your organization.

We are particularly interested in collaborating with {company_name} to support community initiatives in the {market} area. Your work in this field aligns perfectly with our mission.

I would love to schedule a brief conversation to discuss how we might work together. Would you be available for a 15-20 minute call in the coming week?

You can reach me at the contact information below, or feel free to reach out directly to {contact_email} or {contact_phone}.

Looking forward to connecting with you soon.

Best regards,
[Your Name]
[Your Title]
[Your Organization]`
    }
];

const DEMO_DATA = [
    {
        campaign: "Free Jimmy Kimmel",
        company_name: "Community Resource Center",
        market: "Downtown",
        url: "example.com/resource-center",
        contact_email: "info@resourcecenter.org",
        contact_phone: "(555) 123-4567",
        contact_url: "(555) 12url-4567",
        observed_on: "2024-01-15",
        observed_source_url: "https://news.example.com/community-resource-story",
        identifier: "free-jimmy-kimmel-downtown-community-resource-center",
        enabled: "true"
    },
    {
        campaign: "Free Jimmy Kimmel",
        company_name: "Legal Aid Society",
        market: "Midtown",
        url: "legalaid-example.org",
        contact_email: "help@legalaid.org",
        contact_phone: "(555) 234-5678",
        contact_url: "(555) 23url-5678",
        observed_on: "2024-01-10",
        observed_source_url: "https://blog.example.com/legal-aid-coverage",
        identifier: "free-jimmy-kimmel-midtown-legal-aid-society",
        enabled: "true"
    },
    {
        campaign: "Free Jimmy Kimmel",
        company_name: "Food Bank Network",
        market: "Suburbs",
        url: "foodbank-network.org",
        contact_email: "contact@foodbank.org",
        contact_phone: "(555) 345-6789",
        contact_url: "(555) 34url-6789",
        observed_on: "2024-01-20",
        observed_source_url: "",
        identifier: "free-jimmy-kimmel-suburbs-food-bank-network",
        enabled: "true"
    },
    {
        campaign: "Free Jimmy Kimmel",
        company_name: "Housing Authority",
        market: "Downtown",
        url: "housing-authority.gov",
        contact_email: "housing@city.gov",
        contact_phone: "(555) 456-7890",
        contact_url: "(555) 45url-7890",
        observed_on: "2024-01-12",
        observed_source_url: "https://local.example.com/housing-news",
        identifier: "free-jimmy-kimmel-downtown-housing-authority",
        enabled: "true"
    },
    {
        campaign: "Free Jimmy Kimmel",
        company_name: "Disabled Test Company",
        market: "Downtown",
        url: "disabled-company.example.com",
        contact_email: "test@disabled.com",
        contact_phone: "(555) 999-9999",
        contact_url: "https://disabled-company.example.com/contact",
        observed_on: "2024-01-01",
        observed_source_url: "https://example.com/disabled-test",
        identifier: "free-jimmy-kimmel-downtown-disabled-test-company",
        enabled: "false"
    },
    {
        campaign: "Free Jimmy Kimmel",
        company_name: "ABC No Date Company",
        market: "Midtown",
        url: "abc-nodate.example.com",
        contact_email: "contact@abc-nodate.com",
        contact_phone: "(555) 111-2222",
        contact_url: "https://abc-nodate.example.com/contact",
        observed_on: "",
        observed_source_url: "",
        identifier: "free-jimmy-kimmel-midtown-abc-no-date-company",
        enabled: "true"
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

                this.campaigns = DEMO_CAMPAIGNS;
                this.campaign = this.campaigns.find(c => c.name === this.campaignName);

                // Filter demo data to only include enabled items
                let data = DEMO_DATA.filter(item => item.enabled === 'true');

                // Generate identifiers for any items that don't have them
                data.forEach(item => {
                    if (!item.identifier) {
                        item.identifier = this.generateDataIdentifier(item);
                    }
                });

                this.data = data;

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
