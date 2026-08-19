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
  packageMeta.textContent = resume?.title
    ? `Selected résumé: ${resume.title}. Website file-upload fields remain manual by browser security.`
    : "No résumé version is attached to this package. You can still scan and fill profile fields.";
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
