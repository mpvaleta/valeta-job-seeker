/*
 * The autofill companion, as a bookmarklet.
 *
 * The Chrome extension needed a folder download, developer mode, "load
 * unpacked", and a reload after every change — and it only ever worked in
 * Chrome. This runs the same field-mapping rules from a saved bookmark, in any
 * browser, including Safari on the iPhone, with nothing installed.
 *
 * Everything is inlined on purpose. Application sites carry strict
 * Content-Security-Policy headers that would block a script fetched from
 * anywhere else; browsers exempt bookmarklets themselves from CSP, so the code
 * has to arrive with the click rather than be pulled down afterwards.
 *
 * The safety posture is the extension's, unchanged: scan and show first, fill
 * only what the user has just seen, never touch a sensitive question, and never
 * submit anything.
 */
(function () {
  var data = globalThis.__VJOBS_AUTOFILL_DATA__;
  var api = globalThis.VJobsAutofill;
  if (!data || !api) { alert("V's autofill could not start — regenerate the bookmarklet from Autofill assistant."); return; }

  var PANEL_ID = "vjobs-autofill-panel";
  var existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();

  function strongLabel(field) {
    var ownLabels = field.labels ? [].slice.call(field.labels).map(function (label) { return label.innerText; }) : [];
    return [field.name, field.id, field.placeholder, field.getAttribute("aria-label")].concat(ownLabels)
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
  }

  function weakLabel(field) {
    var labelledBy = (field.getAttribute("aria-labelledby") || "").split(/\s+/)
      .map(function (id) { var node = document.getElementById(id); return node ? node.innerText : ""; }).filter(Boolean);
    var enclosing = field.closest("label");
    var fieldset = field.closest("fieldset");
    var legend = fieldset ? fieldset.querySelector("legend") : null;
    return labelledBy.concat([enclosing ? enclosing.innerText.slice(0, 180) : "", legend ? legend.innerText : ""])
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
  }

  // An unchecked checkbox still reports "on" and an untouched dropdown reports
  // its placeholder, so neither can be judged by .value alone.
  function isAnswered(field) {
    var type = (field.getAttribute("type") || "").toLowerCase();
    if (type === "checkbox" || type === "radio") return field.checked;
    if (field.tagName === "SELECT") {
      var option = field.selectedOptions && field.selectedOptions[0];
      if (!option) return false;
      var text = (option.value + " " + (option.textContent || "")).trim();
      return Boolean(text) && !/^[\s-]*$/.test(text) && !/^(?:--|—)?\s*(?:please\s+)?(?:select|choose|pick|none)\b/i.test(text);
    }
    if (type === "file") return Boolean(field.files && field.files.length);
    return Boolean(field.value);
  }

  function candidateFields() {
    return [].slice.call(document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select"))
      .filter(function (field) { return !field.disabled && !field.readOnly && field.offsetParent !== null; });
  }

  // React and friends track the value on the element, so assigning .value
  // directly is silently reverted on the next render. Going through the
  // prototype setter and firing the events is what makes the framework notice.
  function setFieldValue(field, value) {
    var prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    var setter = descriptor && descriptor.set;
    if (setter) setter.call(field, value); else field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function shortLabel(value, fallback) {
    var cleaned = String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return (cleaned || fallback).slice(0, 90);
  }

  /*
   * Reading a page of search results.
   *
   * The Chrome extension could do this and the bookmarklet could not, which
   * left the iPhone with no way to file a role at all: on a phone there is no
   * extension, no developer mode, and no Claude at the keyboard. The reader
   * itself is the extension's own module, embedded above, so the two companions
   * can never disagree about how a board's cards are read. It opens nothing,
   * fetches nothing, and sends nothing anywhere — the rows go to the clipboard,
   * and the user pastes them into the app.
   */
  function readResultsPage() {
    var reader = globalThis.VJobsCapture;
    if (!reader) return null;
    try {
      var read = reader.captureVisibleList();
      return read && read.rows.length ? read : { source: "", rows: [] };
    } catch {
      return null;
    }
  }

  // The write has to happen inside the click that asked for it — iOS Safari
  // refuses a clipboard write from anywhere else — and every browser without
  // the async API still has the old selection trick.
  function copyToClipboard(text, done) {
    function legacy() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      area.remove();
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
      return;
    }
    legacy();
  }

  var capture = readResultsPage();

  var scanned = candidateFields().map(function (field, index) {
    var strong = strongLabel(field);
    var weak = weakLabel(field);
    var decision = api.decideField({
      strong: strong,
      weak: weak,
      type: field.getAttribute("type") || (field.tagName === "TEXTAREA" ? "textarea" : ""),
      tag: field.tagName,
      answered: isAnswered(field),
    }, data);
    return {
      field: field,
      label: shortLabel(strong || weak, "Field " + (index + 1)),
      status: decision.status,
      reason: decision.reason,
      ruleKey: decision.ruleKey,
    };
  });

  var fillable = scanned.filter(function (item) { return item.status === "fillable"; });
  var review = scanned.filter(function (item) { return item.status === "review"; });

  var host = document.createElement("div");
  host.id = PANEL_ID;
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px)";
  // A shadow root keeps the host page's stylesheet from reaching the panel, and
  // the panel's from reaching the form.
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML = "<style>"
    + ":host{all:initial}"
    + "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}"
    + ".card{border:1px solid #d8d9de;border-radius:14px;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.22);overflow:hidden;max-height:80vh;display:flex;flex-direction:column}"
    + ".head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ededf0}"
    + ".head b{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#1d1d1f;flex:1}"
    + ".head button{border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:#8a8a8f;padding:0 2px}"
    + ".body{padding:12px 14px;overflow:auto;font-size:12px;line-height:1.5;color:#3a3a3f}"
    + ".count{display:flex;gap:14px;margin-bottom:10px}"
    + ".count div{display:grid}.count strong{font-size:20px;color:#1d1d1f}.count span{font-size:9px;letter-spacing:.07em;text-transform:uppercase;color:#8a8a8f}"
    + "ul{margin:0;padding:0;list-style:none}li{padding:6px 0;border-top:1px solid #f0f0f2}"
    + "li b{display:block;font-size:11px;color:#1d1d1f}li span{font-size:10px;color:#77777d}"
    + ".foot{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #ededf0}"
    + ".foot button{flex:1;border-radius:9px;border:1px solid #d8d9de;background:#fff;padding:9px;font-size:12px;font-weight:600;cursor:pointer}"
    + ".foot button.primary{background:#1d1d1f;border-color:#1d1d1f;color:#fff}"
    + ".foot button:disabled{opacity:.45;cursor:default}"
    + ".note{margin-top:10px;font-size:10px;color:#77777d}"
    + "</style>"
    + "<div class=card>"
    + "<div class=head><b>V's autofill</b><button id=close title=Close>&times;</button></div>"
    + "<div class=body>"
    + "<div class=count><div><strong id=n-fill></strong><span>ready</span></div><div><strong id=n-review></strong><span>your call</span></div></div>"
    + "<div id=list></div>"
    + "<p class=note id=note></p>"
    + "</div>"
    + "<div class=foot><button class=primary id=fill>Fill ready fields</button></div>"
    + "</div>";

  // On a results page there is nothing to fill, so the capture takes the
  // primary slot; on an application form that also happens to list roles, it
  // sits beside the fill button rather than competing with it.
  if (capture && capture.rows.length) {
    var captureButton = document.createElement("button");
    captureButton.id = "capture";
    captureButton.textContent = "Copy " + capture.rows.length + (capture.rows.length === 1 ? " role" : " roles");
    if (!fillable.length) captureButton.className = "primary";
    root.querySelector(".foot").insertBefore(captureButton, root.getElementById("fill"));
    captureButton.onclick = function () {
      copyToClipboard(JSON.stringify({ source: capture.source, rows: capture.rows }), function (copied) {
        captureButton.disabled = copied;
        captureButton.textContent = copied ? "Copied — paste it in V's" : "Copy failed — try again";
      });
    };
  }

  root.getElementById("n-fill").textContent = String(fillable.length);
  root.getElementById("n-review").textContent = String(review.length);
  root.getElementById("close").onclick = function () { host.remove(); };

  var listNode = root.getElementById("list");
  function renderList() {
    var rows = fillable.concat(review).slice(0, 24);
    listNode.innerHTML = "<ul>" + rows.map(function (item) {
      return "<li><b>" + item.label.replace(/[<>&]/g, "") + "</b><span>"
        + (item.status === "filled" ? "Filled" : item.status === "fillable" ? "Ready: " + item.ruleKey : item.reason).replace(/[<>&]/g, "")
        + "</span></li>";
    }).join("") + "</ul>";
  }
  renderList();

  var resumeTitle = data.resume && data.resume.title;
  // Only spoken about when there is something to copy: the reader also runs on
  // ordinary application forms, and saying "no roles found" there is noise.
  root.getElementById("note").textContent = (capture && capture.rows.length
    ? "Read " + capture.rows.length + " roles from this page. Scroll further and press the bookmark again for more, then paste the copy into V's “Paste a captured list”. "
    : "")
    + "Nothing is submitted, and sensitive or legal questions are always left for you."
    + (resumeTitle ? " Résumé to upload yourself: " + resumeTitle + "." : "");

  var fillButton = root.getElementById("fill");
  if (!fillable.length) { fillButton.disabled = true; fillButton.textContent = "Nothing ready to fill"; }
  fillButton.onclick = function () {
    var filled = 0;
    fillable.forEach(function (item) {
      if (item.status !== "fillable" || !document.contains(item.field)) return;
      var rule = api.RULES.filter(function (entry) { return entry.key === item.ruleKey; })[0];
      var value = rule && rule.read(data);
      if (!value) return;
      setFieldValue(item.field, value);
      item.field.style.outline = "3px solid #3155ff";
      item.status = "filled";
      filled += 1;
    });
    renderList();
    fillButton.disabled = true;
    fillButton.textContent = filled + (filled === 1 ? " field filled" : " fields filled");
  };

  document.body.appendChild(host);
})();
