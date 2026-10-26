import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// No credentials or cookies are written to the report or screenshots. Supply
// QA_EMAIL and QA_PASSWORD in the process environment for authenticated coverage.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = process.env.PLAYWRIGHT_MODULE_DIR ?? join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
const { chromium } = await import(pathToFileURL(join(bundle, "index.mjs")).href);
const baseUrl = process.env.QA_WEB_URL ?? "http://localhost:3000";
const apiUrl = process.env.QA_API_URL ?? "http://localhost:4000";
const stage = (process.env.QA_STAGE ?? "baseline").replace(/[^a-zA-Z0-9_-]/g, "");
const output = join(root, "docs", "qa", stage);
const widths = [320, 375, 430, 768, 1024, 1280, 1440, 1920];
const executable = process.env.QA_CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!existsSync(executable)) throw new Error("No existing Chrome executable. Set QA_CHROME_PATH; this script does not install a browser.");
await mkdir(output, { recursive: true });

const secrets = [process.env.QA_EMAIL, process.env.QA_PASSWORD].filter(Boolean);
const redact = (value) => {
  let text = String(value ?? "");
  for (const secret of secrets) text = text.replaceAll(secret, "[redacted]");
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").replace(/(?:access_token|refresh_token|Bearer)\s*[:=]?\s*[^\s;,]+/gi, "[credential]").slice(0, 500);
};
function safeUrl(value) { try { const parsed = new URL(value); return `${parsed.origin}${parsed.pathname}`; } catch { return "[invalid URL]"; } }

