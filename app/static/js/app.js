let currentUser = null;
let twilioDevice = null;
let activeConnection = null;
let campaignPollTimer = null;
let callsPollTimer = null;
let allRecentCalls = [];
let allCampaignContacts = [];
let isMuted = false;

const THEME_KEY = "miniGenesysTheme";
const THEMES = ["corporate", "luxury", "glass"];

function safeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setActiveThemeButton(theme) {
  $(".theme-btn").removeClass("active");
  $(`.theme-btn[data-theme='${theme}']`).addClass("active");
}

function applyTheme(theme, persist = true) {
  const selected = THEMES.includes(theme) ? theme : "corporate";
  document.body.classList.remove("theme-corporate", "theme-luxury", "theme-glass");
  document.body.classList.add(`theme-${selected}`);
  setActiveThemeButton(selected);

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, selected);
    } catch (_) {
      // no-op when storage is unavailable
    }
  }
}

function initTheme() {
  let stored = "corporate";
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(value)) {
      stored = value;
    }
  } catch (_) {
    // no-op when storage is unavailable
  }

  applyTheme(stored, false);
}

function showAlert(message, level = "info") {
  const html = `
    <div class="alert alert-${safeText(level)} alert-dismissible fade show" role="alert">
      ${safeText(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
  $("#alerts").append(html);
}

function redirectToRoot() {
  if (window.location.pathname !== "/") {
    window.location.href = "/";
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (res.status === 401) {
    redirectToRoot();
    throw new Error("Unauthorized");
  }

  if (res.status === 204) {
    return null;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return body;
}

function statusChip(status) {
  const normalized = String(status || "unknown").toLowerCase();
  return `<span class="status-chip status-${safeText(normalized)}">${safeText(normalized)}</span>`;
}

function normalizeForSearch(value) {
  return String(value || "").toLowerCase();
}

function updateQuickStats() {
  const total = allRecentCalls.length;
  const connected = allRecentCalls.filter((call) => {
    const status = normalizeForSearch(call.status);
    return status.includes("in-progress") || status.includes("completed") || status.includes("connected");
  }).length;

  $("#stat-calls-total").text(total);
  $("#stat-calls-connected").text(connected);
  $("#stat-campaign-contacts").text(allCampaignContacts.length);

  const statusText = ($("#status-text").text().split(":")[1] || "unknown").trim();
  $("#stat-agent-status").text(statusText || "Unknown");
}

function applySection(section) {
  $(".page-section").addClass("d-none");
  $(`#${section}-section`).removeClass("d-none");
}

async function initSession() {
  const me = await api("/auth/me", { method: "GET" });
  if (!me.authenticated) {
    redirectToRoot();
    return;
  }

  currentUser = me;
  $("#current-user").text(`${me.username} (${me.role})`);

  if (me.role !== "admin") {
    $("#campaigns-section").addClass("d-none");
    $("button[data-section='campaigns']").hide();
  }

  await initTwilio();
  await refreshRecentCalls();
  await refreshExplore();
  await refreshCloudReplica();
  updateQuickStats();
  startPolling();
}

async function initTwilio() {
  try {
    const data = await api("/api/voice/token", { method: "GET" });
    twilioDevice = new Twilio.Device(data.token, { debug: false });

    twilioDevice.on("ready", () => showAlert("Softphone ready", "success"));
    twilioDevice.on("error", (err) => showAlert(`Twilio error: ${err.message}`, "danger"));

    twilioDevice.on("incoming", (conn) => {
      activeConnection = conn;
      isMuted = false;
      updateMuteButton();
      showAlert("Incoming call", "warning");
    });

    twilioDevice.on("connect", (conn) => {
      activeConnection = conn;
      isMuted = false;
      updateMuteButton();
      showAlert("Call connected", "success");
    });

    twilioDevice.on("disconnect", () => {
      activeConnection = null;
      isMuted = false;
      updateMuteButton();
      showAlert("Call ended", "secondary");
      refreshRecentCalls();
    });
  } catch (err) {
    showAlert(`Voice token unavailable: ${err.message}`, "warning");
  }
}

function updateMuteButton() {
  const label = isMuted ? "Unmute" : "Mute";
  $("#btn-mute").text(label);
}

