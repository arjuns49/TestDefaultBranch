/* Gift Card Business Dashboard
   Pulls the three deal-log tabs directly from the source Google Sheet (client-side,
   no backend) via the gviz CSV export endpoint, and renders KPIs / charts / tables.
   Requires the sheet to be shared as "Anyone with the link can view". */

const SHEET_ID = "1dQi97dBCjbXuEac-89PCh0y3Xj8DH2G6skvmzLqoCMA";
const SITE_TABS = [
  { tab: "Aligned Incentives", site: "Aligned Incentives", badge: "ai" },
  { tab: "TCB", site: "TheCardBay", badge: "tcb" },
  { tab: "QCGC", site: "QCGC", badge: "qcgc" },
];
const CACHE_KEY = "gc_dashboard_cache_v2";

document.getElementById("sheetLink").href = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

let ALL_DEALS = [];
let brandSort = { key: "totalProfit", dir: -1 };

// ---------- parsing helpers ----------
function num(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (s === "") return null;
  s = s.replace(/\\/g, "").replace(/[$,]/g, "");
  const pct = s.endsWith("%");
  if (pct) s = s.slice(0, -1);
  let n = parseFloat(s);
  if (isNaN(n)) return null;
  if (pct) n = n / 100;
  return n;
}
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}
function money(n, opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts });
}
function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}
function isPaid(status) {
  return String(status || "").trim().toLowerCase() === "paid";
}
function monthKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// ---------- fetch + normalize ----------
async function fetchTab(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load tab "${tabName}" (HTTP ${res.status}). Make sure the sheet is shared as "Anyone with the link can view".`);
  const text = await res.text();
  if (text.trim().startsWith("<")) throw new Error(`Tab "${tabName}" is not accessible. Make sure the sheet is shared as "Anyone with the link can view".`);
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
}

function normalizeTab(rows, siteInfo) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h) => String(h || "").trim());
  const idx = (name) => header.indexOf(name);
  const col = {
    date: idx("Date"),
    subDeadline: idx("Submission Deadline"),
    brand: idx("Brand"),
    denom: idx("Denom"),
    buyRate: idx("BuyRate"),
    buyPrice: idx("BuyPrice"),
    siteBoughtFrom: idx("Site Bought From"),
    cardUsed: idx("Card Used"),
    costPrice: idx("Actual Cost Price"),
    profit: idx("Actual Profit"),
    toBePaidTo: idx("To be Paid to"),
    paymentETA: idx("Payment ETA"),
    status: idx("Status"),
    profitForTaxes: idx("Profit for Taxes"),
  };
  const deals = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const brand = col.brand >= 0 ? String(r[col.brand] || "").trim() : "";
    const date = col.date >= 0 ? parseDate(r[col.date]) : null;
    const buyPrice = col.buyPrice >= 0 ? num(r[col.buyPrice]) : null;
    if (!brand && buyPrice === null) continue; // skip blank/footer rows
    const denom = col.denom >= 0 ? num(r[col.denom]) : null;
    const profit = col.profit >= 0 ? num(r[col.profit]) : null;
    const faceMargin = denom !== null && buyPrice !== null ? denom - buyPrice : null;
    const totalProfit = (faceMargin || 0) + (profit || 0);
    deals.push({
      site: siteInfo.site,
      badge: siteInfo.badge,
      date,
      submissionDeadline: col.subDeadline >= 0 ? parseDate(r[col.subDeadline]) : null,
      brand: brand || "(unlabeled)",
      denom,
      buyRate: col.buyRate >= 0 ? num(r[col.buyRate]) : null,
      buyPrice,
      siteBoughtFrom: col.siteBoughtFrom >= 0 ? String(r[col.siteBoughtFrom] || "").trim() : "",
      cardUsed: col.cardUsed >= 0 ? String(r[col.cardUsed] || "").trim() : "",
      costPrice: col.costPrice >= 0 ? num(r[col.costPrice]) : null,
      profit,
      faceMargin,
      totalProfit,
      toBePaidTo: col.toBePaidTo >= 0 ? String(r[col.toBePaidTo] || "").trim() : "",
      paymentETA: col.paymentETA >= 0 ? parseDate(r[col.paymentETA]) : null,
      status: col.status >= 0 ? String(r[col.status] || "").trim() : "",
      profitForTaxes: col.profitForTaxes >= 0 ? num(r[col.profitForTaxes]) : null,
    });
  }
  return deals;
}

// ---------- load ----------
async function loadAll(forceNetwork) {
  const btn = document.getElementById("refreshBtn");
  const statusEl = document.getElementById("status");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⟳</span> Syncing…';
  statusEl.className = "";
  statusEl.textContent = "";

  try {
    const results = await Promise.all(SITE_TABS.map((t) => fetchTab(t.tab)));
    let deals = [];
    results.forEach((rows, i) => (deals = deals.concat(normalizeTab(rows, SITE_TABS[i]))));
    ALL_DEALS = deals;
    saveCache();
    document.getElementById("lastSync").textContent = "Last synced: " + new Date().toLocaleString();
    statusEl.textContent = `Loaded ${deals.length} deals across ${SITE_TABS.length} sites.`;
    populateYearFilter();
    renderAll();
  } catch (err) {
    console.error(err);
    const usedCache = loadCache();
    statusEl.className = "err";
    statusEl.textContent = "⚠ " + err.message + (usedCache ? " Showing last cached data." : " No cached data available.");
    if (usedCache) {
      populateYearFilter();
      renderAll();
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = "⟳ Refresh data";
  }
}

function saveCache() {
  try {
    const serial = ALL_DEALS.map((d) => ({
      ...d,
      date: d.date ? d.date.toISOString() : null,
      submissionDeadline: d.submissionDeadline ? d.submissionDeadline.toISOString() : null,
      paymentETA: d.paymentETA ? d.paymentETA.toISOString() : null,
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ deals: serial, syncedAt: new Date().toISOString() }));
  } catch (e) { /* storage full or unavailable, ignore */ }
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    ALL_DEALS = parsed.deals.map((d) => ({
      ...d,
      date: d.date ? new Date(d.date) : null,
      submissionDeadline: d.submissionDeadline ? new Date(d.submissionDeadline) : null,
      paymentETA: d.paymentETA ? new Date(d.paymentETA) : null,
    }));
    document.getElementById("lastSync").textContent = "Last synced: " + new Date(parsed.syncedAt).toLocaleString() + " (cached)";
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- filters ----------
function populateYearFilter() {
  const sel = document.getElementById("yearFilter");
  const current = sel.value;
  const years = Array.from(new Set(ALL_DEALS.filter((d) => d.date).map((d) => d.date.getFullYear()))).sort((a, b) => b - a);
  sel.innerHTML = '<option value="all">All years</option>' + years.map((y) => `<option value="${y}">${y}</option>`).join("");
  if (years.includes(Number(current))) sel.value = current;
}
function filteredDeals() {
  const site = document.getElementById("siteFilter").value;
  const year = document.getElementById("yearFilter").value;
  return ALL_DEALS.filter((d) => {
    if (site !== "all" && d.site !== site) return false;
    if (year !== "all" && (!d.date || d.date.getFullYear() !== Number(year))) return false;
    return true;
  });
}

// ---------- render orchestration ----------
function renderAll() {
  renderKPIs();
  renderMonthlyChart();
  renderSiteChart();
  renderVolumeChart();
  renderStatusChart();
  renderBrandTable();
  renderCardTable();
  renderCashflow();
  renderCalcBrandList();
  renderLog();
}

document.getElementById("siteFilter").addEventListener("change", renderAll);
document.getElementById("yearFilter").addEventListener("change", renderAll);

document.querySelectorAll("nav.tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
  });
});

// ---------- KPIs ----------
function renderKPIs() {
  const deals = filteredDeals();
  const totalProfit = deals.reduce((s, d) => s + (d.totalProfit || 0), 0);
  const totalBuyPrice = deals.reduce((s, d) => s + (d.buyPrice || 0), 0);
  const avgMargin = totalBuyPrice ? totalProfit / totalBuyPrice : null;
  const pending = deals.filter((d) => !isPaid(d.status));
  const pendingAmt = pending.reduce((s, d) => s + (d.totalProfit || 0), 0);

  const now = new Date();
  const thisKey = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = monthKey(lastMonthDate);
  const thisMonthProfit = deals.filter((d) => d.date && monthKey(d.date) === thisKey).reduce((s, d) => s + (d.totalProfit || 0), 0);
  const lastMonthProfit = deals.filter((d) => d.date && monthKey(d.date) === lastKey).reduce((s, d) => s + (d.totalProfit || 0), 0);
  let deltaHtml = "";
  if (lastMonthProfit) {
    const delta = ((thisMonthProfit - lastMonthProfit) / Math.abs(lastMonthProfit)) * 100;
    deltaHtml = `<div class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% vs last month</div>`;
  }

  const cards = [
    { label: "Total profit", value: money(totalProfit) },
    { label: "Total deals logged", value: deals.length.toLocaleString() },
    { label: "Avg profit margin", value: pct(avgMargin) },
    { label: "This month's profit", value: money(thisMonthProfit), extra: deltaHtml },
    { label: "Pending payout", value: money(pendingAmt), extra: `<div class="sub">${pending.length} deals not yet paid</div>` },
  ];
  document.getElementById("kpiRow").innerHTML = cards
    .map((c) => `<div class="kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div>${c.extra || ""}</div>`)
    .join("");
}

