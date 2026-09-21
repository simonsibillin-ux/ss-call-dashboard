const BUSINESS = {
  email: "ssexteriorservices@outlook.com",
  phone: "0447 130 743",
  website: "ssexteriorservices.com.au",
};

const SERVICE_INCLUSIONS = [
  [/(gutter).*(soft|exterior)|(soft|exterior).*(gutter)/i, ["Complete cleaning of dirt, grime, debris, and organic material from exterior gutter surfaces", "Before and after photos"]],
  [/(solar).*(bird|proof)|(bird|proof).*(solar)/i, ["Nest and debris removal from under solar panels", "General clean and wash of the area under panels", "Full gutter clean (debris removal + downpipes flushed)", "Solar panel clean (purified deionised water + nylon brushes)", "Solar bird proofing mesh installation (linear metres around panel perimeter)", "From price given on call — confirmed after Google Earth measurement"]],
  [/gutter/i, ["All debris removed from gutters (dry or wet)", "All downpipes flushed", "Before and after photos provided", "Debris disposed of on client's property (bin or designated spot)", "Off-site removal available at additional $100", "Additional structures included if selected"]],
  [/solar/i, ["Removal of organic material, lichen, and debris from panel surfaces and frames", "Scrubbed with non-abrasive nylon brushes — completely safe for panels", "Purified deionised water used exclusively", "All methods follow solar panel manufacturer specifications", "Before and after photos"]],
  [/window/i, ["Clean of all panes, frames, sills, and tracks", "Method: bucket and squeegee or water-fed pole with purified deionised water", "Standard clean disclaimer: does not include hard water stains, paint residue, silicone, or heavy buildup without prior agreement"]],
  [/house|soft\s*wash/i, ["Complete clean of exterior walls, facades, gutters, fascia, and eaves", "Does NOT include roof (separate service)", "All methods comply with manufacturer specifications — warranty compliant", "Before and after photos", "Stain removal (non-organic) is a separate custom quote"]],
  [/(roof).*(biocide|treat)|(biocide|treat).*(roof)/i, ["Complete biocide treatment application across entire roof surface", "Kills existing lichen, moss, and algae at the root", "Prevents regrowth for 2–4 years", "Safe for all roof types including terra cotta", "Before and after photos"]],
  [/roof/i, ["Complete killing and removal of lichen, moss, algae, and organic material", "Softwash method — safe for all roof types", "All methods comply with manufacturer specifications", "Before and after photos"]],
  [/pressure|concrete|paver|driveway/i, ["Complete pressure wash of all flat surfaces", "Removal of dirt, grime, debris, and organic material", "Before and after photos", "Optional biocide post-treatment: prevents regrowth for 2–4 years"]],
];

const money = value => Number(value || 0).toFixed(2);
const quoteItems = quote => (Array.isArray(quote?.items) ? quote.items : []).filter(item => item?.description !== "TOTAL");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inclusionsFor(item) {
  if (Array.isArray(item?.inclusions) && item.inclusions.length) return item.inclusions;
  return SERVICE_INCLUSIONS.find(([pattern]) => pattern.test(String(item?.description || item?.name || "")))?.[1] || [];
}