async function setAgentStatus(status) {
  const data = await api("/api/agent/status", {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  $("#status-text").text(`Current: ${data.status}`);
  updateQuickStats();
}

async function makeManualCall() {
  const toNumber = $("#dial-number").val().trim();
  if (!toNumber) {
    showAlert("Enter a phone number", "warning");
    return;
  }

  const data = await api("/api/calls/manual", {
    method: "POST",
    body: JSON.stringify({ to_number: toNumber }),
  });

  showAlert(`Call queued (${data.status})`, "info");
  if (twilioDevice) {
    activeConnection = twilioDevice.connect({ To: toNumber });
  }
  await refreshRecentCalls();
}

function filteredRecentCalls() {
  const q = normalizeForSearch($("#calls-filter-input").val());
  const status = normalizeForSearch($("#calls-status-filter").val());

  return allRecentCalls.filter((call) => {
    const haystack = [call.id, call.direction, call.from_number, call.to_number, call.status, call.started_at]
      .map(normalizeForSearch)
      .join(" ");
    const statusMatch = !status || normalizeForSearch(call.status) === status;
    const queryMatch = !q || haystack.includes(q);
    return statusMatch && queryMatch;
  });
}

function renderRecentCalls() {
  const rows = filteredRecentCalls();
  const tbody = $("#recent-calls-table tbody").empty();

  if (!rows.length) {
    tbody.append('<tr><td colspan="6" class="text-muted text-center py-3">No calls match the current filters.</td></tr>');
  }

  rows.forEach((c) => {
    const toNumber = safeText(c.to_number || "");
    tbody.append(`
      <tr>
        <td>${safeText(c.id)}</td>
        <td>${safeText(c.direction)}</td>
        <td>${toNumber}</td>
        <td>${statusChip(c.status)}</td>
        <td>${safeText((c.started_at || "").replace("T", " "))}</td>
        <td><button class="btn btn-soft btn-soft-muted copy-btn copy-number-btn" data-number="${toNumber}"><i class="bi bi-copy"></i></button></td>
      </tr>
    `);
  });

  renderLogs(rows);
  updateQuickStats();
}

function renderLogs(rows) {
  const logs = $("#logs-list").empty();
  const q = normalizeForSearch($("#logs-filter-input").val());

  const visibleRows = rows.filter((c) => {
    if (!q) return true;
    const haystack = `${c.id} ${c.direction} ${c.from_number} ${c.to_number} ${c.status}`.toLowerCase();
    return haystack.includes(q);
  });

  if (!visibleRows.length) {
    logs.append('<div class="text-muted">No logs match the current filter.</div>');
    return;
  }

  visibleRows.forEach((c) => {
    logs.append(`
      <div class="log-row">
        <strong>#${safeText(c.id)}</strong>
        <span class="mx-1">${safeText(c.direction)}</span>
        <span>${safeText(c.from_number)} -> ${safeText(c.to_number)}</span>
        <span class="ms-2">${statusChip(c.status)}</span>
      </div>
    `);
  });
}

async function refreshRecentCalls() {
  allRecentCalls = await api("/api/calls/recent?limit=20", { method: "GET" });
  renderRecentCalls();
}

async function createCampaign() {
  const name = $("#campaign-name").val().trim();
  const data = await api("/api/campaigns", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  $("#campaign-id").val(data.id);
  showAlert(`Campaign created: ${data.id}`, "success");
  await refreshCampaign();
}

async function campaignAction(action) {
  const id = $("#campaign-id").val().trim();
  if (!id) {
    showAlert("Enter campaign ID", "warning");
    return;
  }

  await api(`/api/campaigns/${id}/${action}`, { method: "POST" });
  showAlert(`Campaign ${action} successful`, "success");
  await refreshCampaign();
}

async function uploadCsv() {
  const id = $("#campaign-id").val().trim();
  const file = $("#csv-file")[0].files[0];

  if (!id || !file) {
    showAlert("Campaign ID and CSV file are required", "warning");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/campaigns/${id}/contacts/upload`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    showAlert(body.error || "Upload failed", "danger");
    return;
  }

  showAlert(`Uploaded ${body.inserted} contacts`, "success");
  await refreshCampaign();
}

function renderCampaignContacts() {
  const tbody = $("#campaign-contacts-table tbody").empty();
  const q = normalizeForSearch($("#contacts-filter-input").val());

  const rows = allCampaignContacts.filter((x) => {
    const haystack = `${x.id} ${x.name} ${x.phone} ${x.status} ${x.last_error || ""}`.toLowerCase();
    return !q || haystack.includes(q);
  });

  if (!rows.length) {
    tbody.append('<tr><td colspan="6" class="text-muted text-center py-3">No contacts match the current filter.</td></tr>');
  }

  rows.forEach((x) => {
    tbody.append(`
      <tr>
        <td>${safeText(x.id)}</td>
        <td>${safeText(x.name)}</td>
        <td>${safeText(x.phone)}</td>
        <td>${statusChip(x.status)}</td>
        <td>${safeText(x.attempt_count)}</td>
        <td>${safeText(x.last_error || "")}</td>
      </tr>
    `);
  });

  updateQuickStats();
}

function campaignSummaryHtml(status) {
  const counts = status.counts || {};
  return `
    <div class="mb-2"><strong>${safeText(status.name)}</strong> (#${safeText(status.id)})</div>
    <div class="mb-2">Status: ${statusChip(status.status)}</div>
    <div class="small text-muted">Counts</div>
    <div class="d-flex flex-wrap gap-2 mt-1">
      <span class="badge text-bg-light border">queued: ${safeText(counts.queued || 0)}</span>
      <span class="badge text-bg-light border">in-progress: ${safeText(counts["in-progress"] || 0)}</span>
      <span class="badge text-bg-light border">completed: ${safeText(counts.completed || 0)}</span>
      <span class="badge text-bg-light border">failed: ${safeText(counts.failed || 0)}</span>
      <span class="badge text-bg-light border">paused: ${safeText(counts.paused || 0)}</span>
    </div>
  `;
}

async function refreshCampaign() {
  const id = $("#campaign-id").val().trim();
  if (!id) {
    allCampaignContacts = [];
    renderCampaignContacts();
    return;
  }

  try {
    const status = await api(`/api/campaigns/${id}/status`, { method: "GET" });
    $("#campaign-summary").html(campaignSummaryHtml(status));

    const contacts = await api(`/api/campaigns/${id}/contacts?offset=0&limit=100`, { method: "GET" });
    allCampaignContacts = contacts.items || [];
    renderCampaignContacts();
  } catch (err) {
    showAlert(err.message, "warning");
  }
}

function renderExploreCatalog(items) {
  const container = $("#explore-catalog").empty();
  if (!items.length) {
    container.append('<div class="col-12 text-muted">No results for current filters.</div>');
    return;
  }

  items.forEach((item) => {
    container.append(`
      <div class="col-md-6">
        <div class="card card-soft h-100">
          <div class="card-body">
            <div class="badge text-bg-primary mb-2">${safeText(item.type.replace("_", " "))}</div>
            <h6>${safeText(item.title)}</h6>
            <p class="small text-muted mb-2">${safeText(item.description)}</p>
            <div class="small">Role: <strong>${safeText(item.role)}</strong></div>
            <div class="small">Track: <strong>${safeText(item.track)}</strong></div>
            <div class="small">Level: <strong>${safeText(item.level)}</strong></div>
            <div class="small">Modality: <strong>${safeText(item.modality)}</strong></div>
            <div class="small">Duration: <strong>${safeText(item.duration_hours)}h</strong></div>
          </div>
        </div>
      </div>
    `);
  });
}

async function refreshExplore() {
  const role = $("#explore-role").val() || "";
  const type = $("#explore-type").val() || "";
  const level = $("#explore-level").val() || "";

  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (type) params.set("type", type);
  if (level) params.set("level", level);

  const data = await api(`/api/explore/catalog?${params.toString()}`, { method: "GET" });
  renderExploreCatalog(data.items || []);

  const summary = data.summary || {};
  $("#explore-summary").html(`
    <div>Total: <strong>${safeText(summary.total || 0)}</strong></div>
    <div>By type: <code>${safeText(JSON.stringify(summary.by_type || {}))}</code></div>
    <div>Tracks: ${safeText((summary.tracks || []).join(", "))}</div>
    <div>Modalities: ${safeText((summary.modalities || []).join(", "))}</div>
  `);

  const recRole = currentUser && currentUser.role === "admin" ? "admin" : "agent";
  const recs = await api(`/api/explore/recommendations?role=${recRole}`, { method: "GET" });
  const recContainer = $("#explore-recommendations").empty();

  (recs.items || []).forEach((item) => {
    recContainer.append(`
      <div class="mb-2 p-2 border rounded bg-white">
        <strong>${safeText(item.title)}</strong>
        <div class="small text-muted">${safeText(item.type)} | ${safeText(item.level)} | ${safeText(item.duration_hours)}h</div>
      </div>
    `);
  });
}

function moduleCardHtml(module) {
  const features = (module.features || [])
    .map((f) => `<span class="badge text-bg-light border me-1 mb-1">${safeText(f)}</span>`)
    .join("");

  return `
    <div class="col-md-6 col-xl-4">
      <div class="card card-soft h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <h6 class="mb-1">${safeText(module.name)}</h6>
              <div class="small text-muted">${safeText(module.category)}</div>
            </div>
            <span class="badge text-bg-warning">${safeText(module.status)}</span>
          </div>
          <div class="small mb-2">${features}</div>
          <button class="btn btn-soft btn-soft-muted btn-sm cloud-open-btn" data-module-id="${safeText(module.id)}">Open Dummy</button>
        </div>
      </div>
    </div>
  `;
}

async function refreshCloudReplica() {
  const overview = await api("/api/cloud-replica/overview", { method: "GET" });
  const categorySel = $("#cloud-category");

  if (categorySel.children().length <= 1) {
    (overview.categories || []).forEach((c) => categorySel.append(`<option value="${safeText(c)}">${safeText(c)}</option>`));
  }

  $("#cloud-overview").html(`
    <div class="mb-1">Modules: <strong>${safeText(overview.modules_total)}</strong></div>
    <div class="mb-1">Categories: <strong>${safeText((overview.categories || []).join(", "))}</strong></div>
    <div class="small text-muted">Replica mode shows UI parity structure with dummy data only.</div>
  `);

  const queuesHtml = (overview.queue_summary || []).map((q) => `
    <div class="border rounded p-2 mb-2 bg-white">
      <div><strong>${safeText(q.queue)}</strong></div>
      <div class="small">Waiting: ${safeText(q.waiting)} | Agents: ${safeText(q.agents_on_queue)} | SL: ${safeText(q.service_level)}</div>
    </div>
  `).join("");
  $("#cloud-queues").html(queuesHtml || '<div class="text-muted">No queues.</div>');

  const dashHtml = (overview.dashboards || []).map((d) => `
    <div class="border rounded p-2 mb-2 bg-white">
      <div><strong>${safeText(d.name)}</strong></div>
      <div class="small">Widgets: ${safeText(d.widgets)} | Owner: ${safeText(d.owner)}</div>
    </div>
  `).join("");
  $("#cloud-dashboards").html(dashHtml || '<div class="text-muted">No dashboards.</div>');

  await refreshCloudModules();
}

async function refreshCloudModules() {
  const category = $("#cloud-category").val() || "";
  const q = $("#cloud-search").val().trim();

  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (q) params.set("q", q);

  const data = await api(`/api/cloud-replica/modules?${params.toString()}`, { method: "GET" });
  const holder = $("#cloud-modules").empty();

  if (!data.items || !data.items.length) {
    holder.html('<div class="col-12 text-muted">No modules match current filter.</div>');
    return;
  }

  data.items.forEach((m) => holder.append(moduleCardHtml(m)));
}

async function openCloudModule(moduleId) {
  const data = await api(`/api/cloud-replica/module/${moduleId}`, { method: "GET" });
  const module = data.module;

  const panels = (data.dummy_panels || []).map((p) => `<span class="badge text-bg-secondary me-1">${safeText(p)}</span>`).join("");
  const objects = (data.dummy_objects || [])
    .map((o) => `<li>${safeText(o.name)} <span class="text-muted">(${safeText(o.status)})</span></li>`)
    .join("");

  $("#cloud-module-detail").html(`
    <h6>${safeText(module.name)}</h6>
    <div class="small text-muted mb-2">${safeText(module.category)} module in replica mode.</div>
    <div class="mb-2">${panels}</div>
    <div><strong>Dummy objects</strong></div>
    <ul>${objects}</ul>
  `);
}

async function runCloudAction() {
  const res = await api("/api/cloud-replica/action", { method: "POST", body: JSON.stringify({ action: "dummy" }) });
  showAlert(res.message, "secondary");
}

function setupNav() {
  $(".nav-btn").on("click", function () {
    $(".nav-btn").removeClass("active");
    $(this).addClass("active");

    const section = $(this).data("section");
    applySection(section);

    if (section === "explore") {
      refreshExplore().catch((e) => showAlert(e.message, "warning"));
    }

    if (section === "cloud") {
      refreshCloudReplica().catch((e) => showAlert(e.message, "warning"));
    }
  });
}

function copyToClipboard(value) {
  if (!value) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => showAlert("Number copied", "success"))
      .catch(() => showAlert("Copy failed", "warning"));
    return;
  }

  const temp = $("<input>");
  $("body").append(temp);
  temp.val(value).trigger("select");
  document.execCommand("copy");
  temp.remove();
  showAlert("Number copied", "success");
}

function setupHandlers() {
  $(document).on("click", ".theme-btn", function () {
    const theme = $(this).data("theme");
    applyTheme(theme, true);
  });

  $("#status-available").on("click", () => setAgentStatus("available").catch((e) => showAlert(e.message, "danger")));
  $("#status-offline").on("click", () => setAgentStatus("offline").catch((e) => showAlert(e.message, "danger")));
  $("#manual-call-btn").on("click", () => makeManualCall().catch((e) => showAlert(e.message, "danger")));

  $("#create-campaign-btn").on("click", () => createCampaign().catch((e) => showAlert(e.message, "danger")));
  $("#start-campaign-btn").on("click", () => campaignAction("start").catch((e) => showAlert(e.message, "danger")));
  $("#pause-campaign-btn").on("click", () => campaignAction("pause").catch((e) => showAlert(e.message, "danger")));
  $("#stop-campaign-btn").on("click", () => campaignAction("stop").catch((e) => showAlert(e.message, "danger")));
  $("#upload-csv-btn").on("click", () => uploadCsv().catch((e) => showAlert(e.message, "danger")));

  $("#refresh-logs-btn").on("click", () => refreshRecentCalls().catch((e) => showAlert(e.message, "danger")));
  $("#explore-refresh-btn").on("click", () => refreshExplore().catch((e) => showAlert(e.message, "danger")));
  $("#cloud-refresh-btn").on("click", () => refreshCloudModules().catch((e) => showAlert(e.message, "danger")));
  $("#cloud-action-btn").on("click", () => runCloudAction().catch((e) => showAlert(e.message, "danger")));

  $("#quick-refresh-btn").on("click", async () => {
    try {
      await Promise.all([refreshRecentCalls(), refreshCampaign(), refreshExplore(), refreshCloudReplica()]);
      showAlert("All sections refreshed", "success");
    } catch (e) {
      showAlert(e.message, "warning");
    }
  });

  $(document).on("click", ".cloud-open-btn", function () {
    const moduleId = $(this).data("module-id");
    openCloudModule(moduleId).catch((e) => showAlert(e.message, "danger"));
  });

  $(document).on("click", ".copy-number-btn", function () {
    copyToClipboard($(this).data("number"));
  });

  $("#calls-filter-input, #logs-filter-input").on("input", renderRecentCalls);
  $("#calls-status-filter").on("change", renderRecentCalls);
  $("#contacts-filter-input").on("input", renderCampaignContacts);

  $("#cloud-search").on("input", () => refreshCloudModules().catch(() => {}));
  $("#cloud-category").on("change", () => refreshCloudModules().catch(() => {}));

  $("#dial-number").on("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      makeManualCall().catch((err) => showAlert(err.message, "danger"));
    }
  });

  $("#btn-accept").on("click", () => activeConnection && activeConnection.accept());
  $("#btn-reject").on("click", () => activeConnection && activeConnection.reject());
  $("#btn-hangup").on("click", () => activeConnection && activeConnection.disconnect());

  $("#btn-mute").on("click", () => {
    if (!activeConnection) {
      showAlert("No active call", "warning");
      return;
    }
    isMuted = !isMuted;
    activeConnection.mute(isMuted);
    updateMuteButton();
  });

  $("#logout-btn").on("click", async () => {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/";
  });

  $("#login-form").on("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("#username").val().trim(),
          password: $("#password").val(),
        }),
      });
      window.location.href = "/app";
    } catch (err) {
      $("#login-error").removeClass("d-none").text(err.message);
    }
  });
}

function startPolling() {
  callsPollTimer = setInterval(() => refreshRecentCalls().catch(() => {}), 5000);
  campaignPollTimer = setInterval(() => refreshCampaign().catch(() => {}), 4000);
}

$(document).ready(async () => {
  initTheme();
  setupHandlers();

  if (window.location.pathname === "/app") {
    updateMuteButton();
    setupNav();
    applySection("softphone");
    await initSession();
  }
});
