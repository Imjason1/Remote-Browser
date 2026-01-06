const express = require("express");
const { chromium } = require("playwright");
const WebSocket = require("ws");
const path = require("path");
const pageWidth = r.width;
const pageHeight = r.height;
await page.setViewportSize({ width: pageWidth, height: pageHeight });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const server = app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});

const wss = new WebSocket.Server({ server });

wss.on("connection", async (ws) => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();
  await page.goto("https://www.google.com");

  let streaming = true;

  async function stream() {
    while (streaming && ws.readyState === ws.OPEN) {
      const shot = await page.screenshot({ type: "jpeg", quality: 60 });
      ws.send(shot);
      await new Promise(r => setTimeout(r, 50));
    }
  }

  stream();

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    const x = data.x;
    const y = data.y;

    try {
      switch (data.type) {
        case "mousemove":
          await page.mouse.move(x, y);
          break;
        case "mousedown":
          await page.mouse.down();
          break;
        case "mouseup":
          await page.mouse.up();
          break;
        case "wheel":
          await page.mouse.wheel(0, data.delta);
          break;
        case "keydown":
          await page.keyboard.down(data.key);
          break;
        case "keyup":
          await page.keyboard.up(data.key);
          break;
        case "type":
          await page.keyboard.insertText(data.text);
          break;
        case "navigate":
          await page.goto(data.url.startsWith("http") ? data.url : "https://" + data.url);
          break;
      }
    } catch (e) {
      console.log("Input error:", e.message);
    }
  });

  ws.on("close", async () => {
    streaming = false;
    await browser.close();
  });
});
