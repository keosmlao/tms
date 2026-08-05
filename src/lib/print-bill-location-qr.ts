// Print a delivery-location QR for a single pending bill. Opens a new tab
// with bill no + customer name + lat/lng + a Google Maps QR, then triggers
// the browser print dialog. The dispatcher can crop/cut and staple it onto
// the physical bill so the driver can scan to navigate.

import QRCode from "qrcode";
import { getLaoParts } from "./lao-date";

export interface PrintBillLocationQrArgs {
  billNo: string;
  custName?: string | null;
  lat: string | number;
  lng: string | number;
}

export async function printBillLocationQr({
  billNo,
  custName,
  lat,
  lng,
}: PrintBillLocationQrArgs): Promise<void> {
  const latStr = String(lat).trim();
  const lngStr = String(lng).trim();
  if (!latStr || !lngStr) {
    throw new Error("ບໍ່ມີຈຸດທີ່ກຳນົດ");
  }
  // `bill` is a custom param Google Maps ignores, but the driver app reads it
  // off the URL to confirm the QR matches the bill the driver is delivering.
  const mapsUrl =
    `https://www.google.com/maps?q=${encodeURIComponent(latStr)},${encodeURIComponent(lngStr)}` +
    `&bill=${encodeURIComponent(billNo)}`;
  // Render the QR to a data URI so we can drop it straight into the print
  // window without worrying about same-origin script loading or async timing
  // after document.open().
  const qrDataUrl = await QRCode.toDataURL(mapsUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
  // ເວລາລາວສະເໝີ — ເຈ້ຍນີ້ຖືກຕິດໃສ່ບິນຈິງ ຈຶ່ງບໍ່ຄວນປ່ຽນຕາມໂມງຂອງເຄື່ອງທີ່ພິມ
  const p = getLaoParts();
  const printedAt = `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;

  const safe = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
    );

  const html = `<!doctype html>
<html lang="lo">
<head>
<meta charset="utf-8" />
<title>QR ຈຸດສົ່ງ ${safe(billNo)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Lao", sans-serif;
    margin: 0; padding: 24px; color: #111;
  }
  .card {
    border: 1.5px dashed #444;
    border-radius: 10px;
    padding: 18px 22px;
    max-width: 360px;
    margin: 0 auto;
    text-align: center;
  }
  .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .bill-no { font-size: 22px; font-weight: 800; margin: 4px 0 2px; }
  .cust { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
  .qr { padding: 8px; background: #fff; display: inline-block; border: 1px solid #eee; }
  .qr img { width: 240px; height: 240px; display: block; }
  .coords {
    margin-top: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: #333;
  }
  .footer {
    margin-top: 10px;
    font-size: 10px;
    color: #888;
    display: flex; justify-content: space-between; align-items: center;
  }
  .hint { margin-top: 6px; font-size: 11px; color: #555; }
  @media print {
    body { padding: 0; }
    .card { border-color: #000; }
    .toolbar { display: none; }
  }
  .toolbar {
    text-align: center;
    margin-bottom: 16px;
  }
  .toolbar button {
    padding: 8px 18px;
    font-size: 13px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #fff;
    cursor: pointer;
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ Print</button>
  </div>
  <div class="card">
    <div class="label">ບິນເລກທີ່</div>
    <div class="bill-no">${safe(billNo)}</div>
    <div class="cust">${safe(custName ?? "—")}</div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR" /></div>
    <div class="coords">${safe(latStr)}, ${safe(lngStr)}</div>
    <div class="hint">Scan ເພື່ອເປີດ Google Maps</div>
    <div class="footer">
      <span>Print: ${safe(printedAt)}</span>
      <span>TMS</span>
    </div>
  </div>
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 200));</script>
</body>
</html>`;

  // Pop-up blockers may swallow window.open() if it isn't kicked off from a
  // direct user gesture — make sure the caller runs us synchronously inside
  // an onClick handler.
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) {
    throw new Error("ບໍ່ສາມາດເປີດໜ້າພິມໄດ້ — ກະລຸນາອະນຸຍາດ popup");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
