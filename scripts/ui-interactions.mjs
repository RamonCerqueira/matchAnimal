import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const modulePath = process.env.PLAYWRIGHT_MODULE_DIR ?? join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { chromium } = await import(pathToFileURL(join(modulePath, "index.mjs")).href);
const base = process.env.QA_WEB_URL ?? "http://localhost:3000";
const api = process.env.QA_API_URL ?? "http://localhost:4000";
const output = resolve("docs/qa/interactions");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 375, height: 900 }, locale: "pt-BR" });
const results = [];
async function check(name, run) { try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, passed: false, error: String(error.message).replaceAll(process.env.QA_EMAIL ?? "[email]", "[email]").slice(0, 450) }); console.log(`FAIL ${name}`); } }
try {
  assert.ok(process.env.QA_EMAIL && process.env.QA_PASSWORD, "Supply QA_EMAIL and QA_PASSWORD in the environment.");
  const login = await context.request.post(`${api}/api/auth/login`, { data: { email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD }, headers: { Origin: base } });
  assert.ok(login.ok(), "The existing QA account must authenticate.");
  await context.routeWebSocket(/socket\.io/, (socket) => socket.close());
  await context.route("**/api/**", (route) => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 409, contentType: "application/json", body: '{"message":"Read-only browser validation."}' }));
  const page = await context.newPage();
  await check("administrator identity matches the server permission and account filter", async () => {
    const meResponse = await context.request.get(`${api}/api/auth/me`);
    const me = await meResponse.json();
    assert.equal(me.isAdministrator, true); assert.equal(me.isModerator, true);
    const overviewResponse = await context.request.get(`${api}/api/safety/admin/overview`);
    assert.ok(overviewResponse.ok());
    const overview = await overviewResponse.json();
    const account = overview.recentAccounts.find((entry) => entry.id === me.id);
    assert.equal(account?.isAdministrator, true);
    assert.equal(Object.hasOwn(account, "email"), false, "The overview never exposes account emails.");
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto(`${base}/administracao`);
    await page.getByRole("button", { name: "Contas", exact: true }).click();
    await page.getByLabel("Filtrar tipo de conta").selectOption("ADMIN");
    const rows = page.locator(".admin-table tbody tr");
    await rows.first().waitFor();
    assert.equal(await rows.count(), overview.recentAccounts.filter((entry) => entry.isAdministrator).length);
    assert.match(await rows.first().innerText(), /Administrador/);
    await page.screenshot({ path: join(output, "admin-role-1440.png"), fullPage: true, animations: "disabled" });
    await page.goto(`${base}/configuracoes`);
    await page.locator(".account-access-summary").waitFor();
    assert.match(await page.locator(".account-access-summary").innerText(), /Administrador/);
    await page.setViewportSize({ width: 375, height: 900 });
  });
  await check("dashboard CTA contrast and keyboard dialog", async () => {
    await page.goto(`${base}/dashboard`);
    const cta = page.getByRole("link", { name: "Criar perfil do meu pet", exact: true });
    await cta.waitFor();
    const styles = await cta.evaluate((element) => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, height: element.getBoundingClientRect().height }));
    assert.equal(styles.color, "rgb(255, 255, 255)"); assert.ok(styles.height >= 44);
    const luminance = (color) => color.match(/\d+/g).slice(0, 3).map((value) => { const v = Number(value) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, index) => sum + v * [.2126, .7152, .0722][index], 0);
    assert.ok(1.05 / (luminance(styles.background) + .05) >= 4.5, "White CTA text meets AA contrast.");
    await page.getByRole("button", { name: "Buscar na comunidade", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Buscar na comunidade");
  });
  await check("explore preferences and four swipe directions", async () => {
    await page.goto(`${base}/explorar`);
    const photo = page.locator(".explore-photo"); await photo.waitFor();
    await page.getByRole("button", { name: "Abrir preferências" }).click();
    await page.getByRole("combobox", { name: "Filtrar espécie" }).selectOption("Gato");
    assert.match(await page.locator(".explore-photo-bottom h2").innerText(), /Nina/);
    await page.getByRole("combobox", { name: "Filtrar espécie" }).selectOption("ALL");
    async function drag(x, y) { const bounds = await photo.boundingBox(); const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2; await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + x, cy + y, { steps: 10 }); await page.mouse.up(); }
    await drag(-110, 0); assert.match(await page.locator(".explore-photo-bottom h2").innerText(), /Bento/);
    await drag(110, 0); assert.match(await page.locator(".explore-photo-bottom h2").innerText(), /Nina/);
    await drag(0, -110); assert.match(await page.locator(".explore-notice").innerText(), /Super Match/);
    await drag(0, 110); await page.getByRole("dialog").waitFor(); assert.match(await page.getByRole("dialog").innerText(), /Sol/);
    await page.keyboard.press("Escape");
    await photo.press("ArrowDown"); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Como calculamos", exact: true }).click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
  });
  await check("pet form steps, accessible fields and real local photo crop", async () => {
    await page.goto(`${base}/animais/novo`);
    await page.locator("#pet-name").fill("Pet de validação local");
    const ids = await page.locator("label[for]").evaluateAll((labels) => labels.map((label) => label.htmlFor).filter((id) => !document.getElementById(id)));
    assert.deepEqual(ids, []);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "qa-fixture.png", mimeType: "image/png", buffer: pngFixture() });
    await page.getByRole("button", { name: "Ajustar recorte da foto 1" }).waitFor();
    await page.getByRole("button", { name: "Ajustar recorte da foto 1" }).click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    const zoom = dialog.getByRole("slider", { name: /Zoom/ }); await zoom.press("ArrowRight"); await zoom.press("ArrowRight");
    await dialog.getByRole("slider", { name: "Posição horizontal" }).press("ArrowLeft");
    await page.screenshot({ path: join(output, "crop-375.png"), animations: "disabled" });
    await dialog.getByRole("button", { name: "Aplicar recorte" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.match(await page.locator(".inline-success").innerText(), /Enquadramento aplicado/);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Criar perfil", exact: true }).waitFor();
    assert.ok(await page.getByRole("heading", { name: "Revise e crie o perfil" }).isVisible());
    // Deliberately do not submit: no pet, media or account is written by this audit.
  });
  await check("community compose deep link focuses the real editor", async () => {
    await page.goto(`${base}/comunidade?compose=1`);
    const composer = page.getByRole("textbox", { name: "Texto da publicação" }); await composer.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Texto da publicação");
    assert.equal(await composer.inputValue(), "");
  });
  await check("dashboard network failure shows retry instead of an empty account", async () => {
    await context.route("**/api/pets/mine", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Simulated QA outage"}' }));
    await page.goto(`${base}/dashboard`);
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Criar perfil do meu pet", exact: true }).count(), 0);
    await context.unroute("**/api/pets/mine");
  });
  await check("follow and unknown notification types render safely", async () => {
    await context.route("**/api/notifications", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(["FOLLOW", "FUTURE_TYPE"].map((type, i) => ({ id: String(i), type, entityId: null, readAt: "2026-10-17T12:00:00Z", createdAt: "2026-10-17T12:00:00Z", actor: null }))) }));
    await page.goto(`${base}/notificacoes`); await page.getByText("Novo seguidor", { exact: true }).waitFor();
    assert.ok(await page.getByText("Atualização de conexão", { exact: true }).isVisible());
    await context.unroute("**/api/notifications");
  });
  await page.close();
} finally { await context.close(); await browser.close(); await writeFile(join(output, "report.json"), JSON.stringify({ readOnly: true, results }, null, 2)); }
if (results.some((result) => !result.passed)) process.exitCode = 1;

function pngFixture() {
  const crc = (bytes) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(120, 0); header.writeUInt32BE(80, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(80 * (1 + 120 * 3)); for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) { const at = y * 361 + 1 + x * 3; pixels[at] = 100 + x; pixels[at + 1] = 130 + y; pixels[at + 2] = 120; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