const browser = await chromium.launch({ headless: true, executablePath: executable });
const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 375, height: 900 }, deviceScaleFactor: 1 });
const report = { stage, capturedAt: new Date().toISOString(), browser: browser.version(), widths, authentication: "not_requested", readOnly: true, socketPolicy: "Socket connections blocked to prevent automatic read receipts", routes: [], blockedMutations: [], screenshots: [] };
try {
  if (process.env.QA_EMAIL && process.env.QA_PASSWORD) {
    const login = await context.request.post(`${apiUrl}/api/auth/login`, { data: { email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD }, headers: { Origin: baseUrl } });
    report.authentication = login.ok() ? "authenticated" : `failed_http_${login.status()}`;
    if (login.ok()) {
      const me = await context.request.get(`${apiUrl}/api/auth/me`);
      if (me.ok()) {
        const account = await me.json();
        report.moderator = Boolean(account.isModerator);
        if (account.tutor?.displayName) secrets.push(account.tutor.displayName);
      }
    }
    console.log(`Authentication: ${report.authentication}; moderator: ${Boolean(report.moderator)}`);
  }

  // Avoid read receipts, posts, joins and other changes caused by mounting a view.
  await context.routeWebSocket(/socket\.io/, (socket) => socket.close());
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !["/api/auth/refresh", "/api/auth/login"].includes(path)) {
      report.blockedMutations.push({ method: request.method(), path });
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Read-only QA blocked this automatic write." }) });
      return;
    }
    await route.continue();
  });

  const entityRoutes = { pet: "", post: "", group: "" };
  if (report.authentication === "authenticated") {
    const get = async (path) => { const response = await context.request.get(`${apiUrl}${path}`); return response.ok() ? response.json() : null; };
    const [pets, feed, groups] = await Promise.all([get("/api/pets/mine"), get("/api/community/feed?limit=1"), get("/api/community/groups")]);
    entityRoutes.pet = pets?.[0]?.id ?? feed?.items?.[0]?.pet?.id ?? "";
    entityRoutes.post = feed?.items?.[0]?.id ?? "";
    entityRoutes.group = groups?.find((group) => group.members?.[0]?.approved)?.id ?? "";
  }

  const routeList = [
    "/", "/entrar", "/cadastro", "/recuperar-senha", "/dashboard", "/explorar", "/animais", "/animais/novo", "/matches", "/mensagens", "/comunidade", "/comunidade/explorar",
    `/comunidade/publicacao${entityRoutes.post ? `?postId=${encodeURIComponent(entityRoutes.post)}` : ""}`,
    "/grupos", `/grupos/detalhe${entityRoutes.group ? `?id=${encodeURIComponent(entityRoutes.group)}` : ""}`, "/eventos", "/adocoes", "/notificacoes", "/configuracoes", "/administracao",
    `/pet/perfil${entityRoutes.pet ? `?petId=${encodeURIComponent(entityRoutes.pet)}` : ""}`, "/termos", "/privacidade", "/seguranca",
  ];
  const screenshotRoutes = new Set(["/", "/cadastro", "/dashboard", "/explorar", "/comunidade", "/animais/novo", "/mensagens", "/configuracoes", "/administracao"]);
  const page = await context.newPage();
  for (const target of routeList) {
    const routePath = target.split("?")[0];
    const entry = { path: routePath, entityAvailable: !["/pet/perfil", "/comunidade/publicacao", "/grupos/detalhe"].includes(routePath) || target.includes("?"), errors: [], failedRequests: [], httpFailures: [], viewports: [] };
    const onPageError = (error) => entry.errors.push({ type: "pageerror", message: redact(error?.message ?? String(error)) });
    const onConsole = (message) => { if (message.type() === "error") entry.errors.push({ type: "console", message: redact(message.text()) }); };
    const onFailed = (request) => { if (!request.url().includes("socket.io")) entry.failedRequests.push({ method: request.method(), url: safeUrl(request.url()), reason: redact(request.failure()?.errorText) }); };
    const onResponse = (response) => { if (response.status() >= 400) entry.httpFailures.push({ status: response.status(), url: safeUrl(response.url()) }); };
    page.on("pageerror", onPageError); page.on("console", onConsole); page.on("requestfailed", onFailed); page.on("response", onResponse);
    try {
      await page.setViewportSize({ width: 375, height: 900 });
      const response = await page.goto(`${baseUrl}${target}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      entry.status = response?.status();
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
      await page.locator(".session-loading").waitFor({ state: "hidden", timeout: 8000 }).catch(() => undefined);
      entry.finalPath = new URL(page.url()).pathname;
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(130);
        const metrics = await page.evaluate(() => {
          const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"; };
          const body = document.body.innerText;
          const overflow = [...document.querySelectorAll("body *")].filter((element) => visible(element) && !element.closest(".leaflet-pane") && element.getBoundingClientRect().right > innerWidth + 2).slice(0, 12).map((element) => ({ tag: element.tagName, className: typeof element.className === "string" ? element.className.slice(0, 120) : "svg", right: Math.round(element.getBoundingClientRect().right) }));
          const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
          return {
            viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1, overflowElements: overflow,
            headingCount: document.querySelectorAll("h1").length,
            missingLabelTargets: [...document.querySelectorAll("label[for]")].filter((label) => !document.getElementById(label.htmlFor)).map((label) => label.htmlFor),
            missingEntity: /Publicação não informada|Grupo não informado|Perfil do animal não informado/.test(body),
            sessionLoading: Boolean(document.querySelector(".session-loading")),
            visibleControlCount: controls.length,
            smallControlCount: controls.filter((element) => { const bounds = element.getBoundingClientRect(); return bounds.width < 40 || bounds.height < 40; }).length,
            mainBounds: (() => { const bounds = document.querySelector("main")?.getBoundingClientRect(); return bounds ? { left: Math.round(bounds.left), width: Math.round(bounds.width) } : null; })(),
            navBounds: (() => { const nav = document.querySelector(".product-bottom-nav"); if (!nav || !visible(nav)) return null; const bounds = nav.getBoundingClientRect(); return { top: Math.round(bounds.top), bottom: Math.round(bounds.bottom), width: Math.round(bounds.width) }; })(),
          };
        });
        entry.viewports.push(metrics);
        if (screenshotRoutes.has(routePath) && [375, 1440].includes(width)) {
          const filename = `${routePath === "/" ? "landing" : routePath.slice(1).replaceAll("/", "-")}-${width}.png`;
          await page.screenshot({ path: join(output, filename), fullPage: true, animations: "disabled", timeout: 15000, mask: [page.locator('input[type="email"],input[readonly]')] });
          report.screenshots.push(filename);
        }
      }
    } catch (error) { entry.errors.push({ type: "runner", message: redact(error.message) }); }
    page.off("pageerror", onPageError); page.off("console", onConsole); page.off("requestfailed", onFailed); page.off("response", onResponse);
    entry.errors = [...new Map(entry.errors.map((item) => [`${item.type}:${item.message}`, item])).values()];
    entry.httpFailures = [...new Map(entry.httpFailures.map((item) => [`${item.status}:${item.url}`, item])).values()];
    report.routes.push(entry);
    console.log(`${routePath}: HTTP ${entry.status ?? "?"}, errors ${entry.errors.length}, overflow ${entry.viewports.filter((item) => item.overflow).map((item) => item.viewport).join(",") || "none"}`);
  }
  await page.close();
} catch (error) { report.runnerError = redact(error.message); console.error(report.runnerError); }
finally {
  await context.close(); await browser.close();
  await writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const summary = [`# MatchAnimal browser smoke — ${stage}`, "", `Browser: ${report.browser}. Authentication: ${report.authentication}. Moderator: ${Boolean(report.moderator)}.`, "", "Screenshots and JSON report contain no stored credentials or cookies. Socket traffic was blocked and automatic writes were prevented; messaging and mutations were not validated.", "", "| Route | HTTP | Viewports | Overflows | Errors | HTTP failures | Entity data |", "| --- | --- | --- | --- | --- | --- | --- |", ...report.routes.map((entry) => `| ${entry.path} | ${entry.status ?? "?"} | ${entry.viewports.length} | ${entry.viewports.filter((item) => item.overflow).map((item) => item.viewport).join(", ") || "none"} | ${entry.errors.length} | ${entry.httpFailures.length} | ${entry.entityAvailable ? "available / not required" : "no existing entity"} |`), "", `Prevented automatic writes: ${report.blockedMutations.length}. Screenshots: ${report.screenshots.length}.`, "", report.runnerError ? `Runner limitation: ${report.runnerError}` : "This is navigation/layout coverage, not an approval of unexecuted flows."];
  await writeFile(join(output, "summary.md"), `${summary.join("\n")}\n`);
  console.log(`Saved ${relativePath(output)}`);
}
function relativePath(value) { return value.replace(root, "."); }
