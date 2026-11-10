/* ── csv-import ─────────────────────────────────────────────
   CSV parser + row mapper for Doodh Hisab import.
   Dependency-free. Works on our own export and on hand-made sheets.

   API:
     CsvImport.parse(text)      -> string[][]            (handles quotes, BOM, CRLF, , or ;)
     CsvImport.toRecords(rows)  -> { records, errors, duplicates, missing, headerless }
     CsvImport.read(text)       -> parse + toRecords in one call
──────────────────────────────────────────────────────────── */
(function (root) {
  "use strict";

  var EXACT = {
    date: ["date", "din", "tarikh", "dt", "day", "dateofentry"],
    shift: ["shift", "time", "samay", "session", "subahshaam"],
    qty: ["liter", "litre", "liters", "litres", "ltr", "l", "qty", "quantity", "volume", "doodh", "milk", "milkqty"],
    rate: ["rate", "price", "bhav", "bhaav", "dar", "rateliter", "rateperliter", "perliter"],
    fat: ["fat", "fatpercent"],
    note: ["note", "notes", "remark", "remarks", "comment", "comments", "details", "vivran"],
  };

  var LOOSE = [
    ["date", /date|tarikh|din/],
    ["shift", /shift|samay/],
    ["rate", /rate|price|bhav|bhaav|dar/],
    ["qty", /litre|liter|ltr|qty|quantity|doodh|milk|volume/],
    ["fat", /fat/],
    ["note", /note|remark|comment|details/],
  ];

  var norm = function (s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F]/g, "");
  };

  function detectDelim(line) {
    var comma = 0, semi = 0, inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === ",") comma++;
      else if (!inQ && ch === ";") semi++;
    }
    return semi > comma ? ";" : ",";
  }

  function parse(text, delim) {
    if (typeof text !== "string") text = "";
    text = text.replace(/^\uFEFF/, "");
    var d = delim || detectDelim(String(text).split(/\r?\n/)[0] || "");
    var rows = [], row = [], field = "", inQ = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === d) {
        row.push(field); field = "";
      } else if (ch === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }

    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });
  }

  function numOf(v) {
    var s = String(v == null ? "" : v).replace(/[^0-9.\-]/g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function iso(y, m, d) {
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseDate(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return null;
    var m;

    // 2026-11-10 or 2026/11/10
    if ((m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);

    // 10/11/2026, 10-11-26, 10.11.2026  (dd/mm/yyyy — India)
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) {
      var y = +m[3];
      if (y < 100) y += y < 70 ? 2000 : 1900;
      return iso(y, +m[2], +m[1]);
    }

    // Excel serial date (e.g. 46000)
    if ((m = s.match(/^\d{5}(\.\d+)?$/))) {
      var n = parseFloat(s);
      if (n > 20000 && n < 80000) {
        var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
        return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      }
    }

    // "10 Nov 2026", "Nov 10, 2026"
    var p = new Date(s);
    if (!isNaN(p.getTime())) return iso(p.getFullYear(), p.getMonth() + 1, p.getDate());

    return null;
  }

  function parseShift(v) {
    var t = norm(v);
    if (!t) return "morning";
    if (/shaam|sham|even|pm|night|raat|dopahar|afternoon/.test(t)) return "evening";
    return "morning";
  }

  function detectColumns(header) {
    var cols = {}, used = {};
    var i, k, j;

    for (i = 0; i < header.length; i++) {
      var h = norm(header[i]);
      if (!h) continue;
      for (k in EXACT) {
        if (used[k]) continue;
        if (EXACT[k].indexOf(h) >= 0) { cols[k] = i; used[k] = true; break; }
      }
    }

    for (i = 0; i < header.length; i++) {
      var raw = norm(header[i]);
      if (!raw) continue;
      var taken = Object.keys(cols).some(function (kk) { return cols[kk] === i; });
      if (taken) continue;
      for (j = 0; j < LOOSE.length; j++) {
        var key = LOOSE[j][0];
        if (used[key]) continue;
        if (LOOSE[j][1].test(raw)) { cols[key] = i; used[key] = true; break; }
      }
    }
    return cols;
  }

  function toRecords(rows) {
    var out = { records: [], errors: [], duplicates: 0, missing: [], headerless: false, columns: {} };
    if (!rows || !rows.length) {
      out.errors.push({ row: 0, reason: "file khali hai" });
      return out;
    }

    var cols = detectColumns(rows[0]);
    var start = 1;

    // header row nahi mila? pehli row hi data ho sakti hai
    if (!("date" in cols)) {
      var firstLooksData = parseDate(rows[0][0]) && isFinite(numOf(rows[0][2]));
      if (firstLooksData && rows[0].length >= 3) {
        cols = { date: 0, shift: 1, qty: 2, rate: 3 };
        start = 0;
        out.headerless = true;
      }
    }

    out.columns = cols;
    ["date", "qty", "rate"].forEach(function (k) {
      if (!(k in cols)) out.missing.push(k);
    });
    if (out.missing.length) return out;

    var seen = {};

    for (var i = start; i < rows.length; i++) {
      var r = rows[i];
      var rowNo = i + 1;
      var cell = function (k) { return k in cols ? String(r[cols[k]] == null ? "" : r[cols[k]]).trim() : ""; };

      var date = parseDate(cell("date"));
      if (!date) {
        out.errors.push({ row: rowNo, reason: "date samajh nahi aayi" + (cell("date") ? " (" + cell("date") + ")" : "") });
        continue;
      }

      var qty = numOf(cell("qty"));
      if (!(qty > 0)) {
        out.errors.push({ row: rowNo, reason: "liter galat/missing" });
        continue;
      }

      var rate = numOf(cell("rate"));
      if (!(rate >= 0) || isNaN(rate)) {
        out.errors.push({ row: rowNo, reason: "rate galat/missing" });
        continue;
      }

      var fat = "fat" in cols ? numOf(cell("fat")) : NaN;
      var shift = "shift" in cols ? parseShift(cell("shift")) : "morning";
      var key = date + "|" + shift;

      var rec = {
        date: date,
        shift: shift,
        qty: r2(qty),
        rate: r2(rate),
        fat: isFinite(fat) && fat > 0 ? r2(fat) : null,
        note: "note" in cols ? cell("note").slice(0, 80) : "",
      };

      if (seen[key] !== undefined) {
        out.records[seen[key]] = rec; // same date+shift -> aakhri row jeetegi
        out.duplicates++;
      } else {
        seen[key] = out.records.length;
        out.records.push(rec);
      }
    }

    out.records.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  function read(text) { return toRecords(parse(text)); }

  root.CsvImport = { parse: parse, toRecords: toRecords, read: read, detectColumns: detectColumns };
})(typeof window !== "undefined" ? window : globalThis);
