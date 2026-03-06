/* ===== Mini-Genesys — Premium UI JavaScript ===== */

let currentUser = null;
let twilioDevice = null;
let activeConnection = null;
let campaignPollTimer = null;
let callsPollTimer = null;

/* ---------- Toast Notifications ---------- */
function showAlert(message, level = "info") {
  const iconMap = {
    success: "bi-check-circle-fill",
    danger: "bi-exclamation-triangle-fill",
    warning: "bi-exclamation-circle-fill",
    info: "bi-info-circle-fill",
    secondary: "bi-chat-dots-fill",
  };
  const icon = iconMap[level] || iconMap.info;

  const el = $(`
    <div class="alert alert-${level} alert-dismissible fade show d-flex align-items-center gap-2" role="alert">
      <i class="bi ${icon}" style="font-size: 1rem; flex-shrink: 0;"></i>
      <span>${message}</span>
      <button type="button" class="btn-close" data-bs-dismiss="alert" style="font-size: 0.65rem;"></button>
    </div>
  `);

  $("#alerts").append(el);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    el.addClass("fade");
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

/* ---------- Redirect ---------- */
function redirectToRoot() {
  if (window.location.pathname !== "/") {
    window.location.href = "/";
  }
}

/* ---------- API Helper ---------- */
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

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);

  return body;
}

/* ---------- Button Loading State ---------- */
function setButtonLoading(btn, loading) {
  const $btn = $(btn);
  if (loading) {
    $btn.data("original-html", $btn.html());
    $btn.prop("disabled", true).html('<span class="spinner-ring me-2"></span>Loading...');
  } else {
    $btn.prop("disabled", false).html($btn.data("original-html") || $btn.html());
  }
}

/* ---------- Session Init ---------- */
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

