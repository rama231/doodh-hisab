/* ── Doodh Hisab — app logic ──────────────────────────────
   Data: localStorage only (koi server nahi).
   Record shape: { id, date:'YYYY-MM-DD', shift:'morning'|'evening',
                   qty:Number, rate:Number, fat:Number|null, note:String }
──────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const KEY = "doodh_hisab_v1";
  const $ = (id) => document.getElementById(id);

  const els = {
    stats: { liters: $("stat-liters"), amount: $("stat-amount"), days: $("stat-days"), avg: $("stat-avg"),
             today: $("stat-today"), todayAmt: $("stat-today-amt"), total: $("stat-total"), range: $("stat-range") },
    form: $("entry-form"), fDate: $("f-date"), fQty: $("f-qty"), fRate: $("f-rate"),
    fFat: $("f-fat"), fNote: $("f-note"), preview: $("preview-amount"),
    formTitle: $("form-title"), formMode: $("form-mode"), btnSave: $("btn-save"), btnCancel: $("btn-cancel"),
    segMorning: $("seg-morning"), segEvening: $("seg-evening"),
    chart: $("chart"), chartTotal: $("chart-total"),
    monthSel: $("f-month"), shiftSel: $("f-shift"),
    tbody: $("records-body"), tfoot: $("records-foot"), empty: $("empty-state"),
    toast: $("toast"), footUpdated: $("foot-updated"),
    dialog: $("settings-dialog"), sMorning: $("s-morning"), sEvening: $("s-evening"), sOwner: $("s-owner"),
  };

  /* ── state ─────────────────────────────────────────── */
  let state = { records: [], settings: { morningRate: null, eveningRate: null, owner: "" } };
  let editingId = null;
  let shift = "morning";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.records)) {
          state.records = parsed.records.filter(isValidRecord).map(normalize);
          state.settings = Object.assign(state.settings, parsed.settings || {});
        }
      }
    } catch (e) {
      console.warn("load failed", e);
      toast("Data padhne me dikkat — purana data safe nahi mila", true);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ records: state.records, settings: state.settings }));
      els.footUpdated.textContent = "Saved " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      toast("Save fail — browser storage full ho sakta hai", true);
    }
  }

  function isValidRecord(r) {
    return r && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
           (r.shift === "morning" || r.shift === "evening");
  }

  function normalize(r) {
    return {
      id: r.id || uid(),
      date: r.date,
      shift: r.shift,
      qty: num(r.qty),
      rate: num(r.rate),
      fat: r.fat === null || r.fat === undefined || r.fat === "" ? null : num(r.fat),
      note: typeof r.note === "string" ? r.note : "",
    };
  }

  /* ── helpers ───────────────────────────────────────── */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const amountOf = (rec) => r2(rec.qty * rec.rate);
  const fmtL = (n) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(r2(n));
  const fmtMoney = (n) => "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r2(n));
  const fmtRate = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(r2(n));

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  const monthOf = (iso) => iso.slice(0, 7);
  const shiftLabel = (s) => (s === "morning" ? "Subah" : "Shaam");
  const shiftIcon = (s) => (s === "morning" ? "🌅" : "🌙");

  function prettyDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = dt.toLocaleDateString("en-IN", { weekday: "short" });
    return { main: String(d).padStart(2, "0") + " " + dt.toLocaleDateString("en-IN", { month: "short" }) + " " + y, sub: wd };
  }

  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }

  let toastTimer;
  function toast(msg, isErr) {
    els.toast.textContent = msg;
    els.toast.classList.toggle("err", !!isErr);
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  /* ── filtering ─────────────────────────────────────── */
  function filtered() {
    const month = els.monthSel.value || "all";
    const sh = els.shiftSel.value || "all";
    return state.records
      .filter((r) => (month === "all" ? true : monthOf(r.date) === month))
      .filter((r) => (sh === "all" ? true : r.shift === sh))
      .sort((a, b) => (a.date === b.date ? (a.shift === "morning" ? -1 : 1) : a.date < b.date ? 1 : -1));
  }

  /* ── rendering ─────────────────────────────────────── */
  function render(wantMonth) {
    renderStats();
    renderMonthOptions(wantMonth);
    renderTable();
    renderChart();
    els.footUpdated.textContent = state.records.length ? "Data aapke browser me save hai" : "Abhi koi data nahi";
  }

  function renderStats() {
    const today = todayISO();
    const thisMonth = monthOf(today);
    const monthRecs = state.records.filter((r) => monthOf(r.date) === thisMonth);
    const liters = monthRecs.reduce((s, r) => s + r.qty, 0);
    const amt = monthRecs.reduce((s, r) => s + amountOf(r), 0);
    const days = new Set(monthRecs.map((r) => r.date)).size;

    els.stats.liters.innerHTML = fmtL(liters) + " <small>L</small>";
    els.stats.amount.textContent = fmtMoney(amt);
    els.stats.days.textContent = days + " din · " + monthLabel(thisMonth).split(" ")[0];
    els.stats.avg.textContent = liters > 0 ? "avg " + fmtRate(amt / liters) + " / L" : "avg ₹0 / L";

    const tRecs = state.records.filter((r) => r.date === today);
    if (tRecs.length) {
      const tL = tRecs.reduce((s, r) => s + r.qty, 0);
      els.stats.today.innerHTML = fmtL(tL) + " <small>L</small>";
      els.stats.todayAmt.textContent = fmtMoney(tRecs.reduce((s, r) => s + amountOf(r), 0)) + " · " + tRecs.length + " shift";
    } else {
      els.stats.today.textContent = "—";
      els.stats.todayAmt.textContent = "aaj ki entry baaki";
    }

    els.stats.total.textContent = state.records.length;
    if (state.records.length) {
      const dates = state.records.map((r) => r.date).sort();
      els.stats.range.textContent = prettyDate(dates[0]).main + " se";
    } else {
      els.stats.range.textContent = "—";
    }
  }

  function renderMonthOptions(want) {
    const months = [...new Set(state.records.map((r) => monthOf(r.date)))].sort().reverse();
    const current = want || els.monthSel.value;
    els.monthSel.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "Sab mahine";
    els.monthSel.appendChild(all);
    months.forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = monthLabel(m);
      els.monthSel.appendChild(o);
    });
    if (current && (current === "all" || months.includes(current))) {
      els.monthSel.value = current;
    } else {
      els.monthSel.value = months.includes(monthOf(todayISO())) ? monthOf(todayISO()) : "all";
    }
  }

  function renderTable() {
    const rows = filtered();
    els.tbody.innerHTML = "";
    els.empty.hidden = rows.length > 0;
    document.getElementById("records-table").hidden = rows.length === 0;

    const frag = document.createDocumentFragment();
    rows.forEach((r) => {
      const pd = prettyDate(r.date);
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="date-cell">' + pd.main + "<small>" + pd.sub + "</small></td>" +
        '<td><span class="shift-tag ' + (r.shift === "evening" ? "evening" : "") + '">' +
          shiftIcon(r.shift) + " " + shiftLabel(r.shift) + "</span></td>" +
        '<td class="num">' + fmtL(r.qty) + "</td>" +
        '<td class="num">' + fmtRate(r.rate) + "</td>" +
        '<td class="num amt">' + fmtMoney(amountOf(r)) + "</td>" +
        '<td class="act"><div class="row-btns">' +
          '<button class="icon-btn" data-edit="' + r.id + '" title="Edit" aria-label="Edit">✏️</button>' +
          '<button class="icon-btn del" data-del="' + r.id + '" title="Delete" aria-label="Delete">🗑️</button>' +
        "</div></td>";
      if (r.note || r.fat !== null) {
        tr.title = [r.note, r.fat !== null ? "Fat: " + r.fat : ""].filter(Boolean).join(" · ");
      }
      frag.appendChild(tr);
    });
    els.tbody.appendChild(frag);

    const tl = rows.reduce((s, r) => s + r.qty, 0);
    const ta = rows.reduce((s, r) => s + amountOf(r), 0);
    els.tfoot.innerHTML = rows.length
      ? "<tr><td>Total</td><td>" + rows.length + " entry</td><td class='num'>" + fmtL(tl) +
        "</td><td class='num'><span class='avg-note'>avg</span> " + (tl > 0 ? fmtRate(ta / tl) : "₹0") +
        "</td><td class='num'>" + fmtMoney(ta) + "</td><td></td></tr>"
      : "";
  }

  function renderChart() {
    const days = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const qty = state.records.filter((r) => r.date === iso).reduce((s, r) => s + r.qty, 0);
      days.push({ iso, qty, label: String(d.getDate()) });
    }
    const max = Math.max(...days.map((d) => d.qty), 1);
    els.chart.innerHTML = "";
    days.forEach((d) => {
      const col = document.createElement("div");
      col.className = "bar-col";
      col.title = prettyDate(d.iso).main + " — " + fmtL(d.qty) + " L";
      const h = d.qty > 0 ? Math.max(8, Math.round((d.qty / max) * 82)) : 5;
      col.innerHTML =
        '<span class="bar-val">' + (d.qty > 0 ? fmtL(d.qty) : "") + "</span>" +
        '<div class="bar' + (d.qty > 0 ? "" : " zero") + '" style="height:' + h + 'px"></div>' +
        '<span class="bar-day">' + d.label + "</span>";
      els.chart.appendChild(col);
    });
    els.chartTotal.textContent = fmtL(days.reduce((s, d) => s + d.qty, 0)) + " L / 14 din";
  }

  /* ── form ──────────────────────────────────────────── */
  function setShift(s) {
    shift = s === "evening" ? "evening" : "morning";
    els.segMorning.classList.toggle("active", shift === "morning");
    els.segEvening.classList.toggle("active", shift === "evening");
    els.segMorning.setAttribute("aria-pressed", shift === "morning");
    els.segEvening.setAttribute("aria-pressed", shift === "evening");
    if (!editingId) applyDefaultRate();
  }

  function applyDefaultRate() {
    const r = shift === "morning" ? state.settings.morningRate : state.settings.eveningRate;
    els.fRate.value = r === null || r === undefined || !isFinite(r) ? "" : r;
    updatePreview();
  }

  function updatePreview() {
    const q = num(els.fQty.value);
    const rt = num(els.fRate.value);
    els.preview.textContent = fmtMoney(q * rt);
  }

  function resetForm() {
    editingId = null;
    els.formTitle.textContent = "Naya entry";
    els.formMode.textContent = "Add";
    els.btnSave.textContent = "Save entry";
    els.btnCancel.hidden = true;
    els.fDate.value = todayISO();
    els.fQty.value = "";
    els.fFat.value = "";
    els.fNote.value = "";
    setShift(guessShift());
    applyDefaultRate();
    updatePreview();
    [els.fQty, els.fRate].forEach((i) => i.classList.remove("invalid"));
  }

  // subah ke baad shaam default, warna subah
  function guessShift() {
    const h = new Date().getHours();
    return h >= 14 ? "evening" : "morning";
  }

  function startEdit(id) {
    const rec = state.records.find((r) => r.id === id);
    if (!rec) return;
    editingId = id;
    els.formTitle.textContent = "Entry edit karein";
    els.formMode.textContent = "Edit";
    els.btnSave.textContent = "Update entry";
    els.btnCancel.hidden = false;
    els.fDate.value = rec.date;
    els.fQty.value = rec.qty;
    els.fRate.value = rec.rate;
    els.fFat.value = rec.fat === null ? "" : rec.fat;
    els.fNote.value = rec.note || "";
    setShift(rec.shift);
    els.fRate.value = rec.rate;
    updatePreview();
    document.getElementById("entry-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    els.fQty.focus({ preventScroll: true });
  }

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = els.fDate.value;
    const qty = num(els.fQty.value);
    const rate = num(els.fRate.value);

    els.fQty.classList.toggle("invalid", !(qty > 0));
    els.fRate.classList.toggle("invalid", !(rate >= 0 && els.fRate.value !== ""));
    els.fDate.classList.toggle("invalid", !date);

    if (!date) return toast("Date select karein", true);
    if (!(qty > 0)) return toast("Doodh ki quantity daalein", true);
    if (els.fRate.value === "" || rate < 0) return toast("Rate daalein (0 se zyada)", true);

    const payload = {
      date,
      shift,
      qty: r2(qty),
      rate: r2(rate),
      fat: els.fFat.value === "" ? null : r2(num(els.fFat.value)),
      note: els.fNote.value.trim(),
    };

    // duplicate check (same date + shift) — edit mode me skip
    const dup = state.records.find((r) => r.date === date && r.shift === shift && r.id !== editingId);

    if (editingId) {
      const i = state.records.findIndex((r) => r.id === editingId);
      state.records[i] = Object.assign({ id: editingId }, payload);
      toast("Entry update ho gayi");
    } else if (dup) {
      const ok = await askConfirm(
        prettyDate(date).main + " ki " + shiftLabel(shift) + " entry pehle se hai (" + fmtL(dup.qty) + " L).\nUnse replace karein?",
        "Replace karein"
      );
      if (!ok) return;
      state.records[state.records.indexOf(dup)] = Object.assign({ id: dup.id }, payload);
      toast("Purani entry replace ho gayi");
    } else {
      state.records.push(Object.assign({ id: uid() }, payload));
      toast("Entry save ho gayi ✓");
    }

    // last used rate ko default bana do
    if (shift === "morning") state.settings.morningRate = r2(rate);
    else state.settings.eveningRate = r2(rate);

    save();
    const savedMonth = monthOf(payload.date);
    resetForm();
    render(savedMonth);
  });

  els.segMorning.addEventListener("click", () => setShift("morning"));
  els.segEvening.addEventListener("click", () => setShift("evening"));
  els.fQty.addEventListener("input", updatePreview);
  els.fRate.addEventListener("input", updatePreview);
  els.btnCancel.addEventListener("click", () => { resetForm(); toast("Edit cancel"); });

  /* ── table actions ─────────────────────────────────── */
  els.tbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    if (editBtn) startEdit(editBtn.dataset.edit);
    if (delBtn) {
      const rec = state.records.find((r) => r.id === delBtn.dataset.del);
      if (!rec) return;
      const ok = await askConfirm(
        prettyDate(rec.date).main + " · " + shiftLabel(rec.shift) + " · " + fmtL(rec.qty) + " L · " + fmtMoney(amountOf(rec)) +
        "\n\nYe entry delete karein?",
        "Delete karein", true
      );
      if (ok) {
        state.records = state.records.filter((r) => r.id !== rec.id);
        save();
        render();
        toast("Entry delete ho gayi");
      }
    }
  });

  els.monthSel.addEventListener("change", renderTable);
  els.shiftSel.addEventListener("change", renderTable);

  /* ── settings ──────────────────────────────────────── */
  $("btn-settings").addEventListener("click", () => {
    els.sMorning.value = state.settings.morningRate ?? "";
    els.sEvening.value = state.settings.eveningRate ?? "";
    els.sOwner.value = state.settings.owner || "";
    els.dialog.showModal();
  });

  els.dialog.addEventListener("close", () => {
    if (els.dialog.returnValue !== "save") return;
    state.settings.morningRate = els.sMorning.value === "" ? null : r2(num(els.sMorning.value));
    state.settings.eveningRate = els.sEvening.value === "" ? null : r2(num(els.sEvening.value));
    state.settings.owner = els.sOwner.value.trim();
    save();
    if (!editingId) applyDefaultRate();
    toast("Rate setting save ho gayi");
  });

  /* ── confirm dialog ───────────────────────────────── */
  let confirmDone = null;
  function askConfirm(message, okLabel, danger) {
    return new Promise((resolve) => {
      const dlg = document.getElementById("confirm-dialog");
      const yes = document.getElementById("confirm-yes");
      const no = document.getElementById("confirm-no");
      document.getElementById("confirm-msg").textContent = message;
      yes.textContent = okLabel || "OK";
      yes.className = "btn " + (danger ? "danger-solid" : "primary");

      const finish = (val) => {
        yes.removeEventListener("click", onYes);
        no.removeEventListener("click", onNo);
        dlg.removeEventListener("cancel", onCancel);
        if (dlg.open) dlg.close();
        confirmDone = null;
        resolve(val);
      };
      const onYes = () => finish(true);
      const onNo = () => finish(false);
      const onCancel = (ev) => { ev.preventDefault(); finish(false); };

      if (confirmDone) confirmDone(false);
      confirmDone = finish;
      yes.addEventListener("click", onYes);
      no.addEventListener("click", onNo);
      dlg.addEventListener("cancel", onCancel);
      dlg.showModal();
    });
  }

  /* ── export / backup ───────────────────────────────── */
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  $("btn-csv").addEventListener("click", () => {
    const rows = filtered();
    if (!rows.length) return toast("Export ke liye koi record nahi", true);
    const head = ["Date", "Shift", "Liter", "Rate", "Amount", "Fat", "Note"];
    const body = rows
      .slice()
      .reverse()
      .map((r) => [r.date, shiftLabel(r.shift), r2(r.qty), r2(r.rate), amountOf(r), r.fat === null ? "" : r.fat,
        '"' + (r.note || "").replace(/"/g, '""') + '"'].join(","));
    const tl = rows.reduce((s, r) => s + r.qty, 0);
    const ta = rows.reduce((s, r) => s + amountOf(r), 0);
    body.push(["", "TOTAL", r2(tl), "", r2(ta), "", ""].join(","));
    const label = els.monthSel.value === "all" ? "all" : els.monthSel.value;
    download("doodh-hisab-" + label + ".csv", "\uFEFF" + [head.join(","), ...body].join("\r\n"), "text/csv;charset=utf-8");
    toast("CSV download ho gayi");
  });

  $("btn-backup").addEventListener("click", () => {
    if (!state.records.length) return toast("Backup ke liye data nahi", true);
    const data = { app: "doodh-hisab", version: 1, exportedAt: new Date().toISOString(), settings: state.settings, records: state.records };
    download("doodh-hisab-backup-" + todayISO() + ".json", JSON.stringify(data, null, 2), "application/json");
    toast("Backup file ban gayi");
  });

  $("btn-restore").addEventListener("click", () => $("file-restore").click());
  $("file-restore").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const recs = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(recs)) throw new Error("format");
        const clean = recs.filter(isValidRecord).map(normalize);
        if (!clean.length) throw new Error("empty");
        const ok = await askConfirm(clean.length + " record mile. Purana data replace karein?", "Replace karein");
        if (!ok) return;
        state.records = clean;
        if (!Array.isArray(data) && data.settings) state.settings = Object.assign(state.settings, data.settings);
        save();
        render();
        toast(clean.length + " record restore ho gaye");
      } catch (err) {
        toast("File sahi backup JSON nahi hai", true);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  $("btn-clear").addEventListener("click", async () => {
    if (!state.records.length) return toast("Data pehle se khali hai", true);
    const ok = await askConfirm(
      "Sara data (" + state.records.length + " record) hamesha ke liye delete ho jayega.\nYe wapas nahi aayega — pehle backup le lein.",
      "Sab delete karein", true
    );
    if (!ok) return;
    state.records = [];
    save();
    render();
    toast("Sara data delete ho gaya");
  });

  $("btn-print").addEventListener("click", () => window.print());

  /* ── init ──────────────────────────────────────────── */
  load();
  resetForm();
  render();

  // dusre tab me change ho to sync
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { load(); render(); }
  });

  // PWA (offline)
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
