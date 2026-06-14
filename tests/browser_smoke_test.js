const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 30000;

async function main() {
  const serverPort = await getFreePort();
  const debugPort = await getFreePort();
  const server = await startServer(serverPort);
  const browser = await startBrowser(debugPort);

  try {
    const host = await openPage(debugPort, 'about:blank');
    const guest = await openPage(debugPort, 'about:blank');

    await initClient(host, serverPort);
    await initClient(guest, serverPort);

    await sendClient(host, {
      type: 'create_room',
      seat: 'S',
      waitForSeat: true,
      name: 'Smoke Host',
    });
    await waitFor(host, `window.smoke.latest('room_state')?.room?.code`);
    const roomCode = await evalValue(host, `window.smoke.latest('room_state').room.code`);

    await sendClient(guest, {
      type: 'join_room',
      roomCode,
      seat: '',
      waitForSeat: true,
      name: 'Smoke Guest',
    });
    await waitFor(guest, `window.smoke.latest('room_state')?.room?.code === ${JSON.stringify(roomCode)}`);

    await sendClient(host, { type: 'choose_seat', seat: 'S' });
    await sendClient(guest, { type: 'choose_seat', seat: 'W' });
    await waitFor(host, `
      window.smoke.latest('room_state')?.room?.seats?.S?.name === 'Smoke Host' &&
      window.smoke.latest('room_state')?.room?.seats?.W?.name === 'Smoke Guest' &&
      window.smoke.latest('room_state')?.room?.hostSeat === 'S'
    `);
    await waitFor(guest, `
      window.smoke.latest('room_state')?.room?.seats?.S?.name === 'Smoke Host' &&
      window.smoke.latest('room_state')?.room?.seats?.W?.name === 'Smoke Guest' &&
      window.smoke.latest('room_state')?.room?.hostSeat === 'S'
    `);

    await sendClient(host, {
      type: 'start_match',
      actionId: 'start-smoke-match',
      expectedRevision: 0,
      matchHands: 3,
    });
    await waitFor(host, `window.smoke.latest('game_state')?.revision >= 1`);
    await waitFor(guest, `window.smoke.latest('game_state')?.revision >= 1`);
    const revisionBeforeDisconnect = await evalValue(guest, `window.smoke.latest('game_state').revision`);
    const hostState = await evalValue(host, `window.smoke.latest('game_state').state`);
    const guestState = await evalValue(guest, `window.smoke.latest('game_state').state`);

    assert.strictEqual(hostState.round, 1);
    assert.strictEqual(hostState.matchHands, 3);
    assert.strictEqual(hostState.hands.S.length, 12);
    assert.strictEqual(guestState.hands.W.length, 12);
    assert.ok(hostState.hands.S.every(card => !card.hidden), 'host receives its private hand');
    assert.ok(hostState.hands.W.every(card => card.hidden), 'host cannot see guest hand');
    assert.ok(guestState.hands.W.every(card => !card.hidden), 'guest receives its private hand');
    assert.ok(guestState.hands.S.every(card => card.hidden), 'guest cannot see host hand');
    assert.ok(hostState.kitty.every(card => card.hidden), 'kitty is hidden before entitlement');
    assert.notDeepStrictEqual(guestState, hostState);

    await evalValue(host, `window.smoke.ws.close()`);
    await waitFor(guest, `
      window.smoke.latest('room_state')?.room?.hostSeat === 'W' &&
      window.smoke.latest('room_state')?.isHost === true
    `);
    await waitFor(guest, `
      window.smoke.latest('game_state')?.revision > ${revisionBeforeDisconnect}
    `);
    const progressed = await evalValue(guest, `window.smoke.latest('game_state')`);
    assert.ok(progressed.revision > 1, 'server advances state after host disconnect');

    const app = await openPage(debugPort, `http://127.0.0.1:${serverPort}/trumps_table.html`);
    await delay(3000);
    const appDiagnostic = await evalValue(app, `({
      hasStart: document.querySelector('#start-title')?.textContent === 'Choose a table',
      rootHtml: document.querySelector('#root')?.innerHTML || '',
      reactType: typeof window.React,
      babelType: typeof window.Babel,
      title: document.title
    })`);
    assert.ok(appDiagnostic.hasStart, `app failed to render: ${JSON.stringify(appDiagnostic)}`);
    await fill(app, '#start-player-name', 'UI Smoke Host');
    await clickButtonByText(app, 'Host Game');
    await waitFor(app, `document.querySelector('.lobby-code b')?.textContent?.length === 5`);
    await click(app, 'button[aria-label="Choose seat S"]');
    await waitFor(app, `document.querySelector('.lobby-start') && !document.querySelector('.lobby-start').disabled`);
    await click(app, '.lobby-start');
    await waitFor(app, `document.querySelector('.topbar') && document.querySelector('.dealing-animation')`);

    const localApp = await openPage(debugPort, `http://127.0.0.1:${serverPort}/trumps_table.html`);
    await waitFor(localApp, `document.querySelector('#start-title')?.textContent === 'Choose a table'`);
    await fill(localApp, '#start-player-name', 'Local Smoke Player');
    await clickButtonByText(localApp, 'Play Local');
    await waitFor(localApp, `document.querySelector('.topbar') && document.querySelector('.dealing-animation')`);
    await waitFor(localApp, `
      document.querySelector('.center-disc.bidding') &&
      document.querySelector('.center-disc.bidding')?.textContent?.includes('Auction')
    `);

    const transferOwner = await openPage(debugPort, 'about:blank');
    const transferGuest = await openPage(debugPort, 'about:blank');
    await initClient(transferOwner, serverPort);
    await initClient(transferGuest, serverPort);
    await sendClient(transferOwner, {
      type: 'create_room',
      waitForSeat: true,
      name: 'Transfer Owner',
    });
    await waitFor(transferOwner, `window.smoke.latest('room_state')?.room?.code`);
    const transferCode = await evalValue(transferOwner, `window.smoke.latest('room_state').room.code`);
    await sendClient(transferGuest, {
      type: 'join_room',
      roomCode: transferCode,
      waitForSeat: true,
      name: 'Transfer Guest',
    });
    await waitFor(transferGuest, `window.smoke.latest('room_state')?.room?.code === ${JSON.stringify(transferCode)}`);
    await sendClient(transferOwner, { type: 'choose_seat', seat: 'S' });
    await sendClient(transferGuest, { type: 'choose_seat', seat: 'W' });
    await waitFor(transferGuest, `window.smoke.latest('room_state')?.room?.hostSeat === 'S'`);
    await evalValue(transferOwner, `window.smoke.ws.close()`);
    await waitFor(transferGuest, `
      window.smoke.latest('room_state')?.room?.hostSeat === 'W' &&
      window.smoke.latest('room_state')?.isHost === true
    `);
    await sendClient(transferGuest, {
      type: 'start_match',
      actionId: 'transferred-host-start',
      expectedRevision: 0,
      matchHands: 3,
    });
    await waitFor(transferGuest, `window.smoke.latest('game_state')?.revision >= 1`);

    const uiTransferOwner = await openPage(debugPort, 'about:blank');
    const transferGuestApp = await openPage(debugPort, `http://localhost:${serverPort}/trumps_table.html`);
    await initClient(uiTransferOwner, serverPort);
    await waitFor(transferGuestApp, `document.querySelector('#start-title')`);
    await sendClient(uiTransferOwner, {
      type: 'create_room',
      waitForSeat: true,
      name: 'UI Transfer Host',
    });
    await waitFor(uiTransferOwner, `window.smoke.latest('room_state')?.room?.code`);
    const uiTransferCode = await evalValue(uiTransferOwner, `window.smoke.latest('room_state').room.code`);
    await sendClient(uiTransferOwner, { type: 'choose_seat', seat: 'S' });
    await waitFor(uiTransferOwner, `window.smoke.latest('room_state')?.seat === 'S'`);

    await fill(transferGuestApp, '#start-player-name', 'UI Transfer Guest');
    await fill(transferGuestApp, '#start-room-code', uiTransferCode);
    await clickButtonByText(transferGuestApp, 'Join');
    await waitFor(transferGuestApp, `
      document.querySelector('.lobby-code b')?.textContent === ${JSON.stringify(uiTransferCode)}
    `);
    const uiTransferSeatEnabled = await evalValue(
      transferGuestApp,
      `!document.querySelector('button[aria-label="Choose seat W"]').disabled`,
    );
    assert.strictEqual(uiTransferSeatEnabled, true, 'promoted-host guest seat button should be enabled');
    await click(transferGuestApp, 'button[aria-label="Choose seat W"]');
    await waitFor(uiTransferOwner, `
      window.smoke.latest('room_state')?.room?.seats?.W?.name === 'UI Transfer Guest'
    `);
    await waitFor(transferGuestApp, `
      document.querySelector('.lobby-panel h1')?.textContent === 'Table lobby' &&
      document.querySelector('.lobby-seat.mine')?.textContent?.includes('W')
    `);

    await evalValue(uiTransferOwner, `window.smoke.ws.close()`);
    await waitFor(transferGuestApp, `
      document.querySelector('.lobby-panel h1')?.textContent === 'Host lobby' &&
      document.querySelector('.lobby-start') &&
      !document.querySelector('.lobby-start').disabled
    `);

    const abandonedOwner = await openPage(debugPort, 'about:blank');
    const abandonedJoiner = await openPage(debugPort, 'about:blank');
    await initClient(abandonedOwner, serverPort);
    await sendClient(abandonedOwner, {
      type: 'create_room',
      waitForSeat: true,
      name: 'Abandoned Owner',
    });
    await waitFor(abandonedOwner, `window.smoke.latest('room_state')?.room?.code`);
    const abandonedCode = await evalValue(abandonedOwner, `window.smoke.latest('room_state').room.code`);
    await evalValue(abandonedOwner, `window.smoke.ws.close()`);
    await delay(1200);

    await initClient(abandonedJoiner, serverPort);
    await sendClient(abandonedJoiner, {
      type: 'join_room',
      roomCode: abandonedCode,
      waitForSeat: true,
      name: 'Late Joiner',
    });
    await waitFor(abandonedJoiner, `window.smoke.latest('error')?.message === 'Room not found.'`);

    const reconnectOwner = await openPage(debugPort, 'about:blank');
    const reconnectClient = await openPage(debugPort, 'about:blank');
    const reconnectVerifier = await openPage(debugPort, 'about:blank');
    await initClient(reconnectOwner, serverPort);
    await sendClient(reconnectOwner, {
      type: 'create_room',
      waitForSeat: true,
      name: 'Reconnect Owner',
    });
    await waitFor(reconnectOwner, `window.smoke.latest('room_state')?.room?.code`);
    const reconnectCode = await evalValue(reconnectOwner, `window.smoke.latest('room_state').room.code`);
    await sendClient(reconnectOwner, { type: 'choose_seat', seat: 'S' });
    await waitFor(reconnectOwner, `window.smoke.latest('room_state')?.seat === 'S'`);
    const reconnectToken = await evalValue(reconnectOwner, `window.smoke.latest('room_state').token`);
    await evalValue(reconnectOwner, `window.smoke.ws.close()`);
    await delay(400);

    await initClient(reconnectClient, serverPort);
    await sendClient(reconnectClient, {
      type: 'join_room',
      roomCode: reconnectCode,
      token: reconnectToken,
      waitForSeat: true,
      name: 'Reconnect Owner',
    });
    await waitFor(reconnectClient, `window.smoke.latest('room_state')?.seat === 'S'`);
    await delay(800);

    await initClient(reconnectVerifier, serverPort);
    await sendClient(reconnectVerifier, {
      type: 'join_room',
      roomCode: reconnectCode,
      waitForSeat: true,
      name: 'Reconnect Verifier',
    });
    await waitFor(reconnectVerifier, `window.smoke.latest('room_state')?.room?.code === ${JSON.stringify(reconnectCode)}`);

    console.log(`browser smoke ok: room ${roomCode}, phase ${progressed.state.phase}, revision ${progressed.revision}`);
  } finally {
    await closeBrowser(browser);
    server.kill();
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = childProcess.spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        TRUMPS_TIMER_SCALE: '0.1',
        TRUMPS_ABANDONED_ROOM_TTL_MS: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      server.kill();
      reject(new Error('Timed out waiting for test server'));
    }, TIMEOUT_MS);
    server.once('error', reject);
    server.stdout.on('data', chunk => {
      if (String(chunk).includes(`:${port}`)) {
        clearTimeout(timer);
        resolve(server);
      }
    });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
  });
}

