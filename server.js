// server.js
// Remote browser / proxy with per-user sessions, Playwright, drag support, WebRTC placeholders
// CommonJS version for Render

const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { chromium } = require('playwright'); // npm install playwright
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(bodyParser.json());

// In-memory user sessions
const sessions = {};

// Serve a basic HTML client
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Remote Browser</title>
      <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        #screen { width: 100%; height: 100%; touch-action: none; user-select: none; }
        #toolbar { position: fixed; top: 0; left: 0; width: 100%; padding: 4px; background: rgba(0,0,0,0.7); color: white; z-index: 999; }
      </style>
    </head>
    <body>
      <div id="toolbar">
        <input id="urlInput" type="text" placeholder="https://example.com" style="width:70%;">
        <button id="go">Go</button>
      </div>
      <canvas id="screen"></canvas>
      <script>
        const canvas = document.getElementById('screen');
        const ctx = canvas.getContext('2d');
        let ws;
        let sessionId;

        function resizeCanvas() {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        function startSession(url) {
          fetch('/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          })
          .then(r => r.json())
          .then(data => {
            sessionId = data.sessionId;
            ws = new WebSocket(\`ws://\${location.host}/ws/\${sessionId}\`);
            ws.binaryType = 'arraybuffer';
            ws.onmessage = (e) => {
              const img = new Image();
              img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              img.src = URL.createObjectURL(new Blob([e.data], { type: 'image/png' }));
            };
          });
        }

        document.getElementById('go').addEventListener('click', () => {
          startSession(document.getElementById('urlInput').value);
        });

        // Drag / click support
        canvas.addEventListener('pointerdown', e => sendMouse(e));
        canvas.addEventListener('pointermove', e => { if (e.pressure > 0) sendMouse(e); });
        canvas.addEventListener('pointerup', e => sendMouse(e));

        function sendMouse(e) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const rect = canvas.getBoundingClientRect();
          ws.send(JSON.stringify({
            type: 'mouse',
            x: e.clientX / rect.width,
            y: e.clientY / rect.height,
            action: e.pressure > 0 ? 'down' : 'up'
          }));
        }
      </script>
    </body>
    </html>
  `);
});

// Start a new browser session
app.post('/start', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const sessionId = uuidv4();
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    sessions[sessionId] = { browser, context, page };
    res.json({ sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const sessionId = req.url.split('/').pop();
  const session = sessions[sessionId];
  if (!session) {
    ws.close();
    return;
  }

  const { page } = session;

  // Send periodic screenshots
  const interval = setInterval(async () => {
    try {
      const buffer = await page.screenshot({ type: 'png' });
      if (ws.readyState === WebSocket.OPEN) ws.send(buffer);
    } catch (e) {}
  }, 500);

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'mouse') {
        const box = await page.viewportSize();
        const x = data.x * box.width;
        const y = data.y * box.height;
        if (data.action === 'down') await page.mouse.click(x, y, { button: 'left', clickCount: 1 });
      }
    } catch (e) {}
  });

  ws.on('close', () => clearInterval(interval));
});

// Start server
server.listen(PORT, () => console.log(`Remote browser listening on port ${PORT}`));
