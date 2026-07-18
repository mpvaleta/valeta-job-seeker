const sensitive = /salary|compensation|authorization|sponsor|visa|gender|race|ethnicity|veteran|disability|criminal|legal|ssn|social security|birth|age/i;
const rules = [
  { match: /first.?name|given.?name/i, get: (d) => d.profile.fullName?.split(/\s+/)[0] },
  { match: /last.?name|family.?name|surname/i, get: (d) => d.profile.fullName?.split(/\s+/).slice(1).join(" ") },
  { match: /full.?name|your.?name|candidate.?name/i, get: (d) => d.profile.fullName },
  { match: /e.?mail/i, get: (d) => d.profile.email },
  { match: /phone|mobile|telephone/i, get: (d) => d.profile.phone },
  { match: /city|location|address/i, get: (d) => d.profile.location },
  { match: /linkedin/i, get: (d) => d.profile.linkedin },
  { match: /headline|professional.?title/i, get: (d) => d.answers.headline },
  { match: /about.?you|summary|background|tell.?us.?about/i, get: (d) => d.answers.summary },
  { match: /why.*(role|position)|interest.*(role|position)/i, get: (d) => d.answers.interest }
];
function descriptor(field) {
  const labels = field.labels ? [...field.labels].map((x) => x.innerText).join(" ") : "";
  return [field.name, field.id, field.placeholder, field.getAttribute("aria-label"), labels].filter(Boolean).join(" ");
}
function fill(data) {
  let filled = 0, review = 0;
  document.querySelectorAll("input:not([type=hidden]):not([type=file]), textarea").forEach((field) => {
    const label = descriptor(field);
    if (sensitive.test(label)) { field.style.outline = "3px solid #ff9e36"; field.dataset.valetaReview = "Sensitive field — answer personally"; review++; return; }
    const rule = rules.find((item) => item.match.test(label)); const value = rule?.get(data);
    if (!value || field.value) return;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    if (setter) setter.call(field, value); else field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true }));
    field.style.outline = "3px solid #3155ff"; field.dataset.valetaFilled = "true"; filled++;
  });
  return { filled, review };
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { if (message.type === "VALETA_FILL") sendResponse(fill(message.payload)); });
