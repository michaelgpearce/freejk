# Free JK

A mobile-friendly Single Page Application (SPA) that uses Google Sheets as a read-only datastore backend to display filterable directory information.

## Features

- **Mobile-first responsive design** - Works perfectly on all device sizes
- **Google Sheets integration** - Uses Google Sheets as a backend database
- **Location filtering** - Filter entries by location using a dropdown
- **Contact information display** - Shows email and phone contacts with clickable links
- **Modern UI** - Clean, professional design with smooth animations

## Google Sheets Setup

To connect your own Google Sheet:

1. **Create a Google Sheet** with the following columns (exact names required):
   - `name` - The name/title of the entry
   - `location` - The location for filtering
   - `url` - Website URL (optional)
   - `contact_email` - Email address (optional)
   - `contact_phone` - Phone number (optional)
   - `updated_at` - Last update date (optional)

2. **Publish your sheet to the web:**
   - In Google Sheets, go to `File > Publish to the web`
   - Choose "Entire Document" and "CSV" format
   - Click "Publish"

3. **Configure the app:**
   - Open `app.js`
   - Find the `GOOGLE_SHEETS_CONFIG` object
   - Replace `YOUR_SHEET_ID_HERE` with your Google Sheet ID (found in the URL)
   - Update `SHEET_NAME` if your sheet tab has a different name

4. **Get your Sheet ID:**
   - From your Google Sheet URL: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
   - Copy the `SHEET_ID` part

## Demo Mode

The app includes demo data that displays when Google Sheets isn't configured. This allows you to test the functionality before setting up your own sheet.

## File Structure

```
/
├── index.html      # Main HTML structure
├── styles.css      # Mobile-friendly CSS styling
├── app.js         # JavaScript application logic
└── README.md      # This file
```

## Technology Stack

- **HTML5** - Semantic markup structure
- **CSS3** - Responsive design with Flexbox and Grid
- **Vanilla JavaScript** - No frameworks, pure ES6+ JavaScript
- **Google Sheets API** - CSV export for data fetching

## Browser Support

Works in all modern browsers that support ES6+ features:
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Local Development

Simply open `index.html` in a web browser. No build process or server required.

For production deployment, host the files on any static web hosting service like:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront

## License

Apache License 2.0 - see LICENSE file for details.
