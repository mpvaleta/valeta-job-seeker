const profile = document.querySelector("#profile");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const fillButton = document.querySelector("#fill");

chrome.storage.local.get("valetaPackage", ({ valetaPackage }) => {
  if (valetaPackage) profile.value = JSON.stringify(valetaPackage, null, 2);
});

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
  summary.innerHTML = `<strong>${response.platform}</strong><span>${response.fillable} ready · ${response.review} review · ${response.unknown} unmapped</span>`;
  results.append(summary);
  response.fields.slice(0, 12).forEach((field) => {
    const row = document.createElement("div");
    row.className = `field ${field.status}`;
    const label = document.createElement("span");
    label.textContent = field.label;
    const badge = document.createElement("b");
    badge.textContent = field.status === "fillable" ? "Ready" : field.status === "review" ? "Review" : "Unmapped";
    row.append(label, badge);
    results.append(row);
  });
  fillButton.disabled = response.fillable === 0;
}

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const value = packageValue();
    await chrome.storage.local.set({ valetaPackage: value });
    status.textContent = "Profile saved only in this browser.";
  } catch {
    status.textContent = "The package is not valid. Download a fresh JSON package from V's Job Seeker.";
  }
});

document.querySelector("#scan").addEventListener("click", async () => {
  try {
    const value = packageValue();
    await chrome.storage.local.set({ valetaPackage: value });
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "VALETA_SCAN", payload: value });
    showScan(response);
    status.textContent = "Blue fields are ready. Orange fields require your review.";
  } catch {
    status.textContent = "Could not inspect this page. Refresh the application page and try again.";
  }
});

fillButton.addEventListener("click", async () => {
  try {
    const value = packageValue();
    await chrome.storage.local.set({ valetaPackage: value });
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "VALETA_FILL", payload: value });
    showScan({ ...response, fillable: 0 });
    status.textContent = `${response.filled} approved fields filled. ${response.review} fields still need review. Nothing submitted.`;
    fillButton.disabled = true;
  } catch {
    status.textContent = "Could not fill this page. Refresh it, scan again, and review the highlighted fields.";
  }
});
