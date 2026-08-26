const profile = document.querySelector("#profile");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const fillButton = document.querySelector("#fill");
const packageMeta = document.querySelector("#package-meta");

chrome.storage.local.get("valetaPackage", ({ valetaPackage }) => {
  if (valetaPackage) {
    profile.value = JSON.stringify(valetaPackage, null, 2);
    showPackageMeta(valetaPackage);
  }
});

function showPackageMeta(value) {
  const resume = value?.resume;
  packageMeta.textContent = "";
  const note = document.createElement("span");
  note.textContent = resume?.title
    ? `Selected résumé: ${resume.title}. Website file-upload fields remain manual by browser security.`
    : "No résumé version is attached to this package. You can still scan and fill profile fields.";
  packageMeta.append(note);
  if (resume?.content) {
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-resume";
    copyButton.textContent = "Copy résumé text";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(resume.content);
        status.textContent = "Résumé text copied — paste it into forms that accept a pasted résumé instead of a file.";
      } catch {
        status.textContent = "Could not copy. Click inside the popup first, then try again.";
      }
    });
    packageMeta.append(copyButton);
  }
}

function packageValue() {
  const value = JSON.parse(profile.value);
  if (!value?.profile || !value?.answers || value?.safety?.neverSubmit !== true) throw new Error("invalid package");
  return value;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("missing tab");
  return tab;
}

function showScan(response) {
  results.innerHTML = "";
  const summary = document.createElement("div");
  summary.className = "summary";
  const strong = document.createElement("strong");
  strong.textContent = response.platform;
  const span = document.createElement("span");
  span.textContent = `${response.fillable} ready · ${response.review} review · ${response.unknown} unmapped`;
  summary.append(strong, span);
  results.append(summary);

  // Every field the user still has to handle is listed. Truncating silently
  // made a partial list read as the whole form.
  response.fields.forEach((field) => {
    const row = document.createElement("div");
    row.className = `field ${field.status}`;
    const label = document.createElement("span");
    label.textContent = field.label;
    label.title = field.reason || "";
    const badge = document.createElement("b");
    badge.textContent = field.status === "filled" ? "Filled" : field.status === "fillable" ? "Ready" : field.status === "review" ? "Review" : "Unmapped";
    row.append(label, badge);
    results.append(row);
  });

  if (response.hiddenFieldCount > 0) {
    const note = document.createElement("div");
    note.className = "field unknown";
    note.textContent = `${response.hiddenFieldCount} more field${response.hiddenFieldCount === 1 ? "" : "s"} on this page are not listed here — review the page itself before submitting.`;
    results.append(note);
  }
  if (response.appearedSinceScan > 0) {
    const note = document.createElement("div");
    note.className = "field review";
    note.textContent = `${response.appearedSinceScan} field${response.appearedSinceScan === 1 ? "" : "s"} appeared on this page since your last scan — rescan to review and fill ${response.appearedSinceScan === 1 ? "it" : "them"}.`;
    results.append(note);
  }
  fillButton.disabled = response.fillable === 0;
}

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const value = packageValue();
    await chrome.storage.local.set({ valetaPackage: value });
    showPackageMeta(value);
    status.textContent = "Profile saved only in this browser.";
  } catch {
    status.textContent = "The package is not valid. Download a fresh JSON package from V's Job Seeker.";
  }
});

function packageValueOrExplain() {
  // A broken package used to surface as "Could not inspect this page",
  // sending the user to refresh a page that was never the problem.
  try {
    return packageValue();
  } catch {
    status.textContent = "The saved package is not valid JSON from V's Job Seeker. Open the Autofill tab in the app, copy the package again, and paste it above.";
    return null;
  }
}

document.querySelector("#scan").addEventListener("click", async () => {
  const value = packageValueOrExplain();
  if (!value) return;
  try {
    await chrome.storage.local.set({ valetaPackage: value });
    showPackageMeta(value);
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "VALETA_SCAN", payload: value });
    showScan(response);
    status.textContent = "Blue fields are ready. Orange fields require your review.";
  } catch {
    status.textContent = "Could not inspect this page. Refresh the application page and try again.";
  }
});

