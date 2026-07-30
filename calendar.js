// Optional Google Calendar integration.
// Only activates when credentials.json is present in this folder.
//
// Setup (one-time):
//   1. Go to console.cloud.google.com → New Project
//   2. Enable "Google Calendar API"
//   3. Create OAuth 2.0 credentials (Desktop app) → download as credentials.json
//   4. Place credentials.json in this folder and restart the app
//   5. A browser window will open → sign in → calendar sync is active

const fs   = require('fs');
const path = require('path');
const http = require('http');

const CREDS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let auth = null;

async function getAuth() {
  if (auth) return auth;
  if (!fs.existsSync(CREDS_PATH)) return null;

  const { google } = require('googleapis');
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;

  const oAuth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:9742');

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
    auth = oAuth2;
    return auth;
  }

  // First-time OAuth flow
  auth = await doOAuthFlow(oAuth2);
  return auth;
}

async function doOAuthFlow(oAuth2) {
  const { google } = require('googleapis');
  const { shell } = require('electron');

  oAuth2.redirectUri = 'http://localhost:9742';
  const authUrl = oAuth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  shell.openExternal(authUrl);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:9742');
        const code = url.searchParams.get('code');
        if (!code) { res.end('No code received.'); return; }

        res.end('<h2>Connected! You can close this tab.</h2>');
        server.close();

        const { tokens } = await oAuth2.getToken(code);
        oAuth2.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
        resolve(oAuth2);
      } catch (err) {
        reject(err);
      }
    });
    server.listen(9742);
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout')); }, 120_000);
  });
}

async function getCalendarEvents(dateStr) {
  try {
    const oAuth2 = await getAuth();
    if (!oAuth2) return null;

    const { google } = require('googleapis');
    const calendar = google.calendar({ version: 'v3', auth: oAuth2 });

    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayEnd   = new Date(dateStr + 'T23:59:59');

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 6,
    });

    const items = res.data.items || [];
    return items.map(ev => {
      const start = ev.start.dateTime || ev.start.date;
      const timeLabel = start.includes('T')
        ? new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'All day';
      return `${timeLabel}: ${ev.summary}`;
    });
  } catch (err) {
    console.error('[calendar]', err.message);
    return null;
  }
}

module.exports = { getCalendarEvents };