/* ---------- Twilio ---------- */
async function initTwilio() {
  try {
    const data = await api("/api/voice/token", { method: "GET" });
    twilioDevice = new Twilio.Device(data.token, { debug: false });

    twilioDevice.on("ready", () => showAlert("Softphone ready", "success"));
    twilioDevice.on("error", (err) => showAlert(`Twilio error: ${err.message}`, "danger"));
    twilioDevice.on("incoming", (conn) => {
      activeConnection = conn;
      showAlert("Incoming call — click Accept to answer", "warning");
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

/* ---------- Agent Status ---------- */
async function setAgentStatus(status) {
  const data = await api("/api/agent/status", {
    method: "POST",
    body: JSON.stringify({ status }),
  });

  const indicator = $("#status-text");
  const isAvailable = data.status === "available";

  indicator
    .removeClass("available offline")
    .addClass(isAvailable ? "available" : "offline")
    .html(`<i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i> ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`);
}

/* ---------- Manual Call ---------- */
async function makeManualCall() {
  const toNumber = $("#dial-number").val().trim();
  if (!toNumber) {
    showAlert("Please enter a phone number", "warning");
    return;
  }

  setButtonLoading("#manual-call-btn", true);
  try {
    const data = await api("/api/calls/manual", {
      method: "POST",
      body: JSON.stringify({ to_number: toNumber }),
    });
    showAlert(`Call queued (${data.status})`, "info");
    if (twilioDevice) {
      activeConnection = twilioDevice.connect({ To: toNumber });
    }
    refreshRecentCalls();
  } finally {
    setButtonLoading("#manual-call-btn", false);
  }
}

/* ---------- Recent Calls ---------- */
async function refreshRecentCalls() {
  const rows = await api("/api/calls/recent?limit=20", { method: "GET" });
  const tbody = $("#recent-calls-table tbody").empty();
  const logs = $("#logs-list").empty();

  $("#calls-count").text(rows.length);

  if (!rows.length) {
    tbody.append('<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-telephone-x d-block mb-2" style="font-size: 1.5rem; opacity: 0.4;"></i>No recent calls</td></tr>');
    logs.html('<div class="empty-state"><i class="bi bi-journal-x d-block"></i><p>No call logs yet</p></div>');
    return;
  }

  rows.forEach((c) => {
    const dirIcon = c.direction === "inbound"
      ? '<i class="bi bi-telephone-inbound text-info"></i>'
      : '<i class="bi bi-telephone-outbound text-primary"></i>';
    const statusBadge = getStatusBadge(c.status);
    const time = (c.started_at || "").replace("T", " ").substring(0, 19);

    tbody.append(`
      <tr>
        <td class="text-muted">#${c.id}</td>
        <td>${dirIcon} <span class="small">${c.direction}</span></td>
        <td><code style="font-size: 0.8rem;">${c.to_number}</code></td>
        <td>${statusBadge}</td>
        <td class="small text-muted">${time}</td>
      </tr>
    `);

    const logDirClass = c.direction === "inbound" ? "inbound" : "outbound";
    const logIcon = c.direction === "inbound" ? "bi-telephone-inbound" : "bi-telephone-outbound";
    logs.append(`
      <div class="log-entry">
        <div class="log-icon ${logDirClass}"><i class="bi ${logIcon}"></i></div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <strong class="small">#${c.id} ${c.direction}</strong>
            ${statusBadge}
          </div>
          <div class="small text-muted">${c.from_number || '—'} → ${c.to_number}</div>
        </div>
        <div class="small text-muted">${time}</div>
      </div>
    `);
  });
}

function getStatusBadge(status) {
  const map = {
    completed: { bg: "rgba(16,185,129,0.12)", color: "#059669", icon: "bi-check-circle" },
    "in-progress": { bg: "rgba(99,102,241,0.12)", color: "#4f46e5", icon: "bi-arrow-repeat" },
    queued: { bg: "rgba(245,158,11,0.12)", color: "#d97706", icon: "bi-hourglass-split" },
    failed: { bg: "rgba(239,68,68,0.12)", color: "#dc2626", icon: "bi-x-circle" },
    ringing: { bg: "rgba(6,182,212,0.12)", color: "#0891b2", icon: "bi-bell" },
    busy: { bg: "rgba(239,68,68,0.12)", color: "#dc2626", icon: "bi-slash-circle" },
    "no-answer": { bg: "rgba(100,116,139,0.12)", color: "#64748b", icon: "bi-telephone-x" },
  };
  const s = map[status] || { bg: "rgba(100,116,139,0.12)", color: "#64748b", icon: "bi-question-circle" };
  return `<span class="badge" style="background:${s.bg}; color:${s.color};"><i class="bi ${s.icon} me-1"></i>${status}</span>`;
}

/* ---------- Campaigns ---------- */
async function createCampaign() {
  const name = $("#campaign-name").val().trim();
  if (!name) {
    showAlert("Please enter a campaign name", "warning");
    return;
  }

  setButtonLoading("#create-campaign-btn", true);
  try {
    const data = await api("/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    $("#campaign-id").val(data.id);
    showAlert(`Campaign created: #${data.id}`, "success");
    await refreshCampaign();
  } finally {
    setButtonLoading("#create-campaign-btn", false);
  }
}

async function campaignAction(action) {
  const id = $("#campaign-id").val().trim();
  if (!id) {
    showAlert("Enter campaign ID first", "warning");
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

  setButtonLoading("#upload-csv-btn", true);
  try {
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
  } finally {
    setButtonLoading("#upload-csv-btn", false);
  }
}

async function refreshCampaign() {
  const id = $("#campaign-id").val().trim();
  if (!id) return;

  try {
    const status = await api(`/api/campaigns/${id}/status`, { method: "GET" });
    const counts = status.counts || {};
    const statusClass = `status-${status.status}`;

    $("#campaign-summary").html(`
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h6 class="mb-0">${status.name}</h6>
        <span class="status-badge ${statusClass}">${status.status}</span>
      </div>
      <div class="row g-2 text-center">
        <div class="col-4">
          <div class="stat-card">
            <div class="stat-value">${counts.pending || 0}</div>
            <div class="stat-label">Pending</div>
          </div>
        </div>
        <div class="col-4">
          <div class="stat-card">
            <div class="stat-value" style="color: var(--success);">${counts.answered || 0}</div>
            <div class="stat-label">Answered</div>
          </div>
        </div>
        <div class="col-4">
          <div class="stat-card">
            <div class="stat-value" style="color: var(--danger);">${counts.failed || 0}</div>
            <div class="stat-label">Failed</div>
          </div>
        </div>
      </div>
    `);

    const contacts = await api(`/api/campaigns/${id}/contacts?offset=0&limit=100`, { method: "GET" });
    const tbody = $("#campaign-contacts-table tbody").empty();

    if (!contacts.items || !contacts.items.length) {
      tbody.append('<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-people d-block mb-2" style="font-size: 1.5rem; opacity: 0.4;"></i>No contacts uploaded yet</td></tr>');
      return;
    }

    contacts.items.forEach((x) => {
      const contactStatus = getStatusBadge(x.status);
      tbody.append(`
        <tr>
          <td class="text-muted">#${x.id}</td>
          <td><i class="bi bi-person me-1 text-muted"></i>${x.name}</td>
          <td><code style="font-size: 0.8rem;">${x.phone}</code></td>
          <td>${contactStatus}</td>
          <td class="text-center">${x.attempt_count}</td>
          <td class="small text-danger">${x.last_error || "—"}</td>
        </tr>
      `);
    });
  } catch (err) {
    showAlert(err.message, "warning");
  }
}

/* ---------- Explore Catalog ---------- */
function renderExploreCatalog(items) {
  const container = $("#explore-catalog").empty();
  $("#catalog-count").text(items.length);

  if (!items.length) {
    container.append(`
      <div class="col-12">
        <div class="empty-state">
          <i class="bi bi-search d-block"></i>
          <p>No results for current filters</p>
        </div>
      </div>
    `);
    return;
  }

  const levelColors = {
    beginner: { bg: "rgba(16,185,129,0.12)", color: "#059669" },
    intermediate: { bg: "rgba(245,158,11,0.12)", color: "#d97706" },
    advanced: { bg: "rgba(239,68,68,0.12)", color: "#dc2626" },
  };

  const typeIcons = {
    learning_path: "bi-signpost-2",
    certification: "bi-award",
    webinar: "bi-camera-video",
  };

  items.forEach((item) => {
    const lc = levelColors[item.level] || { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
    const typeIcon = typeIcons[item.type] || "bi-book";

    container.append(`
      <div class="col-md-6">
        <div class="card catalog-card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <span class="badge text-bg-primary"><i class="bi ${typeIcon} me-1"></i>${item.type.replace("_", " ")}</span>
              <span class="badge" style="background: ${lc.bg}; color: ${lc.color};">${item.level}</span>
            </div>
            <h6 class="mb-1">${item.title}</h6>
            <p class="small text-muted mb-3">${item.description}</p>
            <div class="d-flex flex-wrap gap-2">
              <span class="small text-muted"><i class="bi bi-person me-1"></i>${item.role}</span>
              <span class="small text-muted"><i class="bi bi-bookmark me-1"></i>${item.track}</span>
              <span class="small text-muted"><i class="bi bi-display me-1"></i>${item.modality}</span>
              <span class="small text-muted"><i class="bi bi-clock me-1"></i>${item.duration_hours}h</span>
            </div>
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
  const byType = summary.by_type || {};
  $("#explore-summary").html(`
    <div class="mb-3">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="small text-muted">Total Items</span>
        <strong>${summary.total || 0}</strong>
      </div>
    </div>
    <div class="mb-2">
      <div class="small text-muted mb-1 fw-semibold">By Type</div>
      ${Object.entries(byType).map(([k, v]) => `
        <div class="d-flex justify-content-between small mb-1">
          <span>${k.replace("_", " ")}</span>
          <span class="badge text-bg-secondary">${v}</span>
        </div>
      `).join("")}
    </div>
    <div class="mb-2">
      <div class="small text-muted mb-1 fw-semibold">Tracks</div>
      <div class="d-flex flex-wrap gap-1">
        ${(summary.tracks || []).map(t => `<span class="badge text-bg-light border">${t}</span>`).join("")}
      </div>
    </div>
    <div>
      <div class="small text-muted mb-1 fw-semibold">Modalities</div>
      <div class="d-flex flex-wrap gap-1">
        ${(summary.modalities || []).map(m => `<span class="badge text-bg-light border">${m}</span>`).join("")}
      </div>
    </div>
  `);

  const recRole = currentUser && currentUser.role === "admin" ? "admin" : "agent";
  const recs = await api(`/api/explore/recommendations?role=${recRole}`, { method: "GET" });
  const recContainer = $("#explore-recommendations").empty();

  if (!(recs.items || []).length) {
    recContainer.html('<div class="empty-state"><i class="bi bi-lightbulb d-block"></i><p>No recommendations</p></div>');
    return;
  }

  (recs.items || []).forEach((item) => {
    const typeIcon = { learning_path: "bi-signpost-2", certification: "bi-award", webinar: "bi-camera-video" }[item.type] || "bi-book";
    recContainer.append(`
      <div class="rec-item">
        <div class="d-flex align-items-center gap-2 mb-1">
          <i class="bi ${typeIcon}" style="color: var(--primary);"></i>
          <strong class="small">${item.title}</strong>
        </div>
        <div class="d-flex gap-2 small text-muted">
          <span>${item.type.replace("_", " ")}</span>
          <span>|</span>
          <span>${item.level}</span>
          <span>|</span>
          <span>${item.duration_hours}h</span>
        </div>
      </div>
    `);
  });
}

/* ---------- Cloud Replica ---------- */
function moduleCardHtml(module) {
  const features = module.features.map((f) => `<span class="badge text-bg-light border me-1 mb-1">${f}</span>`).join("");
  return `
    <div class="col-md-6 col-xl-4">
      <div class="card module-card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <h6 class="mb-1">${module.name}</h6>
              <div class="small text-muted"><i class="bi bi-folder me-1"></i>${module.category}</div>
            </div>
            <span class="badge text-bg-warning">${module.status}</span>
          </div>
          <div class="small mb-3">${features}</div>
          <button class="btn btn-sm btn-outline-primary cloud-open-btn" data-module-id="${module.id}">
            <i class="bi bi-box-arrow-up-right me-1"></i> Open
          </button>
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
    <div class="d-flex align-items-center gap-2 mb-2">
      <div class="stat-card flex-fill">
        <div class="stat-value">${overview.modules_total}</div>
        <div class="stat-label">Modules</div>
      </div>
      <div class="stat-card flex-fill">
        <div class="stat-value" style="color: var(--accent);">${(overview.categories || []).length}</div>
        <div class="stat-label">Categories</div>
      </div>
    </div>
    <div class="d-flex flex-wrap gap-1">
      ${(overview.categories || []).map(c => `<span class="badge text-bg-light border">${c}</span>`).join("")}
    </div>
    <div class="small text-muted mt-2"><i class="bi bi-info-circle me-1"></i>Replica mode — UI parity with dummy data.</div>
  `);

  const queuesHtml = (overview.queue_summary || []).map((q) => `
    <div class="snapshot-card">
      <div class="d-flex justify-content-between align-items-center">
        <strong class="small">${q.queue}</strong>
        <span class="badge text-bg-secondary">${q.service_level}</span>
      </div>
      <div class="d-flex gap-3 small text-muted mt-1">
        <span><i class="bi bi-hourglass-split me-1"></i>Waiting: ${q.waiting}</span>
        <span><i class="bi bi-people me-1"></i>Agents: ${q.agents_on_queue}</span>
      </div>
    </div>
  `).join("");
  $("#cloud-queues").html(queuesHtml || '<div class="empty-state"><i class="bi bi-inbox d-block"></i><p>No queues</p></div>');

  const dashHtml = (overview.dashboards || []).map((d) => `
    <div class="snapshot-card">
      <div class="d-flex justify-content-between align-items-center">
        <strong class="small"><i class="bi bi-speedometer me-1" style="color: var(--primary);"></i>${d.name}</strong>
        <span class="badge text-bg-secondary">${d.widgets} widgets</span>
      </div>
      <div class="small text-muted mt-1"><i class="bi bi-person me-1"></i>Owner: ${d.owner}</div>
    </div>
  `).join("");
  $("#cloud-dashboards").html(dashHtml || '<div class="empty-state"><i class="bi bi-speedometer2 d-block"></i><p>No dashboards</p></div>');

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
    holder.html('<div class="col-12"><div class="empty-state"><i class="bi bi-boxes d-block"></i><p>No modules match current filter</p></div></div>');
    return;
  }

  data.items.forEach((m) => holder.append(moduleCardHtml(m)));
}

async function openCloudModule(moduleId) {
  const data = await api(`/api/cloud-replica/module/${moduleId}`, { method: "GET" });
  const module = data.module;

  const panels = (data.dummy_panels || []).map((p) => `<span class="badge text-bg-secondary me-1 mb-1"><i class="bi bi-layout-sidebar me-1"></i>${p}</span>`).join("");
  const objects = (data.dummy_objects || []).map((o) => `
    <li class="d-flex justify-content-between align-items-center py-1">
      <span>${o.name}</span>
      <span class="badge text-bg-light border">${o.status}</span>
    </li>
  `).join("");

  $("#cloud-module-detail").html(`
    <div class="d-flex align-items-center gap-2 mb-2">
      <i class="bi bi-box" style="color: var(--primary); font-size: 1.2rem;"></i>
      <h6 class="mb-0">${module.name}</h6>
    </div>
    <div class="small text-muted mb-3"><i class="bi bi-folder me-1"></i>${module.category} module in replica mode</div>
    <div class="mb-3">${panels}</div>
    <div>
      <div class="small fw-semibold mb-2"><i class="bi bi-database me-1"></i>Dummy Objects</div>
      <ul class="list-unstyled mb-0">${objects}</ul>
    </div>
  `);
}

async function runCloudAction() {
  setButtonLoading("#cloud-action-btn", true);
  try {
    const res = await api("/api/cloud-replica/action", { method: "POST", body: JSON.stringify({ action: "dummy" }) });
    showAlert(res.message, "secondary");
  } finally {
    setButtonLoading("#cloud-action-btn", false);
  }
}

/* ---------- Navigation ---------- */
function setupNav() {
  $(".nav-btn").on("click", function () {
    $(".nav-btn").removeClass("active");
    $(this).addClass("active");

    const section = $(this).data("section");

    // Smooth section transition
    $(".page-section").each(function () {
      if (!$(this).hasClass("d-none")) {
        $(this).css({ opacity: 0, transform: "translateY(10px)" });
        setTimeout(() => {
          $(this).addClass("d-none").css({ opacity: "", transform: "" });
        }, 200);
      }
    });

    setTimeout(() => {
      const target = $(`#${section}-section`);
      target.removeClass("d-none").css({ opacity: 0, transform: "translateY(12px)" });
      requestAnimationFrame(() => {
        target.css({
          transition: "opacity 0.4s ease, transform 0.4s ease",
          opacity: 1,
          transform: "translateY(0)",
        });
      });

      // Refresh data when switching sections
      if (section === "explore") refreshExplore().catch((e) => showAlert(e.message, "warning"));
      if (section === "cloud") refreshCloudReplica().catch((e) => showAlert(e.message, "warning"));
      if (section === "logs") refreshRecentCalls().catch((e) => showAlert(e.message, "warning"));
    }, 220);
  });
}

/* ---------- Event Handlers ---------- */
function setupHandlers() {
  // Agent status
  $("#status-available").on("click", () => setAgentStatus("available").catch((e) => showAlert(e.message, "danger")));
  $("#status-offline").on("click", () => setAgentStatus("offline").catch((e) => showAlert(e.message, "danger")));

  // Manual call
  $("#manual-call-btn").on("click", () => makeManualCall().catch((e) => showAlert(e.message, "danger")));

  // Campaign actions
  $("#create-campaign-btn").on("click", () => createCampaign().catch((e) => showAlert(e.message, "danger")));
  $("#start-campaign-btn").on("click", () => campaignAction("start").catch((e) => showAlert(e.message, "danger")));
  $("#pause-campaign-btn").on("click", () => campaignAction("pause").catch((e) => showAlert(e.message, "danger")));
  $("#stop-campaign-btn").on("click", () => campaignAction("stop").catch((e) => showAlert(e.message, "danger")));
  $("#upload-csv-btn").on("click", () => uploadCsv().catch((e) => showAlert(e.message, "danger")));

  // Logs
  $("#refresh-logs-btn").on("click", () => refreshRecentCalls().catch((e) => showAlert(e.message, "danger")));

  // Explore
  $("#explore-refresh-btn").on("click", () => refreshExplore().catch((e) => showAlert(e.message, "danger")));

  // Cloud
  $("#cloud-refresh-btn").on("click", () => refreshCloudModules().catch((e) => showAlert(e.message, "danger")));
  $("#cloud-action-btn").on("click", () => runCloudAction().catch((e) => showAlert(e.message, "danger")));
  $(document).on("click", ".cloud-open-btn", function () {
    openCloudModule($(this).data("module-id")).catch((e) => showAlert(e.message, "danger"));
  });

  // Call controls
  $("#btn-accept").on("click", () => activeConnection && activeConnection.accept());
  $("#btn-reject").on("click", () => activeConnection && activeConnection.reject());
  $("#btn-mute").on("click", () => {
    if (activeConnection) {
      const isMuted = activeConnection.isMuted && activeConnection.isMuted();
      activeConnection.mute(!isMuted);
      const $btn = $("#btn-mute");
      if (!isMuted) {
        $btn.html('<i class="bi bi-mic"></i> Unmute').removeClass("btn-outline-info").addClass("btn-outline-warning");
      } else {
        $btn.html('<i class="bi bi-mic-mute"></i> Mute').removeClass("btn-outline-warning").addClass("btn-outline-info");
      }
    }
  });
  $("#btn-hangup").on("click", () => activeConnection && activeConnection.disconnect());

  // Logout
  $("#logout-btn").on("click", async () => {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/";
  });

  // Login form
  $("#login-form").on("submit", async (e) => {
    e.preventDefault();
    const $btn = $(e.target).find('button[type="submit"]');
    setButtonLoading($btn, true);

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
      $("#login-error").removeClass("d-none").html(`<i class="bi bi-exclamation-triangle me-2"></i>${err.message}`);
      setButtonLoading($btn, false);
    }
  });

  // Button ripple effect
  $(document).on("mousedown", ".btn", function (e) {
    const rect = this.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    this.style.setProperty("--ripple-x", x + "%");
    this.style.setProperty("--ripple-y", y + "%");
  });
}

/* ---------- Polling ---------- */
function startPolling() {
  callsPollTimer = setInterval(() => refreshRecentCalls().catch(() => {}), 5000);
  campaignPollTimer = setInterval(() => refreshCampaign().catch(() => {}), 4000);
}

/* ---------- Init ---------- */
$(document).ready(async () => {
  setupHandlers();
  if (window.location.pathname === "/app") {
    setupNav();
    await initSession();
  }
});
