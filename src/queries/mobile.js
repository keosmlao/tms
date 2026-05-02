const { pool, query, queryOne, queryOneB } = require("../lib/db");
const {
  ensureBillDeliveryItems,
  ensureDeliveryWorkflowSchema,
  ensureJobDeliveryItems,
  getBillDeliveryItems,
  getBillDeliveryItemSummary,
  getBillPhaseSummary,
  getOpenBillCount,
  saveDeliveryImages,
} = require("./delivery");
const {
  coerceDateToFixedYear,
  getFixedYearSqlFilter,
} = require("../lib/fixed-year");
const { saveToken: saveFcmToken, deleteToken: deleteFcmToken } = require("./push");
const { saveFuelRefill, getFuelLogs, getFuelSummary } = require("./fuel");
const { notifyBillStatus } = require("./notifications");

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableText(value) {
  const text = asText(value);
  return text || null;
}

function createAuthPayload(input) {
  const username = asText(input.username) || asText(input.code);
  const code = asText(input.code) || username;
  const driverId = asText(input.driver_id) || code || username;

  return {
    username,
    code,
    name_1: asText(input.name_1) || username,
    department: asText(input.department),
    roles: asText(input.roles),
    driver_id: driverId,
    logistic_code: asText(input.logistic_code),
    title: asText(input.title),
  };
}

async function mobileLogin(body) {
  const username = asText(body?.username);
  const password = asText(body?.password);

  if (!username || !password) {
    const err = new Error("ກະລຸນາໃສ່ username ແລະ password");
    err.status = 400;
    throw err;
  }

  const user = await queryOne(
    `SELECT code, name_1, department, logistic_code, title
     FROM erp_user
     WHERE code = $1 AND password = $2`,
    [username, password]
  );
  if (user) {
    return createAuthPayload({
      username: user.code,
      code: user.code,
      name_1: user.name_1 ?? user.code,
      department: user.department ?? "",
      driver_id: user.code,
      logistic_code: user.logistic_code ?? "",
      title: user.title ?? "",
    });
  }

  const userB = await queryOneB(
    "SELECT username, roles FROM users WHERE username = $1 AND password = $2",
    [username, password]
  );
  if (userB) {
    return createAuthPayload({
      username: userB.username,
      code: userB.username,
      name_1: userB.username,
      roles: userB.roles ?? "",
      driver_id: userB.username,
    });
  }

  const err = new Error("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກ");
  err.status = 401;
  throw err;
}

async function mobileJobsList(driverId, date) {
  const fixedDate = date ? coerceDateToFixedYear(date) : null;
  let sql = `
    WITH bill_summary AS (
      SELECT
        d.doc_no, COUNT(*)::int AS total_bills,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NULL)::int AS waiting_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) NOT IN (1, 2) AND d.sent_start IS NOT NULL)::int AS inprogress_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 1)::int AS completed_bill_count,
        COUNT(*) FILTER (WHERE COALESCE(d.status, 0) = 2)::int AS cancelled_bill_count,
        MIN(d.recipt_job) AS received_at,
        MIN(d.sent_start) FILTER (WHERE d.sent_start IS NOT NULL) AS dispatch_started_at
      FROM public.odg_tms_detail d
      WHERE ${getFixedYearSqlFilter("d.doc_date")}
      GROUP BY d.doc_no
    )
    SELECT
      to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no,
      to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
      b.name_1 as car, c.name_1 as driver,
      COALESCE(bs.total_bills, 0) as item_bill, d.name_1 as user_created,
      a.approve_status::text, a.job_status,
      COALESCE(bs.waiting_bill_count, 0) as waiting_bill_count,
      COALESCE(bs.inprogress_bill_count, 0) as inprogress_bill_count,
      COALESCE(bs.completed_bill_count, 0) as completed_bill_count,
      COALESCE(bs.cancelled_bill_count, 0) as cancelled_bill_count,
      COALESCE(to_char(bs.received_at,'DD-MM-YYYY HH24:MI'), '-') as received_at,
      COALESCE(to_char(bs.dispatch_started_at,'DD-MM-YYYY HH24:MI'), '-') as dispatch_started_at,
      COALESCE(a.miles_start, '') as miles_start,
      COALESCE(a.img_start, '') as img_start,
      COALESCE(a.miles_end, '') as miles_end,
      COALESCE(a.img_end, '') as img_end,
      case when a.approve_status = 0 then 'ລໍຖ້າອະນຸມັດ'
        else case
          when a.job_status = 0 then 'ລໍຖ້າຈັດສົ່ງ'
          when a.job_status = 1 then 'ຮັບຖ້ຽວ'
          when a.job_status = 2 then 'ກຳລັງຈັດສົ່ງ'
          when a.job_status = 3 then 'ຄົນຂັບປິດງານ'
          else 'admin ປິດຖ້ຽວ'
        end
      end as status
    FROM odg_tms a
    LEFT JOIN public.odg_tms_car b ON b.code = a.car
    LEFT JOIN public.odg_tms_driver c ON c.code = a.driver
    LEFT JOIN erp_user d ON d.code = a.user_created
    LEFT JOIN bill_summary bs ON bs.doc_no = a.doc_no`;

  if (date) {
    sql += ` WHERE a.driver=$1 AND a.job_status != 4 AND a.doc_date=$2 AND ${getFixedYearSqlFilter("a.doc_date")} ORDER BY a.doc_no`;
    return await query(sql, [driverId, fixedDate]);
  }

  sql += ` WHERE a.driver=$1 AND a.job_status != 4 AND ${getFixedYearSqlFilter("a.doc_date")} ORDER BY a.doc_no`;
  return await query(sql, [driverId]);
}