fillButton.addEventListener("click", async () => {
  const value = packageValueOrExplain();
  if (!value) return;
  try {
    await chrome.storage.local.set({ valetaPackage: value });
    showPackageMeta(value);
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "VALETA_FILL", payload: value });
    if (response.staleScan) {
      status.textContent = "This page hasn't been scanned yet in this session. Click Scan first, review the fields, then fill.";
      return;
    }
    showScan(response);
    const appeared = response.appearedSinceScan > 0 ? ` ${response.appearedSinceScan} new field${response.appearedSinceScan === 1 ? "" : "s"} appeared since your scan and were left untouched — rescan to include ${response.appearedSinceScan === 1 ? "it" : "them"}.` : "";
    status.textContent = `${response.filled} approved ${response.filled === 1 ? "field" : "fields"} filled. ${response.review} still need your review and ${response.unknown} were not recognized. Nothing was submitted.${appeared}`;
    fillButton.disabled = true;
  } catch {
    status.textContent = "Could not fill this page. Refresh it, scan again, and review the highlighted fields.";
  }
});

const appUrlInput = document.querySelector("#app-url");
const appTokenInput = document.querySelector("#app-token");
const connectionState = document.querySelector("#connection-state");

chrome.storage.local.get(["valetaAppUrl", "valetaAppToken"], ({ valetaAppUrl, valetaAppToken }) => {
  if (valetaAppUrl) appUrlInput.value = valetaAppUrl;
  if (valetaAppToken) appTokenInput.value = valetaAppToken;
  showConnectionState(valetaAppUrl, valetaAppToken);
});

function showConnectionState(url, token) {
  connectionState.textContent = url && token ? `connected to ${new URL(url).hostname}` : "not connected";
}

document.querySelector("#save-connection").addEventListener("click", async () => {
  const url = appUrlInput.value.trim().replace(/\/+$/, "");
  const token = appTokenInput.value.trim();
  if (!/^https:\/\//i.test(url) || !token) {
    status.textContent = "Enter the app's https address and your access token, then save.";
    return;
  }
  await chrome.storage.local.set({ valetaAppUrl: url, valetaAppToken: token });
  showConnectionState(url, token);
  status.textContent = "Connection saved in this browser only. Captured roles can now go straight to your inbox.";
});

async function connection() {
  const { valetaAppUrl, valetaAppToken } = await chrome.storage.local.get(["valetaAppUrl", "valetaAppToken"]);
  if (!valetaAppUrl || !valetaAppToken) return null;
  return { url: valetaAppUrl, token: valetaAppToken };
}

document.querySelector("#send-list").addEventListener("click", async () => {
  const linked = await connection();
  if (!linked) {
    status.textContent = "Open “Send straight to V’s” above and save the app address and your access token first.";
    return;
  }
  let capture;
  try {
    const tab = await activeTab();
    capture = await chrome.tabs.sendMessage(tab.id, { type: "VJOBS_CAPTURE_LIST" });
  } catch {
    status.textContent = "Could not read this page. Refresh the search results and try again.";
    return;
  }
  if (!capture?.rows?.length) {
    status.textContent = "No job results were found on this page. Open a search-results page, scroll so the results render, then try again.";
    return;
  }
  status.textContent = `Sending ${capture.rows.length} roles…`;
  try {
    const response = await fetch(`${linked.url}/api/radar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${linked.token}` },
      // LinkedIn captures keep LinkedIn provenance; an Indeed or other-board
      // capture is a role picked out by hand, which is what "imported" means.
      // Filing everything as LinkedIn mislabelled the origin filter.
      body: JSON.stringify({ action: "import_linkedin_saved_jobs", source: capture.source === "linkedin" ? "linkedin" : "captured", rows: capture.rows }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      // The app's own message is far more useful than a status code — an
      // expired token and a full workspace fail very differently.
      status.textContent = data.message || `V’s refused the upload (${response.status}). Check the address and token above.`;
      return;
    }
    const added = data.result?.added || 0;
    const updated = data.result?.updated || 0;
    status.textContent = `${added} new ${added === 1 ? "role" : "roles"} filed in your Discovery Inbox${updated ? `, ${updated} refreshed` : ""}. Open V’s Job radar to review them.`;
  } catch {
    status.textContent = "Could not reach V’s. Check the app address above and that you are online.";
  }
});

document.querySelector("#capture").addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    const capture = await chrome.tabs.sendMessage(tab.id, { type: "VJOBS_CAPTURE_ROLE" });
    if (!capture?.text || capture.text.length < 80) throw new Error("not enough visible role text");
    await navigator.clipboard.writeText(JSON.stringify(capture));
    status.textContent = "Visible role capture copied. Go to V’s Role Workspace and choose Paste visible-page capture.";
  } catch {
    status.textContent = "Could not read this page. Refresh the job page, then try again. Nothing was sent anywhere.";
  }
});
