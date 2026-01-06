const express = require('express');
const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// In-memory sessions (per-user browser page)
const sessions = new Map();

// Serve static HTML/JS for client
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: create a new browser session
app.post('/api/session', async (req, res) => {
  try {
    const url = req.body.url || 'https://example.com';
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(url);

    const sessionId = uuidv4();
    sessions.set(sessionId, { browser, context, page });

    res.json({ sessionId });
  } catch (e) {
    console.error('Create session error', e);
    res.status(500).json({ error: e.message });
  }
});

// API: navigate existing session to a new URL
app.post('/api/navigate', async (req, res) => {
  try {
    const { sessionId, url } = req.body;
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await session.page.goto(url);
    res.json({ success: true });
  } catch (e) {
    console.error('Navigate error', e);
    res.status(500).json({ error: e.message });
  }
});

// API: screenshot for streaming the page
app.get('/api/screenshot/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).send('Session not found');

    const buffer = await session.page.screenshot({ fullPage: true });
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (e) {
    console.error('Screenshot error', e);
    res.status(500).send('Screenshot error');
  }
});

// API: close session
app.post('/api/close', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await session.browser.close();
    sessions.delete(sessionId);
    res.json({ success: true });
  } catch (e) {
    console.error('Close session error', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Remote browser listening on port ${PORT}`);
});