// ---------- charts ----------
const charts = {};
function upsertChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}
const siteColor = { "Aligned Incentives": "#5b8def", "TheCardBay": "#7ee0c0", "QCGC": "#e0a45b" };

function renderMonthlyChart() {
  const deals = filteredDeals().filter((d) => d.date);
  const months = Array.from(new Set(deals.map((d) => monthKey(d.date)))).sort();
  const bySite = {};
  SITE_TABS.forEach((s) => (bySite[s.site] = months.map((m) => deals.filter((d) => d.site === s.site && monthKey(d.date) === m).reduce((sum, d) => sum + (d.totalProfit || 0), 0))));
  upsertChart("monthlyChart", {
    type: "bar",
    data: {
      labels: months.map(monthLabel),
      datasets: SITE_TABS.map((s) => ({ label: s.site, data: bySite[s.site], backgroundColor: siteColor[s.site], stack: "profit" })),
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => "$" + v } } },
    },
  });
}
function renderSiteChart() {
  const deals = filteredDeals();
  const bySite = SITE_TABS.map((s) => deals.filter((d) => d.site === s.site).reduce((sum, d) => sum + (d.totalProfit || 0), 0));
  upsertChart("siteChart", {
    type: "doughnut",
    data: { labels: SITE_TABS.map((s) => s.site), datasets: [{ data: bySite, backgroundColor: SITE_TABS.map((s) => siteColor[s.site]) }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });
}
function renderVolumeChart() {
  const deals = filteredDeals().filter((d) => d.date);
  const months = Array.from(new Set(deals.map((d) => monthKey(d.date)))).sort();
  const bySite = {};
  SITE_TABS.forEach((s) => (bySite[s.site] = months.map((m) => deals.filter((d) => d.site === s.site && monthKey(d.date) === m).length)));
  upsertChart("volumeChart", {
    type: "bar",
    data: { labels: months.map(monthLabel), datasets: SITE_TABS.map((s) => ({ label: s.site, data: bySite[s.site], backgroundColor: siteColor[s.site], stack: "vol" })) },
    options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true } } },
  });
}
function renderStatusChart() {
  const deals = filteredDeals();
  const paid = deals.filter((d) => isPaid(d.status)).length;
  const pending = deals.length - paid;
  upsertChart("statusChart", {
    type: "pie",
    data: { labels: ["Paid", "Pending"], datasets: [{ data: [paid, pending], backgroundColor: ["#3ecf8e", "#e0b23e"] }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });
}

// ---------- brand table ----------
function computeBrandStats(deals) {
  const map = new Map();
  deals.forEach((d) => {
    const key = d.brand;
    if (!map.has(key)) map.set(key, { brand: key, count: 0, faceMargin: 0, rewards: 0, totalProfit: 0, buyPriceSum: 0, buyRateSum: 0, buyRateN: 0, cardProfit: {} });
    const s = map.get(key);
    s.count++;
    s.faceMargin += d.faceMargin || 0;
    s.rewards += d.profit || 0;
    s.totalProfit += d.totalProfit || 0;
    s.buyPriceSum += d.buyPrice || 0;
    if (d.buyRate !== null) { s.buyRateSum += d.buyRate; s.buyRateN++; }
    if (d.cardUsed) s.cardProfit[d.cardUsed] = (s.cardProfit[d.cardUsed] || 0) + (d.totalProfit || 0);
  });
  return Array.from(map.values()).map((s) => ({
    ...s,
    avgBuyRate: s.buyRateN ? s.buyRateSum / s.buyRateN : null,
    avgMargin: s.buyPriceSum ? s.totalProfit / s.buyPriceSum : null,
    bestCard: Object.entries(s.cardProfit).sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
  }));
}
function renderBrandTable() {
  const deals = filteredDeals();
  const search = (document.getElementById("brandSearch").value || "").toLowerCase();
  let rows = computeBrandStats(deals);
  if (search) rows = rows.filter((r) => r.brand.toLowerCase().includes(search));
  rows.sort((a, b) => (a[brandSort.key] - b[brandSort.key]) * brandSort.dir || 0);

  const cols = [
    { key: "brand", label: "Brand" },
    { key: "count", label: "Deals" },
    { key: "faceMargin", label: "Face margin", fmt: money },
    { key: "rewards", label: "Rewards bonus", fmt: money },
    { key: "totalProfit", label: "Total profit", fmt: money },
    { key: "avgBuyRate", label: "Avg buy rate", fmt: (v) => (v === null ? "—" : v.toFixed(3)) },
    { key: "avgMargin", label: "Avg margin %", fmt: pct },
    { key: "bestCard", label: "Best card" },
  ];
  const thead = "<tr>" + cols.map((c) => `<th data-key="${c.key}">${c.label}${brandSort.key === c.key ? (brandSort.dir === 1 ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr>";
  const tbody = rows
    .map(
      (r, i) =>
        `<tr><td><span class="rank">${i + 1}</span>${r.brand}</td><td>${r.count}</td><td class="${r.faceMargin >= 0 ? "pos" : "neg"}">${money(r.faceMargin)}</td><td class="${r.rewards >= 0 ? "pos" : "neg"}">${money(r.rewards)}</td><td class="${r.totalProfit >= 0 ? "pos" : "neg"}">${money(r.totalProfit)}</td><td>${r.avgBuyRate === null ? "—" : r.avgBuyRate.toFixed(3)}</td><td>${pct(r.avgMargin)}</td><td>${r.bestCard}</td></tr>`
    )
    .join("");
  const table = document.getElementById("brandTable");
  table.querySelector("thead").innerHTML = thead;
  table.querySelector("tbody").innerHTML = tbody || `<tr><td colspan="${cols.length}" class="empty">No deals match.</td></tr>`;
  table.querySelectorAll("th").forEach((th) =>
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (brandSort.key === key) brandSort.dir *= -1;
      else { brandSort.key = key; brandSort.dir = -1; }
      renderBrandTable();
    })
  );
}
document.getElementById("brandSearch").addEventListener("input", renderBrandTable);

// ---------- card table ----------
function renderCardTable() {
  const deals = filteredDeals();
  const map = new Map();
  deals.forEach((d) => {
    const key = d.cardUsed || "(unspecified)";
    if (!map.has(key)) map.set(key, { card: key, count: 0, rewards: 0, brands: new Set() });
    const s = map.get(key);
    s.count++;
    s.rewards += d.profit || 0;
    if (d.brand) s.brands.add(d.brand);
  });
  const rows = Array.from(map.values())
    .map((s) => ({ ...s, avgRewards: s.count ? s.rewards / s.count : 0, brandCount: s.brands.size }))
    .sort((a, b) => b.rewards - a.rewards);
  const table = document.getElementById("cardTable");
  table.querySelector("thead").innerHTML = "<tr><th>Card</th><th>Deals</th><th>Total rewards bonus</th><th>Avg bonus / deal</th><th>Distinct brands</th></tr>";
  table.querySelector("tbody").innerHTML =
    rows
      .map(
        (r, i) =>
          `<tr><td><span class="rank">${i + 1}</span>${r.card}</td><td>${r.count}</td><td class="${r.rewards >= 0 ? "pos" : "neg"}">${money(r.rewards)}</td><td>${money(r.avgRewards)}</td><td>${r.brandCount}</td></tr>`
      )
      .join("") || `<tr><td colspan="5" class="empty">No deals match.</td></tr>`;
}

// ---------- cash flow ----------
function renderCashflow() {
  const deals = filteredDeals();
  const pending = deals.filter((d) => !isPaid(d.status));
  const paidWithDates = deals.filter((d) => isPaid(d.status) && d.date && d.paymentETA);
  const avgTurnaround = paidWithDates.length
    ? paidWithDates.reduce((s, d) => s + (d.paymentETA - d.date) / 86400000, 0) / paidWithDates.length
    : null;
  const pendingAmt = pending.reduce((s, d) => s + (d.totalProfit || 0), 0);
  const now = new Date();
  const overdue = pending.filter((d) => d.paymentETA && d.paymentETA < now).length;

  document.getElementById("cashKpis").innerHTML = [
    { label: "Pending payout total", value: money(pendingAmt) },
    { label: "Deals pending", value: pending.length },
    { label: "Overdue (past ETA)", value: overdue },
    { label: "Avg payment turnaround", value: avgTurnaround === null ? "—" : avgTurnaround.toFixed(1) + " days" },
  ]
    .map((c) => `<div class="kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`)
    .join("");

  const rows = pending
    .slice()
    .sort((a, b) => (a.paymentETA || 0) - (b.paymentETA || 0))
    .map(
      (d) =>
        `<tr><td><span class="badge ${d.badge}">${d.site}</span></td><td>${d.date ? d.date.toLocaleDateString() : "—"}</td><td>${d.brand}</td><td>${money(d.totalProfit)}</td><td>${d.toBePaidTo || "—"}</td><td>${d.paymentETA ? d.paymentETA.toLocaleDateString() : "—"}</td><td><span class="badge pending">${d.status || "Pending"}</span></td></tr>`
    )
    .join("");
  const table = document.getElementById("pendingTable");
  table.querySelector("thead").innerHTML = "<tr><th>Site</th><th>Date</th><th>Brand</th><th>Profit</th><th>Paid to</th><th>Payment ETA</th><th>Status</th></tr>";
  table.querySelector("tbody").innerHTML = rows || `<tr><td colspan="7" class="empty">Nothing pending — everything's paid out.</td></tr>`;
}

// ---------- calculator ----------
function renderCalcBrandList() {
  const brands = Array.from(new Set(ALL_DEALS.map((d) => d.brand))).sort();
  document.getElementById("brandList").innerHTML = brands.map((b) => `<option value="${b}">`).join("");
}
function runCalculator() {
  const brand = document.getElementById("c_brand").value.trim();
  const denom = num(document.getElementById("c_denom").value);
  const buyPrice = num(document.getElementById("c_buyprice").value);
  const rewardsPct = num(document.getElementById("c_rewards").value) || 0;

  const rateEl = document.getElementById("r_rate");
  const rateNote = document.getElementById("r_rateNote");
  const profitEl = document.getElementById("r_profit");
  const verdictEl = document.getElementById("r_verdict");
  const histEl = document.getElementById("c_history");

  if (denom === null || buyPrice === null || denom <= 0) {
    rateEl.textContent = "—";
    profitEl.textContent = "—";
    verdictEl.innerHTML = "";
    rateNote.textContent = "enter denomination and buy price";
    return;
  }
  const buyRate = buyPrice / denom;
  const faceMargin = denom - buyPrice;
  const rewardsBonus = buyPrice * (rewardsPct / 100);
  const totalProfit = faceMargin + rewardsBonus;
  const marginPct = totalProfit / denom;

  rateEl.textContent = buyRate.toFixed(3);
  rateNote.textContent = `${money(buyPrice)} for $${denom} face value`;
  profitEl.textContent = money(totalProfit);

  const history = ALL_DEALS.filter((d) => brand && d.brand.toLowerCase() === brand.toLowerCase());
  let verdictClass = "v-avg", verdictText = "No history for this brand yet — using general thresholds.";
  if (history.length) {
    const avgMargin = history.reduce((s, d) => s + (d.totalProfit || 0), 0) / history.reduce((s, d) => s + (d.buyPrice || 0), 0) || 0;
    const ratio = avgMargin ? marginPct / (history.reduce((s, d) => s + (d.totalProfit || 0), 0) / history.reduce((s, d) => s + (d.denom || 1), 0)) : 1;
    const histMarginPct = history.reduce((s, d) => s + (d.totalProfit || 0), 0) / history.reduce((s, d) => s + (d.denom || 1), 0);
    const r = histMarginPct ? marginPct / histMarginPct : 1;
    if (r >= 1.15) { verdictClass = "v-great"; verdictText = `Better than your ${history.length}-deal average for ${brand} — prioritize this.`; }
    else if (r >= 0.95) { verdictClass = "v-good"; verdictText = `In line with your ${history.length}-deal average for ${brand} — solid, worth taking.`; }
    else if (r >= 0.75) { verdictClass = "v-avg"; verdictText = `Below your usual margin on ${brand} — okay if inventory's light, otherwise skip for a better deal.`; }
    else { verdictClass = "v-bad"; verdictText = `Well below your historical margin on ${brand} — consider passing.`; }
    histEl.innerHTML = `<strong>${brand}</strong>: ${history.length} deals logged, avg margin ${pct(histMarginPct)}, avg buy rate ${(
      history.filter((d) => d.buyRate !== null).reduce((s, d) => s + d.buyRate, 0) / (history.filter((d) => d.buyRate !== null).length || 1)
    ).toFixed(3)}, total profit to date ${money(history.reduce((s, d) => s + (d.totalProfit || 0), 0))}.`;
  } else {
    if (buyRate <= 0.8) { verdictClass = "v-great"; verdictText = "Strong buy rate (≤ 0.80) — generally a great deal."; }
    else if (buyRate <= 0.9) { verdictClass = "v-good"; verdictText = "Good buy rate (≤ 0.90)."; }
    else if (buyRate <= 0.95) { verdictClass = "v-avg"; verdictText = "Average buy rate — fine but not exceptional."; }
    else { verdictClass = "v-bad"; verdictText = "Thin buy rate (> 0.95) — margin is tight."; }
    histEl.textContent = brand ? `No prior deals logged for "${brand}" yet.` : "Type a brand name above that you've logged before.";
  }
  verdictEl.innerHTML = `<span class="verdict ${verdictClass}">${verdictText}</span>`;
}
["c_brand", "c_denom", "c_buyprice", "c_rewards"].forEach((id) => document.getElementById(id).addEventListener("input", runCalculator));

// ---------- log ----------
function renderLog() {
  const search = (document.getElementById("logSearch").value || "").toLowerCase();
  let deals = filteredDeals().slice().sort((a, b) => (b.date || 0) - (a.date || 0));
  if (search) deals = deals.filter((d) => [d.brand, d.cardUsed, d.siteBoughtFrom, d.status].join(" ").toLowerCase().includes(search));
  const table = document.getElementById("logTable");
  table.querySelector("thead").innerHTML = "<tr><th>Site</th><th>Date</th><th>Brand</th><th>Denom</th><th>Buy price</th><th>Buy rate</th><th>Total profit</th><th>Card used</th><th>Status</th></tr>";
  table.querySelector("tbody").innerHTML =
    deals
      .slice(0, 500)
      .map(
        (d) =>
          `<tr><td><span class="badge ${d.badge}">${d.site}</span></td><td>${d.date ? d.date.toLocaleDateString() : "—"}</td><td>${d.brand}</td><td>${d.denom === null ? "—" : "$" + d.denom}</td><td>${money(d.buyPrice)}</td><td>${d.buyRate === null ? "—" : d.buyRate.toFixed(3)}</td><td class="${d.totalProfit >= 0 ? "pos" : "neg"}">${money(d.totalProfit)}</td><td>${d.cardUsed || "—"}</td><td><span class="badge ${isPaid(d.status) ? "paid" : "pending"}">${d.status || "—"}</span></td></tr>`
      )
      .join("") || `<tr><td colspan="9" class="empty">No deals match.</td></tr>`;
}
document.getElementById("logSearch").addEventListener("input", renderLog);

// ---------- init ----------
(function init() {
  if (loadCache()) {
    populateYearFilter();
    renderAll();
  }
  loadAll(false);
})();
