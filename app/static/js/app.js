let currentUser = null;
let twilioDevice = null;
let activeConnection = null;
let campaignPollTimer = null;
let callsPollTimer = null;

function showAlert(message, level = "info") {
  const el = $(`<div class="alert alert-${level} alert-dismissible fade show" role="alert">${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`);
  $("#alerts").append(el);
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
      showAlert("Incoming call", "warning");
    });
    twilioDevice.on("connect", (conn) => {
      activeConnection = conn;
      showAlert("Call connected", "success");
    });
    twilioDevice.on("disconnect", () => {
      activeConnection = null;
      showAlert("Call ended", "secondary");
      refreshRecentCalls();
    });
  } catch (err) {
    showAlert(`Voice token unavailable: ${err.message}`, "warning");
  }
}

async function setAgentStatus(status) {
  const data = await api("/api/agent/status", {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  $("#status-text").text(`Current: ${data.status}`);
}

async function makeManualCall() {
  const toNumber = $("#dial-number").val().trim();
  const data = await api("/api/calls/manual", {
    method: "POST",
    body: JSON.stringify({ to_number: toNumber }),
  });

  showAlert(`Call queued (${data.status})`, "info");
  if (twilioDevice) {
    activeConnection = twilioDevice.connect({ To: toNumber });
  }
  refreshRecentCalls();
}

async function refreshRecentCalls() {
  const rows = await api("/api/calls/recent?limit=20", { method: "GET" });
  const tbody = $("#recent-calls-table tbody").empty();
  const logs = $("#logs-list").empty();

  rows.forEach((c) => {
    tbody.append(`<tr><td>${c.id}</td><td>${c.direction}</td><td>${c.to_number}</td><td>${c.status}</td><td>${(c.started_at || "").replace("T", " ")}</td></tr>`);
    logs.append(`<div class="mb-2 p-2 border rounded bg-white">#${c.id} ${c.direction} ${c.from_number} -> ${c.to_number} (${c.status})</div>`);
  });
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

async function refreshCampaign() {
  const id = $("#campaign-id").val().trim();
  if (!id) {
    return;
  }

  try {
    const status = await api(`/api/campaigns/${id}/status`, { method: "GET" });
    $("#campaign-summary").html(`
      <div><strong>${status.name}</strong> (#${status.id})</div>
      <div>Status: ${status.status}</div>
      <div>Counts: ${JSON.stringify(status.counts || {})}</div>
    `);

    const contacts = await api(`/api/campaigns/${id}/contacts?offset=0&limit=100`, { method: "GET" });
    const tbody = $("#campaign-contacts-table tbody").empty();
    contacts.items.forEach((x) => {
      tbody.append(`<tr><td>${x.id}</td><td>${x.name}</td><td>${x.phone}</td><td>${x.status}</td><td>${x.attempt_count}</td><td>${x.last_error || ""}</td></tr>`);
    });
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
        <div class="card h-100">
          <div class="card-body">
            <div class="badge text-bg-primary mb-2">${item.type.replace("_", " ")}</div>
            <h6>${item.title}</h6>
            <p class="small text-muted mb-2">${item.description}</p>
            <div class="small">Role: <strong>${item.role}</strong></div>
            <div class="small">Track: <strong>${item.track}</strong></div>
            <div class="small">Level: <strong>${item.level}</strong></div>
            <div class="small">Modality: <strong>${item.modality}</strong></div>
            <div class="small">Duration: <strong>${item.duration_hours}h</strong></div>
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
    <div>Total: <strong>${summary.total || 0}</strong></div>
    <div>By type: <code>${JSON.stringify(summary.by_type || {})}</code></div>
    <div>Tracks: ${(summary.tracks || []).join(", ")}</div>
    <div>Modalities: ${(summary.modalities || []).join(", ")}</div>
  `);

  const recRole = currentUser && currentUser.role === "admin" ? "admin" : "agent";
  const recs = await api(`/api/explore/recommendations?role=${recRole}`, { method: "GET" });
  const recContainer = $("#explore-recommendations").empty();
  (recs.items || []).forEach((item) => {
    recContainer.append(`<div class="mb-2 p-2 border rounded bg-white"><strong>${item.title}</strong><div class="small text-muted">${item.type} | ${item.level} | ${item.duration_hours}h</div></div>`);
  });
}

function moduleCardHtml(module) {
  const features = module.features.map((f) => `<span class="badge text-bg-light border me-1 mb-1">${f}</span>`).join("");
  return `
    <div class="col-md-6 col-xl-4">
      <div class="card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <h6 class="mb-1">${module.name}</h6>
              <div class="small text-muted">${module.category}</div>
            </div>
            <span class="badge text-bg-warning">${module.status}</span>
          </div>
          <div class="small mb-2">${features}</div>
          <button class="btn btn-sm btn-outline-primary cloud-open-btn" data-module-id="${module.id}">Open Dummy</button>
        </div>
      </div>
    </div>
  `;
}

async function refreshCloudReplica() {
  const overview = await api("/api/cloud-replica/overview", { method: "GET" });
  const categorySel = $("#cloud-category");

  if (categorySel.children().length <= 1) {
    (overview.categories || []).forEach((c) => categorySel.append(`<option value="${c}">${c}</option>`));
  }

  $("#cloud-overview").html(`
    <div class="mb-1">Modules: <strong>${overview.modules_total}</strong></div>
    <div class="mb-1">Categories: <strong>${(overview.categories || []).join(", ")}</strong></div>
    <div class="small text-muted">Replica mode shows UI parity structure with dummy data only.</div>
  `);

  const queuesHtml = (overview.queue_summary || []).map((q) => `
    <div class="border rounded p-2 mb-2 bg-white">
      <div><strong>${q.queue}</strong></div>
      <div class="small">Waiting: ${q.waiting} | Agents: ${q.agents_on_queue} | SL: ${q.service_level}</div>
    </div>
  `).join("");
  $("#cloud-queues").html(queuesHtml);

  const dashHtml = (overview.dashboards || []).map((d) => `
    <div class="border rounded p-2 mb-2 bg-white">
      <div><strong>${d.name}</strong></div>
      <div class="small">Widgets: ${d.widgets} | Owner: ${d.owner}</div>
    </div>
  `).join("");
  $("#cloud-dashboards").html(dashHtml);

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

  const panels = (data.dummy_panels || []).map((p) => `<span class="badge text-bg-secondary me-1">${p}</span>`).join("");
  const objects = (data.dummy_objects || []).map((o) => `<li>${o.name} <span class="text-muted">(${o.status})</span></li>`).join("");

  $("#cloud-module-detail").html(`
    <h6>${module.name}</h6>
    <div class="small text-muted mb-2">${module.category} module in replica mode.</div>
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
    $(".page-section").addClass("d-none");
    $(`#${section}-section`).removeClass("d-none");

    if (section === "explore") {
      refreshExplore().catch((e) => showAlert(e.message, "warning"));
    }

    if (section === "cloud") {
      refreshCloudReplica().catch((e) => showAlert(e.message, "warning"));
    }
  });
}

function setupHandlers() {
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
  $(document).on("click", ".cloud-open-btn", function () {
    const moduleId = $(this).data("module-id");
    openCloudModule(moduleId).catch((e) => showAlert(e.message, "danger"));
  });

  $("#btn-accept").on("click", () => activeConnection && activeConnection.accept());
  $("#btn-reject").on("click", () => activeConnection && activeConnection.reject());
  $("#btn-mute").on("click", () => activeConnection && activeConnection.mute(true));
  $("#btn-hangup").on("click", () => activeConnection && activeConnection.disconnect());

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
  setupHandlers();
  if (window.location.pathname === "/app") {
    setupNav();
    await initSession();
  }
});