function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  const grouped = new Map();
  for (const raw of value) {
    const itemCode = asText(raw?.item_code);
    const qty = Number(raw?.qty ?? 0);
    if (!itemCode || !Number.isFinite(qty) || qty <= 0) continue;
    grouped.set(itemCode, (grouped.get(itemCode) ?? 0) + qty);
  }
  return Array.from(grouped.entries()).map(([item_code, qty]) => ({ item_code, qty }));
}

async function notifyJobDispatchStarted(docNo) {
  try {
    const dispatchBills = await query(
      `SELECT bill_no FROM public.odg_tms_detail WHERE doc_no=$1 AND ${getFixedYearSqlFilter("doc_date")}`,
      [docNo]
    );
    for (const b of dispatchBills) {
      void notifyBillStatus(b.bill_no, "🚚 ເລີ່ມຈັດສົ່ງ");
    }
  } catch (err) {
    console.warn("[mobile] dispatch notification failed:", err?.message ?? err);
  }
}

async function mobileJobAction(body) {
  const client = await pool.connect();
  try {
    const action = asText(body.action);
    const docNo = asText(body.doc_no);
    const billNo = asText(body.bill_no);
    const milesStart = asNullableText(body.miles_start);
    const milesEnd = asNullableText(body.miles_end);
    const startImage = asNullableText(body.img_start ?? body.start_image);
    const endImage = asNullableText(body.img_end ?? body.end_image);
    const deliveryImages = Array.isArray(body.delivery_images)
      ? body.delivery_images.filter((img) => typeof img === "string" && img.length > 0)
      : body.delivery_image
      ? [body.delivery_image]
      : [];
    const deliveryImage = deliveryImages.length > 0 ? deliveryImages[0] : null;
    const signatureImage = asNullableText(body.signature_image ?? body.sight_img);
    const comment = asNullableText(body.comment ?? body.remark);
    const lat = asNullableText(body.lat);
    const lng = asNullableText(body.lng);
    const latEnd = asNullableText(body.lat_end);
    const lngEnd = asNullableText(body.lng_end);

    await client.query("BEGIN");
    await ensureDeliveryWorkflowSchema(client);

    switch (action) {
      case "receive": {
        if (!docNo) throw new Error("doc_no is required");
        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 1 THEN 1 ELSE job_status END
           WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo]
        );
        await client.query("COMMIT");
        return { success: true };
      }

      case "pickup_bill": {
        if (!billNo) throw new Error("bill_no is required");
        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1 AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo]
        );
        const currentJob = billRow.rows[0];
        const currentDocNo = currentJob?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentJob.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        // Auto-receive if the driver hasn't tapped "ຮັບຖ້ຽວ" yet — saves a step
        // since picking up implies the trip is in hand.
        if (Number(currentJob.job_status ?? 0) === 0) {
          await client.query(
            `UPDATE odg_tms
             SET job_status = 1
             WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [currentDocNo]
          );
        } else if (Number(currentJob.job_status ?? 0) > 2) {
          throw new Error("ຖ້ຽວນີ້ປິດແລ້ວ ບໍ່ສາມາດເບີກເຄື່ອງ");
        }

        await ensureBillDeliveryItems(billNo, client);

        await client.query(
          `UPDATE public.odg_tms_detail
           SET recipt_job = COALESCE(recipt_job, LOCALTIMESTAMP(0))
           WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo]
        );

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "📦 ເບີກເຄື່ອງແລ້ວ");
        return { success: true, doc_no: currentDocNo };
      }

      case "dispatch":
      case "start_dispatch": {
        if (!docNo) throw new Error("doc_no is required");
        const jobRow = await client.query(
          `SELECT t.approve_status, t.job_status,
             COUNT(*) FILTER (WHERE d.recipt_job IS NULL AND COALESCE(d.status, 0) NOT IN (1, 2))::int AS pending_pickup_count
           FROM odg_tms t
           LEFT JOIN public.odg_tms_detail d
             ON d.doc_no = t.doc_no AND ${getFixedYearSqlFilter("d.doc_date")}
           WHERE t.doc_no = $1 AND ${getFixedYearSqlFilter("t.doc_date")}
           GROUP BY t.approve_status, t.job_status`,
          [docNo]
        );
        const currentJob = jobRow.rows[0];
        if (!currentJob) throw new Error("Job was not found");
        if (Number(currentJob.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        const currentJobStatus = Number(currentJob.job_status ?? 0);
        if (currentJobStatus === 2) {
          await client.query("COMMIT");
          return { success: true, already_started: true };
        }
        if (currentJobStatus !== 1) throw new Error("ກະລຸນາຮັບຖ້ຽວກ່ອນ");
        if (Number(currentJob.pending_pickup_count ?? 0) > 0) throw new Error("ກະລຸນາເບີກເຄື່ອງໃຫ້ຄົບກ່ອນເລີ່ມຈັດສົ່ງ");

        await client.query(
          `UPDATE odg_tms
           SET job_status = 2,
               miles_start = COALESCE($2, miles_start),
               img_start = COALESCE($3, img_start),
               lat_start = COALESCE($4, lat_start),
               lng_start = COALESCE($5, lng_start)
           WHERE doc_no = $1 AND COALESCE(approve_status, 0) = 1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo, milesStart, startImage, lat, lng]
        );

        await client.query("COMMIT");
        void notifyJobDispatchStarted(docNo);
        return { success: true };
      }

      case "checkin_bill": {
        if (!billNo) throw new Error("bill_no is required");
        await ensureBillDeliveryItems(billNo, client);

        const billRow = await client.query(
          `SELECT d.doc_no, d.cust_code, t.approve_status, t.job_status, d.recipt_job
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1 AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) !== 2) throw new Error("ກະລຸນາເລີ່ມຈັດສົ່ງກ່ອນ");
        if (!currentBill.recipt_job) throw new Error("ກະລຸນາເບີກເຄື່ອງກ່ອນ");

        // One active checkin per job — block until the previously checked-in
        // bill is completed or cancelled. A bill is "active" when sent_start
        // is set, sent_end is still null, and the bill hasn't been finalised
        // (status NOT IN 1=delivered, 2=cancelled).
        const activeCheckin = await client.query(
          `SELECT bill_no FROM public.odg_tms_detail
           WHERE doc_no = $1
             AND bill_no <> $2
             AND sent_start IS NOT NULL
             AND sent_end IS NULL
             AND COALESCE(status, 0) NOT IN (1, 2)
             AND ${getFixedYearSqlFilter("doc_date")}
           LIMIT 1`,
          [currentDocNo, billNo]
        );
        if (activeCheckin.rows.length > 0) {
          throw new Error(
            `ກະລຸນາສຳເລັດ ຫຼື ຍົກເລີກບິນ ${activeCheckin.rows[0].bill_no} ກ່ອນ checkin ບິນອື່ນ`
          );
        }

        await client.query(
          `UPDATE public.odg_tms_detail
           SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng)
           WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng]
        );

        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [currentDocNo]
        );

        // Backfill the customer's location if it's missing. Only updates when
        // the existing latitude/longitude is NULL/empty/zero so we don't
        // overwrite a known-good location with a delivery checkin point.
        // Accepts any zero variant ("0", "0.0", "0.000000", "-0.0", whitespace).
        if (currentBill.cust_code && lat && lng) {
          const updated = await client.query(
            `UPDATE public.ar_customer_detail
             SET latitude = $2, longitude = $3
             WHERE ar_code = $1
               AND (
                 latitude IS NULL
                 OR longitude IS NULL
                 OR TRIM(latitude::text) = ''
                 OR TRIM(longitude::text) = ''
                 OR TRIM(latitude::text) ~ '^-?0+\\.?0*$'
                 OR TRIM(longitude::text) ~ '^-?0+\\.?0*$'
               )
             RETURNING ar_code`,
            [currentBill.cust_code, lat, lng]
          );
          // If no row matched (e.g. customer not in ar_customer_detail), insert.
          if ((updated.rowCount ?? 0) === 0) {
            await client.query(
              `INSERT INTO public.ar_customer_detail (ar_code, latitude, longitude)
               VALUES ($1, $2, $3)
               ON CONFLICT (ar_code) DO UPDATE
                 SET latitude = EXCLUDED.latitude,
                     longitude = EXCLUDED.longitude
                 WHERE
                   public.ar_customer_detail.latitude IS NULL
                   OR public.ar_customer_detail.longitude IS NULL
                   OR TRIM(public.ar_customer_detail.latitude::text) = ''
                   OR TRIM(public.ar_customer_detail.longitude::text) = ''
                   OR TRIM(public.ar_customer_detail.latitude::text) ~ '^-?0+\\.?0*$'
                   OR TRIM(public.ar_customer_detail.longitude::text) ~ '^-?0+\\.?0*$'`,
              [currentBill.cust_code, lat, lng]
            ).catch((err) => {
              // ar_customer_detail might not have ar_code as primary key; skip on conflict.
              console.warn('[checkin] ar_customer_detail insert skipped:', err?.message);
            });
          }
        }

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "📍 ຮອດຈຸດສົ່ງ");
        return { success: true, doc_no: currentDocNo };
      }

      case "attach_bill_image": {
        // Upload one image at a time so the JSON payload stays small. The app
        // calls this per image before issuing complete_bill / cancel_bill so
        // the close action can run with no images in its body.
        if (!billNo) throw new Error("bill_no is required");
        const kind = asText(body.kind);
        const imageData = asNullableText(body.image_data);
        if (!imageData) throw new Error("image_data is required");

        if (kind === "delivery") {
          await saveDeliveryImages(billNo, [imageData], client);
        } else if (kind === "signature") {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET sight_img = $2
             WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, imageData]
          );
        } else if (kind === "primary") {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET url_img = $2
             WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, imageData]
          );
        } else {
          throw new Error("kind must be delivery|signature|primary");
        }

        await client.query("COMMIT");
        return { success: true };
      }

      case "attach_job_image": {
        // Per-job odometer photos (start / end). Same rationale as
        // attach_bill_image — keeps each upload payload tiny.
        if (!docNo) throw new Error("doc_no is required");
        const kind = asText(body.kind);
        const imageData = asNullableText(body.image_data);
        if (!imageData) throw new Error("image_data is required");

        const col = kind === "start" ? "img_start" : kind === "end" ? "img_end" : null;
        if (!col) throw new Error("kind must be start|end");

        await client.query(
          `UPDATE odg_tms SET ${col} = $2 WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo, imageData]
        );

        await client.query("COMMIT");
        return { success: true };
      }

      case "complete_bill": {
        if (!billNo) throw new Error("bill_no is required");
        await ensureBillDeliveryItems(billNo, client);

        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status, d.recipt_job, d.forward_transport_code
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1 AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) !== 2) throw new Error("ກະລຸນາເລີ່ມຈັດສົ່ງກ່ອນ");
        if (!currentBill.recipt_job) throw new Error("ກະລຸນາເບີກເຄື່ອງກ່ອນ");

        const forwardToBranch = currentBill.forward_transport_code
          ? String(currentBill.forward_transport_code).trim()
          : null;

        if (forwardToBranch) {
          await client.query(
            `UPDATE public.odg_tms_detail
             SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
                 status = 1,
                 sent_end = LOCALTIMESTAMP(0),
                 lat = COALESCE($2, lat), lng = COALESCE($3, lng),
                 lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
                 url_img = COALESCE($6, url_img),
                 sight_img = COALESCE($7, sight_img),
                 remark = COALESCE($8, remark)
             WHERE bill_no = $1 AND doc_no = $9 AND ${getFixedYearSqlFilter("doc_date")}`,
            [billNo, lat, lng, latEnd, lngEnd, deliveryImage, signatureImage, comment, currentDocNo]
          );

          await saveDeliveryImages(billNo, deliveryImages, client);

          await client.query(
            `UPDATE ic_trans_shipment
             SET transport_code = $2, check_status = 0
             WHERE doc_no = $1`,
            [billNo, forwardToBranch]
          );

          await client.query(
            `UPDATE odg_tms
             SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END
             WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
            [currentDocNo]
          );

          const openBillCount = await getOpenBillCount(currentDocNo, client);

          await client.query("COMMIT");
          return {
            success: true,
            doc_no: currentDocNo,
            bill_no: billNo,
            finished: true,
            forwarded_to: forwardToBranch,
            open_bill_count: openBillCount,
          };
        }

        const itemRows = await client.query(
          `SELECT item_code, selected_qty, delivered_qty
           FROM public.odg_tms_detail_item
           WHERE bill_no = $1
           ORDER BY item_code`,
          [billNo]
        );

        if (itemRows.rows.length === 0) {
          throw new Error("No delivery items found for this bill");
        }

        const requestedItems = normalizeItems(body.items);
        const itemsToDeliver =
          requestedItems.length > 0
            ? requestedItems
            : itemRows.rows
                .map((row) => ({
                  item_code: row.item_code,
                  qty: Number(row.selected_qty ?? 0) - Number(row.delivered_qty ?? 0),
                }))
                .filter((row) => row.qty > 0);

        if (itemsToDeliver.length === 0) {
          throw new Error("No remaining delivery items");
        }

        const currentItems = new Map(
          itemRows.rows.map((row) => [
            row.item_code,
            {
              selectedQty: Number(row.selected_qty ?? 0),
              deliveredQty: Number(row.delivered_qty ?? 0),
            },
          ])
        );

        for (const item of itemsToDeliver) {
          const currentItem = currentItems.get(item.item_code);
          if (!currentItem) throw new Error(`Item ${item.item_code} was not found`);
          const remainingQty = currentItem.selectedQty - currentItem.deliveredQty;
          const deliverQty = Math.min(item.qty, Math.max(remainingQty, 0));
          if (deliverQty <= 0) continue;

          await client.query(
            `UPDATE public.odg_tms_detail_item
             SET delivered_qty = COALESCE(delivered_qty, 0)::numeric + $2::numeric
             WHERE bill_no = $1 AND item_code = $3`,
            [billNo, deliverQty, item.item_code]
          );
        }

        await client.query(
          `UPDATE public.odg_tms_detail
           SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
               status = 1, sent_end = LOCALTIMESTAMP(0),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng),
               lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
               url_img = COALESCE($6, url_img),
               sight_img = COALESCE($7, sight_img),
               remark = COALESCE($8, remark)
           WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, latEnd, lngEnd, deliveryImage, signatureImage, comment]
        );

        await saveDeliveryImages(billNo, deliveryImages, client);

        await client.query(
          `UPDATE odg_tms
           SET job_status = CASE WHEN COALESCE(job_status, 0) < 2 THEN 2 ELSE job_status END
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [currentDocNo]
        );

        const summary = await getBillDeliveryItemSummary(billNo, client);
        const remainingItems = Number(summary?.remaining_item_count ?? 0);
        const remainingQty = Number(summary?.remaining_qty_total ?? 0);
        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "✅ ຈັດສົ່ງສຳເລັດ");
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          finished: true,
          remaining_item_count: remainingItems,
          remaining_qty_total: remainingQty,
          open_bill_count: openBillCount,
        };
      }

      case "cancel_bill": {
        if (!billNo) throw new Error("bill_no is required");
        if (!comment) throw new Error("ກະລຸນາໃສ່ໝາຍເຫດການຍົກເລີກ");
        const billRow = await client.query(
          `SELECT d.doc_no, t.approve_status, t.job_status, d.recipt_job
           FROM public.odg_tms_detail d
           INNER JOIN odg_tms t ON t.doc_no = d.doc_no
           WHERE d.bill_no = $1 AND ${getFixedYearSqlFilter("d.doc_date")}
           ORDER BY (CASE WHEN COALESCE(d.status, 0) NOT IN (1, 2) THEN 0 ELSE 1 END),
                    d.create_date_time_now DESC NULLS LAST
           LIMIT 1`,
          [billNo]
        );
        const currentBill = billRow.rows[0];
        const currentDocNo = currentBill?.doc_no;
        if (!currentDocNo) throw new Error("Bill was not found");
        if (Number(currentBill.approve_status ?? 0) !== 1) throw new Error("ຖ້ຽວນີ້ຍັງບໍ່ຖືກອະນຸມັດ");
        if (Number(currentBill.job_status ?? 0) !== 2) throw new Error("ກະລຸນາເລີ່ມຈັດສົ່ງກ່ອນ");
        if (!currentBill.recipt_job) throw new Error("ກະລຸນາເບີກເຄື່ອງກ່ອນ");

        await client.query(
          `UPDATE public.odg_tms_detail
           SET sent_start = COALESCE(sent_start, LOCALTIMESTAMP(0)),
               status = 2, sent_end = COALESCE(sent_end, LOCALTIMESTAMP(0)),
               lat = COALESCE($2, lat), lng = COALESCE($3, lng),
               lat_end = COALESCE($4, lat_end), lng_end = COALESCE($5, lng_end),
               url_img = COALESCE($6, url_img), remark = COALESCE($7, remark)
           WHERE bill_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [billNo, lat, lng, latEnd, lngEnd, deliveryImage, comment]
        );

        const openBillCount = await getOpenBillCount(currentDocNo, client);

        await client.query("COMMIT");
        void notifyBillStatus(billNo, "❌ ຍົກເລີກຈັດສົ່ງ");
        return {
          success: true,
          doc_no: currentDocNo,
          bill_no: billNo,
          open_bill_count: openBillCount,
        };
      }

      case "complete_job": {
        if (!docNo) throw new Error("doc_no is required");
        const openBillCount = await getOpenBillCount(docNo, client);
        if (openBillCount > 0) throw new Error("Still has pending bills");

        await client.query(
          `UPDATE odg_tms
           SET job_status = 3, job_close = LOCALTIMESTAMP(0),
               miles_end = COALESCE($2, miles_end),
               img_end = COALESCE($3, img_end)
           WHERE doc_no = $1 AND ${getFixedYearSqlFilter("doc_date")}`,
          [docNo, milesEnd, endImage]
        );

        await client.query("COMMIT");
        return { success: true };
      }

      case "save_travel_history": {
        if (!docNo) throw new Error("doc_no is required");
        if (!lat || !lng) throw new Error("lat and lng are required");

        const today = new Date().toISOString().split("T")[0];
        await client.query(
          `INSERT INTO odg_tms_travel_history (doc_no, doc_date, lat, lng, recorded_at)
           VALUES ($1, $2::date, $3, $4, LOCALTIMESTAMP(0))`,
          [docNo, today, lat, lng]
        );

        await client.query("COMMIT");
        return { success: true };
      }

      case "fuel_refill": {
        const result = await saveFuelRefill(
          {
            fuel_date: asNullableText(body.fuel_date),
            user_code: asNullableText(body.user_code),
            driver_name: asNullableText(body.driver_name),
            car: asNullableText(body.car),
            doc_no: docNo || null,
            liters: body.liters,
            amount: body.amount,
            odometer: body.odometer,
            station: asNullableText(body.station),
            note: asNullableText(body.note),
            image_data: asNullableText(body.image_data ?? body.photo),
            lat,
            lng,
          },
          client
        );
        await client.query("COMMIT");
        return result;
      }

      default:
        throw new Error("Invalid action");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function mobileBills({ docNo, billNo, type }) {
  if (type === "products" && docNo) {
    return await getBillDeliveryItems({ docNo });
  }
  if (type === "products" && billNo) {
    return await getBillDeliveryItems({ billNo });
  }
  if (billNo) {
    await ensureBillDeliveryItems(billNo);
    return await getBillDeliveryItems({ billNo });
  }

  if (docNo) {
    await ensureJobDeliveryItems(docNo);
    const itemSummaryRows = await getBillPhaseSummary(docNo);
    const itemSummaryByBill = new Map(
      itemSummaryRows.map((row) => [
        row.bill_no,
        {
          total_item_count: Number(row.total_item_count ?? 0),
          delivered_item_count: Number(row.delivered_item_count ?? 0),
          remaining_item_count: Number(row.remaining_item_count ?? 0),
          delivered_qty_total: Number(row.delivered_qty_total ?? 0),
          remaining_qty_total: Number(row.remaining_qty_total ?? 0),
        },
      ])
    );

    const data = await query(
      `SELECT
        a.bill_no, to_char(a.bill_date,'DD-MM-YYYY') as bill_date,
        a.cust_code, b.name_1 as cust_name, b.telephone,
        to_char(a.date_logistic,'DD-MM-YYYY') as date_logistic,
        COALESCE(NULLIF(TRIM(a.lat::text), ''), NULLIF(TRIM(acd.latitude::text), '')) as lat,
        COALESCE(NULLIF(TRIM(a.lng::text), ''), NULLIF(TRIM(acd.longitude::text), '')) as lng,
        a.lat_end, a.lng_end,
        COALESCE(a.count_item, '0') as count_item,
        COALESCE(a.status, 0) as status,
        COALESCE(to_char(a.recipt_job,'DD-MM-YYYY HH24:MI'), '-') as recipt_job,
        COALESCE(to_char(a.sent_start,'DD-MM-YYYY HH24:MI'), '-') as sent_start,
        COALESCE(to_char(a.sent_end,'DD-MM-YYYY HH24:MI'), '-') as sent_end,
        COALESCE(a.url_img, '') as url_img,
        COALESCE(a.sight_img, '') as sight_img,
        COALESCE(a.remark, '') as remark
      FROM public.odg_tms_detail a
      LEFT JOIN ar_customer b ON b.code = a.cust_code
      LEFT JOIN ar_customer_detail acd ON acd.ar_code = a.cust_code
      WHERE a.doc_no = $1 AND ${getFixedYearSqlFilter("a.doc_date")}
      ORDER BY a.bill_no`,
      [docNo]
    );

    return data.map((row) => {
      const summary = itemSummaryByBill.get(String(row.bill_no)) ?? {
        total_item_count: Number(row.count_item ?? 0),
        delivered_item_count: 0,
        remaining_item_count: Number(row.count_item ?? 0),
        delivered_qty_total: 0,
        remaining_qty_total: 0,
      };
      const status = Number(row.status ?? 0);

      const phase =
        status === 2 ? "cancel"
        : status === 1 ? "done"
        : row.sent_start !== "-" ? "inprogress"
        : row.recipt_job !== "-" ? "pickup"
        : "waiting";

      const status_text =
        phase === "cancel" ? "ຍົກເລີກຈັດສົ່ງ"
        : phase === "done" ? "ຈັດສົ່ງສຳເລັດ"
        : phase === "inprogress" ? "ກຳລັງຈັດສົ່ງ"
        : phase === "pickup" ? "ເບີກເຄື່ອງແລ້ວ"
        : "ລໍເບີກເຄື່ອງ";

      return {
        ...row,
        count_item: summary.total_item_count,
        delivered_item_count: summary.delivered_item_count,
        remaining_item_count: summary.remaining_item_count,
        delivered_qty_total: summary.delivered_qty_total,
        remaining_qty_total: summary.remaining_qty_total,
        phase,
        status_text,
      };
    });
  }

  return [];
}