export function buildCoreQuoteEmail(quote, client = {}) {
  const items = quoteItems(quote);
  const serviceLabel = items.map(item => item.description || item.name).filter(Boolean).join(" + ") || "Service";
  const firstName = String(quote?.client || client?.name || "there").trim().split(/\s+/)[0];
  const sections = items.map(item => {
    const inclusions = inclusionsFor(item).map(line => `  • ${line}`).join("\n");
    return `\n─────────────────────────────────────────
SERVICE: ${item.description || item.name || "Service"}
  Subtotal: $${money(item.total)}
${inclusions ? `\nWHAT'S INCLUDED:\n${inclusions}\n` : ""}`;
  }).join("");

  return {
    subject: `Your Quote from SS Exterior Services — ${serviceLabel}`,
    body: `Hi ${firstName},

Thank you for calling SS Exterior Services! Here is your quote as discussed:

ADDRESS: ${client?.suburb || client?.address || "As discussed"}
${sections}
═════════════════════════════════════════
TOTAL (inc. GST): $${money(quote?.total)}
═════════════════════════════════════════

IMPORTANT NOTES:
  • Please ensure clear access to all areas to be serviced on the day
  • A responsible adult must be present or access arrangements confirmed in advance
  • Prices may vary if site conditions differ materially from what was described
  • This quote is valid for 30 days from today's date
  • All prices are inclusive of GST

To accept this quote, simply reply to this email or call/text Simon directly. We'll then lock in a suitable date and time.

If you have any questions at all, don't hesitate to get in touch — we're happy to help!

Kind regards,
Simon Sibillin
SS Exterior Services
📞 ${BUSINESS.phone}
📧 ${BUSINESS.email}
🌐 ${BUSINESS.website}

---
Google Review: g.page/r/ssexteriorservices | Facebook | Instagram | TikTok`,
  };
}

