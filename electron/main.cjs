const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

let server;
let quitting = false;
let window;

function handleSquirrelEvent() {
  if (process.platform !== "win32") return false;
  const event = process.argv[1];
  if (!["--squirrel-install", "--squirrel-updated", "--squirrel-uninstall", "--squirrel-obsolete"].includes(event))
    return false;

  const executable = path.basename(process.execPath);
  const commands = {
    "--squirrel-install": `--createShortcut=${executable}`,
    "--squirrel-updated": `--createShortcut=${executable}`,
    "--squirrel-uninstall": `--removeShortcut=${executable}`,
  };
  const command = commands[event];
  if (command) {
    const update = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
    spawn(update, [command], { detached: true, windowsHide: true })
      .on("error", () => app.quit())
      .on("close", () => app.quit());
  } else {
    app.quit();
  }
  return true;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("The bundled server exited before the window opened.");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* The server may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The bundled server did not become ready in time.");
}

async function openWindow() {
  const serverDirectory = app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.resolve(__dirname, "..", ".next", "standalone");
  const serverEntry = path.join(serverDirectory, "server.js");
  const sessionDirectory = path.join(app.getPath("userData"), "sessions");
  mkdirSync(sessionDirectory, { recursive: true });

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [serverEntry], {
    cwd: serverDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      SESSION_DATA_DIR: sessionDirectory,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  server.stdout.on("data", (data) => process.stdout.write(data));
  server.stderr.on("data", (data) => process.stderr.write(data));
  server.on("error", (error) => console.error("Bundled server failed:", error));
  server.on("exit", (code) => {
    if (!quitting) {
      dialog.showErrorBox("filmSortory server stopped", `The local server exited (${code}). Restart the app to continue.`);
      app.quit();
    }
  });
  await waitForServer(origin, server);

  window = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 600,
    minHeight: 550,
    show: false,
    backgroundColor: "#f5f2ec",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://www.imdb.com/")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL(origin);
}

if (!handleSquirrelEvent()) {
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
  } else {
    app.setAppUserModelId("com.squirrel.filmSortory.filmSortory");
    app.on("second-instance", () => window?.focus());
    app.on("before-quit", () => {
      quitting = true;
      server?.kill();
    });
    app.on("window-all-closed", () => app.quit());
    app.whenReady().then(openWindow).catch((error) => {
      dialog.showErrorBox("filmSortory could not start", error.message);
      app.quit();
    });
  }
}
