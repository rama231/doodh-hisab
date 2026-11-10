/* ── xlsx-lite ─────────────────────────────────────────────
   Minimal .xlsx writer — koi dependency nahi, koi CDN nahi.
   ZIP "stored" (no compression) + inline strings => Excel,
   LibreOffice aur Google Sheets me khulta hai.
   API: XlsxLite.build({ sheets: [{ name, cols, rows, freeze, autoFilter }] }) => Blob
   Cell: { v: string|number, t?: "s"|"n", s?: styleIndex }
   Styles: 0 default · 1 header · 2 number(2dp) · 3 bold text · 4 bold number · 5 date
──────────────────────────────────────────────────────────── */
(function (root) {
  "use strict";

  /* ---------- CRC32 ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------- ZIP (stored) ---------- */
  function zip(files) {
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    var now = new Date();
    var time = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xffff;
    var date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 names
      lv.setUint16(8, 0, true); // stored
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      var cen = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cen.set(nameBytes, 46);

      parts.push(local, data);
      central.push(cen);
      offset += local.length + data.length;
    });

    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [eocd]), {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  /* ---------- XML helpers ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colName(n) {
    var s = "";
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function cellXml(cell, ref) {
    if (cell === null || cell === undefined) return "";
    var empty = cell.v === null || cell.v === undefined || cell.v === "";
    var s = cell.s ? ' s="' + cell.s + '"' : "";
    if (empty) return s ? "<c r=\"" + ref + "\"" + s + "/>" : "";
    var numeric = cell.t === "n" || (cell.t !== "s" && typeof cell.v === "number");
    if (numeric) return "<c r=\"" + ref + "\"" + s + "><v>" + String(cell.v) + "</v></c>";
    return "<c r=\"" + ref + "\"" + s + " t=\"inlineStr\"><is><t xml:space=\"preserve\">" + esc(cell.v) + "</t></is></c>";
  }

  function sheetXml(sheet) {
    var rows = sheet.rows || [];
    var body = rows
      .map(function (row, r) {
        var n = r + 1;
        var cells = (row || []).map(function (cell, c) { return cellXml(cell, colName(c + 1) + n); }).join("");
        return "<row r=\"" + n + "\">" + cells + "</row>";
      })
      .join("");

    var cols = sheet.cols && sheet.cols.length
      ? "<cols>" + sheet.cols.map(function (w, i) {
          return "<col min=\"" + (i + 1) + "\" max=\"" + (i + 1) + "\" width=\"" + w + "\" customWidth=\"1\"/>";
        }).join("") + "</cols>"
      : "";

    var view = sheet.freeze
      ? "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"" + sheet.freeze + "\" topLeftCell=\"A" +
        (sheet.freeze + 1) + "\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>"
      : "<sheetViews><sheetView workbookViewId=\"0\"/></sheetViews>";

    var filter = sheet.autoFilter ? "<autoFilter ref=\"" + sheet.autoFilter + "\"/>" : "";

    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
      view +
      "<sheetFormatPr defaultRowHeight=\"15\"/>" +
      cols +
      "<sheetData>" + body + "</sheetData>" +
      filter +
      "<pageMargins left=\"0.7\" right=\"0.7\" top=\"0.75\" bottom=\"0.75\" header=\"0.3\" footer=\"0.3\"/>" +
      "</worksheet>";
  }

  var STYLES = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
    "<numFmts count=\"2\">" +
    "<numFmt numFmtId=\"164\" formatCode=\"#,##0.00\"/>" +
    "<numFmt numFmtId=\"165\" formatCode=\"dd-mmm-yyyy\"/>" +
    "</numFmts>" +
    "<fonts count=\"3\">" +
    "<font><sz val=\"11\"/><color theme=\"1\"/><name val=\"Calibri\"/></font>" +
    "<font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/></font>" +
    "<font><b/><sz val=\"11\"/><color theme=\"1\"/><name val=\"Calibri\"/></font>" +
    "</fonts>" +
    "<fills count=\"3\">" +
    "<fill><patternFill patternType=\"none\"/></fill>" +
    "<fill><patternFill patternType=\"gray125\"/></fill>" +
    "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF0F5132\"/><bgColor indexed=\"64\"/></patternFill></fill>" +
    "</fills>" +
    "<borders count=\"2\">" +
    "<border><left/><right/><top/><bottom/><diagonal/></border>" +
    "<border><left/><right/><top/><bottom style=\"thin\"><color rgb=\"FFBFBFBF\"/></bottom><diagonal/></border>" +
    "</borders>" +
    "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
    "<cellXfs count=\"6\">" +
    "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>" +
    "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyAlignment=\"1\"><alignment horizontal=\"left\" vertical=\"center\"/></xf>" +
    "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>" +
    "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyBorder=\"1\"/>" +
    "<xf numFmtId=\"164\" fontId=\"2\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyFont=\"1\" applyBorder=\"1\"/>" +
    "<xf numFmtId=\"165\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>" +
    "</cellXfs>" +
    "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>" +
    "</styleSheet>";

  function build(opts) {
    var sheets = (opts && opts.sheets) || [];
    if (!sheets.length) throw new Error("xlsx: at least one sheet required");

    var n = sheets.length;
    var files = [];

    var types = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
      "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
      "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
      "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
      sheets.map(function (s, i) {
        return "<Override PartName=\"/xl/worksheets/sheet" + (i + 1) +
          ".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>";
      }).join("") +
      "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
      "</Types>";

    var rootRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
      "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
      "</Relationships>";

    var workbook = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" " +
      "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
      "<sheets>" +
      sheets.map(function (s, i) {
        return "<sheet name=\"" + esc(s.name || "Sheet" + (i + 1)) + "\" sheetId=\"" + (i + 1) + "\" r:id=\"rId" + (i + 1) + "\"/>";
      }).join("") +
      "</sheets></workbook>";

    var wbRels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
      sheets.map(function (s, i) {
        return "<Relationship Id=\"rId" + (i + 1) +
          "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet" +
          (i + 1) + ".xml\"/>";
      }).join("") +
      "<Relationship Id=\"rId" + (n + 1) +
      "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" +
      "</Relationships>";

    files.push({ name: "[Content_Types].xml", data: types });
    files.push({ name: "_rels/.rels", data: rootRels });
    files.push({ name: "xl/workbook.xml", data: workbook });
    files.push({ name: "xl/_rels/workbook.xml.rels", data: wbRels });
    files.push({ name: "xl/styles.xml", data: STYLES });
    sheets.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: sheetXml(s) });
    });

    return zip(files);
  }

  root.XlsxLite = { build: build, colName: colName };
})(typeof window !== "undefined" ? window : globalThis);