async function mobileFuelLogs({ userCode, fromDate, toDate, limit } = {}) {
  const code = asText(userCode);
  if (!code) {
    const err = new Error("user_code is required");
    err.status = 400;
    throw err;
  }
  const rows = await getFuelLogs({ userCode: code, fromDate, toDate });
  const summary = await getFuelSummary({ userCode: code, fromDate, toDate });
  const max = Number(limit ?? 100);
  return {
    rows: max > 0 ? rows.slice(0, max) : rows,
    summary,
  };
}

async function fcmTokenSave({ user_code, token, platform }) {
  const userCode = asText(user_code);
  const t = asText(token);
  const p = asText(platform);
  if (!userCode || !t) {
    const err = new Error("user_code and token are required");
    err.status = 400;
    throw err;
  }
  await saveFcmToken(userCode, t, p);
  return { success: true };
}

async function fcmTokenDelete(token) {
  const t = asText(token);
  if (!t) {
    const err = new Error("token is required");
    err.status = 400;
    throw err;
  }
  await deleteFcmToken(t);
  return { success: true };
}

module.exports = {
  mobileLogin,
  mobileJobsList,
  mobileJobAction,
  mobileBills,
  mobileFuelLogs,
  fcmTokenSave,
  fcmTokenDelete,
};
