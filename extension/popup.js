const profile = document.querySelector("#profile");
const status = document.querySelector("#status");
chrome.storage.local.get("valetaPackage", ({ valetaPackage }) => { if (valetaPackage) profile.value = JSON.stringify(valetaPackage, null, 2); });
document.querySelector("#save").addEventListener("click", async () => {
  try { const value = JSON.parse(profile.value); await chrome.storage.local.set({ valetaPackage: value }); status.textContent = "Profile saved in this browser."; }
  catch { status.textContent = "The JSON package is not valid. Download a fresh package from the app."; }
});
document.querySelector("#fill").addEventListener("click", async () => {
  try {
    const value = JSON.parse(profile.value); await chrome.storage.local.set({ valetaPackage: value });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "VALETA_FILL", payload: value });
    status.textContent = `${response.filled} fields filled. ${response.review} fields highlighted for review. Nothing submitted.`;
  } catch { status.textContent = "Could not fill this page. Refresh it and try again."; }
});