export function printCoreQuote(quote, client = {}, logo = "", reservedWindow = null) {
  const items = quoteItems(quote);
  const date = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const address = [client?.address, client?.suburb].filter(Boolean).join(", ");
  const rows = items.map(item => `<tr><td>${escapeHtml(item.description || item.name || "Service")}</td><td></td><td></td><td></td><td class="amount">$${money(item.total)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quote ${escapeHtml(quote?.id || "")} - SS Exterior Services</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:#222;font-size:13px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}.logo-side{display:flex;align-items:flex-start;gap:14px}.logo{height:80px;width:auto;object-fit:contain}.brand-contact{font-size:11px;color:#555;margin-top:5px;line-height:1.7}.quote-block{text-align:right}.quote-title{font-size:30px;font-weight:900;letter-spacing:3px}.quote-id{font-size:15px;font-weight:700;color:#333;margin-top:4px}.quote-meta{font-size:11px;color:#666;margin-top:5px;line-height:1.8}.divider{border:0;border-top:3px solid #39b54a;margin:18px 0}.prepared-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}.client-name{font-size:17px;font-weight:700}.client-detail{font-size:12px;color:#555;margin-top:3px}table{width:100%;border-collapse:collapse;margin-top:20px}th{text-align:left;font-size:11px;color:#555;text-transform:uppercase;padding:10px 8px;border-top:2px solid #222;border-bottom:2px solid #222}td{padding:13px 8px;border-bottom:1px solid #eee}.amount{text-align:right}.total-row td{font-size:15px;font-weight:800;border-top:2px solid #222;border-bottom:0;padding-top:14px}.footer{margin-top:40px;font-size:11px;color:#666;border-top:1px solid #ddd;padding-top:16px;line-height:1.7}.social-row{margin-top:14px;text-align:center}.social-row span{margin:0 10px;font-weight:600;color:#39b54a}.print-button{margin-top:24px;background:#39b54a;color:#fff;border:0;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}@media print{body{padding:20px}.print-button{display:none}}
</style></head><body><div class="header"><div class="logo-side">${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="SS Exterior Services">` : ""}<div class="brand-contact">ABN 93 572 816 955<br>Kilmore VIC 3764<br>📞 ${BUSINESS.phone}<br>${BUSINESS.email}</div></div><div class="quote-block"><div class="quote-title">QUOTE</div><div class="quote-id">${escapeHtml(quote?.id || "")}</div><div class="quote-meta">Date: ${date}<br>Valid: 30 days</div></div></div><hr class="divider"><div style="margin-bottom:24px"><div class="prepared-label">Prepared For</div><div class="client-name">${escapeHtml(quote?.client || client?.name || "")}</div>${client?.phone ? `<div class="client-detail">${escapeHtml(client.phone)}</div>` : ""}${address ? `<div class="client-detail">${escapeHtml(address)}</div>` : ""}</div><table><thead><tr><th style="width:48%">Description</th><th style="text-align:center;width:10%">QTY</th><th style="text-align:center;width:10%">Unit</th><th style="text-align:right;width:16%">Rate</th><th style="text-align:right;width:16%">Total</th></tr></thead><tbody>${rows}<tr class="total-row"><td colspan="4" style="text-align:right">Total (inc. GST)</td><td class="amount">$${money(quote?.total)}</td></tr></tbody></table><div class="footer">This quote is valid for 30 days from the date above. Prices are inclusive of GST. To accept this quote or ask any questions, contact Simon on ${BUSINESS.phone} or ${BUSINESS.email}.<div class="social-row">Connect with us: <span>⭐ Google Review</span><span>Facebook</span><span>Instagram</span><span>TikTok</span></div></div><button class="print-button" onclick="window.print()">🖨️ Print / Save as PDF</button></body></html>`;
  const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const printWindow = reservedWindow && !reservedWindow.closed ? reservedWindow : window.open("", "_blank");
  if (!printWindow) return;
  printWindow.location.replace(blobUrl);
  printWindow.addEventListener("load", () => setTimeout(() => {
    printWindow.print();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }, 300));
}

export function deliverCoreQuote({ quote, client = {}, logo = "" }) {
  const printWindow = window.open("", "_blank");
  if (printWindow) printWindow.document.write("<!doctype html><title>Preparing quote…</title><div style='font-family:Arial,sans-serif;padding:32px'>Preparing quote PDF…</div>");
  const { subject, body } = buildCoreQuoteEmail(quote, client);
  const email = client?.email || "";
  const openEmail = () => window.open(`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(email)}&subject=${encodeURIComponent(subject)}`, "_blank");
  const status = document.createElement("div");
  status.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
  status.innerHTML = `<div style="background:#fff;border-radius:16px;padding:22px;max-width:460px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.4)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><strong>📧 Send Quote Email</strong><button data-close style="border:0;background:none;font-size:20px;cursor:pointer;color:#888">✕</button></div><div style="font-size:12px;color:#555;margin-bottom:14px">${email ? `<strong>To:</strong> ${escapeHtml(email)}` : "⚠️ No email on file — add recipient in Outlook"}</div><div data-message style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:12px;color:#9a3412;font-weight:600;margin-bottom:12px">Copying the quote body…</div><button data-copy style="width:100%;background:#f3f4f6;border:1px solid #ddd;border-radius:8px;padding:9px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px">📋 Copy Quote Body</button><textarea readonly style="display:none;width:100%;height:100px;font-size:11px;border:1px solid #ddd;border-radius:6px;padding:8px;box-sizing:border-box;margin-bottom:8px">${escapeHtml(body)}</textarea><button data-outlook style="width:100%;background:#0078d4;color:#fff;border:0;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer">Open Outlook → paste body → send</button><div style="font-size:11px;color:#aaa;margin-top:10px;text-align:center">PDF also opens separately</div></div>`;
  const message = status.querySelector("[data-message]");
  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(body);
      message.textContent = "✅ Quote body copied — open Outlook and paste it into the email body";
      message.style.cssText += ";background:#f0fdf4;border-color:#86efac;color:#14532d";
    } catch {
      const textarea = status.querySelector("textarea");
      textarea.style.display = "block";
      textarea.select();
      message.textContent = "⚠️ Clipboard blocked — copy the selected quote body below";
    }
  };
  status.querySelector("[data-close]").onclick = () => status.remove();
  status.querySelector("[data-copy]").onclick = copyBody;
  status.querySelector("[data-outlook]").onclick = () => { openEmail(); status.remove(); };
  status.onclick = event => { if (event.target === status) status.remove(); };
  document.body.appendChild(status);
  copyBody();
  setTimeout(() => printCoreQuote(quote, client, logo, printWindow), 400);
}