async function startBrowser(debugPort) {
  const executable = findBrowser();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trumps-browser-smoke-'));
  const browser = childProcess.spawn(executable, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-gpu-compositing',
    '--in-process-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  browser.userDataDir = userDataDir;
  let stderr = '';
  browser.stderr.on('data', chunk => {
    stderr += String(chunk);
  });
  await Promise.race([
    waitForHttp(`http://127.0.0.1:${debugPort}/json/version`),
    new Promise((_, reject) => {
      browser.once('exit', code => {
        reject(new Error(`Browser exited during startup with ${code}${stderr ? `\n${stderr}` : ''}`));
      });
    }),
  ]);
  return browser;
}

async function closeBrowser(browser) {
  if (!browser) return;
  browser.kill();
  await new Promise(resolve => browser.once('exit', resolve));
  if (browser.userDataDir) {
    fs.rmSync(browser.userDataDir, { recursive: true, force: true });
  }
}

function findBrowser() {
  const explicit = process.env.BROWSER_PATH || process.env.CHROME_PATH || process.env.EDGE_PATH;
  const candidates = [
    explicit,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) {
    throw new Error('No Chromium browser found. Set BROWSER_PATH, CHROME_PATH, or EDGE_PATH to run the smoke test.');
  }
  return found;
}

async function openPage(debugPort, url) {
  const target = await requestJson({
    hostname: '127.0.0.1',
    port: debugPort,
    path: `/json/new?${encodeURIComponent(url)}`,
    method: 'PUT',
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const page = createCdpPage(ws);
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Page.bringToFront');
  await waitFor(page, `document.readyState === 'complete'`);
  return page;
}

function initClient(page, serverPort) {
  return evalValue(page, `
    new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://127.0.0.1:${serverPort}/ws');
      window.smoke = {
        ws,
        events: [],
        latest(type) {
          return [...this.events].reverse().find(event => event.type === type) || null;
        },
      };
      ws.onmessage = event => window.smoke.events.push(JSON.parse(event.data));
      ws.onopen = () => resolve(true);
      ws.onerror = () => reject(new Error('Smoke WebSocket failed'));
    })
  `);
}

function sendClient(page, message) {
  return evalValue(page, `
    (() => {
      window.smoke.ws.send(${JSON.stringify(JSON.stringify(message))});
      return true;
    })()
  `);
}

function createCdpPage(ws) {
  let id = 0;
  const pending = new Map();
  ws.on('message', raw => {
    const message = JSON.parse(raw);
    if (!message.id) return;
    const handlers = pending.get(message.id);
    if (!handlers) return;
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const nextId = ++id;
      ws.send(JSON.stringify({ id: nextId, method, params }));
      return new Promise((resolve, reject) => pending.set(nextId, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function evalValue(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result.value;
}

async function waitFor(page, expression, timeoutMs = TIMEOUT_MS) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evalValue(page, `Boolean(${expression})`)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}${lastError ? ` (${lastError.message})` : ''}`);
}

function fill(page, selector, value) {
  return evalValue(page, `
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error('Missing input ${selector}');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      return true;
    })()
  `);
}

function click(page, selector) {
  return evalValue(page, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing element ${selector}');
      element.click();
      return true;
    })()
  `);
}

function clickButtonByText(page, text) {
  return evalValue(page, `
    (() => {
      const button = [...document.querySelectorAll('button')]
        .find(next => next.textContent.trim().includes(${JSON.stringify(text)}));
      if (!button) throw new Error('Missing button ${text}');
      button.click();
      return true;
    })()
  `);
}

async function smokeStateJson(page) {
  return evalValue(page, `JSON.stringify(window.__TRUMPS_SMOKE_STATE__)`);
}

async function smokeState(page) {
  return JSON.parse(await smokeStateJson(page));
}

function waitForHttp(url) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, res => {
        res.resume();
        resolve();
      }).on('error', error => {
        if (Date.now() - started > TIMEOUT_MS) reject(error);
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

function requestJson(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
