/**
 * ການຄິດເລກຂອງຈໍ TV — ແຍກອອກມາຈາກ query ເພື່ອໃຫ້ທົດສອບໄດ້.
 *
 * ສ່ວນນີ້ຄິດຜິດມາຫຼາຍຮອບ (ນັບບິນທີ່ສົ່ງແລ້ວເປັນບິນຄ້າງ, ເອົາວັນອະນາຄົດ
 * ມາຂຶ້ນວ່າ "ມື້ນີ້", ຍອດລາຍການບໍ່ເທົ່າກັບຍອດລວມ) ຈຶ່ງຕ້ອງມີ test ຄຸມ.
 * ບໍ່ມີການແຕະຖານຂໍ້ມູນໃນໄຟລ໌ນີ້ — ຮັບ rows ເຂົ້າມາຢ່າງດຽວ.
 */

// ຈໍໃສ່ໄດ້ປະມານ 8 ແຖວ — ເກີນນັ້ນລວມເປັນແຖວດຽວ ແຕ່ຍັງນັບຄົບ
const MAX_TODO_ROWS = 7;

const DAY_MS = 86_400_000;

/**
 * ວັນທີ່ບິນຄວນຈະສົ່ງ: ວັນທີ່ຜູ້ຈັດຖ້ຽວກຳນົດໄວ້ກ່ອນ, ບໍ່ມີຈຶ່ງໃຊ້ວັນທີ່
 * ພະນັກງານຂາຍລະບຸ, ບໍ່ມີອີກຈຶ່ງໃຊ້ວັນເປີດບິນ.
 */
function dueOf(row) {
  const raw =
    row?.scheduled_date ||
    row?.send_date ||
    (row?.doc_date ? String(row.doc_date).split("-").reverse().join("-") : "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** ຊ້າມາຈັກວັນ. ຕິດລົບ = ວັນນັດຍັງບໍ່ຮອດ. */
function lateDays(due, today) {
  if (!due) return 0;
  return Math.round(
    (new Date(`${today}T00:00:00`) - new Date(`${due}T00:00:00`)) / DAY_MS
  );
}

function dueLabel(due) {
  return `${due.slice(8, 10)}/${due.slice(5, 7)}`;
}

/**
 * ຈັດບິນຄ້າງເປັນກ້ອນຕາມວັນທີ່ຄວນສົ່ງ.
 *
 * ວັນນັດທີ່ຍັງບໍ່ຮອດບໍ່ເອົາຂຶ້ນລາຍການ — ຈໍນີ້ໃຊ້ໄລ່ວຽກມື້ນີ້ ບໍ່ແມ່ນ
 * ປະຕິທິນລ່ວງໜ້າ. ບິນທີ່ບໍ່ມີວັນສົ່ງເລີຍໄດ້ແຖວຂອງມັນເອງ ເພາະມັນຕ້ອງ
 * ໃຫ້ຄົນໄປກຳນົດວັນ ບໍ່ແມ່ນລໍຢູ່ຊື່ໆ.
 */
function buildTodoRows(rows, today) {
  const byDue = new Map();
  let noDue = 0;
  for (const row of rows) {
    const due = dueOf(row);
    if (!due) {
      noDue += 1;
      continue;
    }
    const bucket = byDue.get(due) ?? { bills: 0, days_late: lateDays(due, today) };
    bucket.bills += 1;
    byDue.set(due, bucket);
  }

  const sorted = [...byDue.entries()]
    .filter(([, bucket]) => bucket.days_late >= 0)
    .sort((a, b) => a[1].days_late - b[1].days_late);

  const recent = sorted.slice(0, MAX_TODO_ROWS);
  const older = sorted.slice(MAX_TODO_ROWS);

  const todoRows = recent.map(([due, bucket]) => ({
    due_label: dueLabel(due),
    days_late: bucket.days_late,
    bills: bucket.bills,
  }));
  todoRows.sort((a, b) => b.days_late - a.days_late);

  if (older.length > 0) {
    const oldest = older[older.length - 1];
    todoRows.unshift({
      due_label: `ກ່ອນ ${dueLabel(older[0][0])}`,
      days_late: oldest[1].days_late,
      bills: older.reduce((sum, [, bucket]) => sum + bucket.bills, 0),
    });
  }
  if (noDue > 0) {
    todoRows.push({ due_label: "ບໍ່ມີວັນສົ່ງ", days_late: 0, bills: noDue });
  }
  return todoRows;
}

/**
 * ບິນຄ້າງສົ່ງທັງໝົດ ແລະ KPI 24 ຊົ່ວໂມງ.
 *
 * "ຍັງທັນ" = ວັນທີ່ຄວນສົ່ງຍັງບໍ່ເລີຍມາເກີນໜຶ່ງວັນ (0 ຫຼື 1 ວັນ) ເຊິ່ງກົງ
 * ກັບ 24 ຊົ່ວໂມງເມື່ອນັບເປັນວັນ.
 */
function buildWorkload({ pendingRows, scheduledOpen, today, kpiHours = 24 }) {
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  let onTime = 0;
  for (const row of pendingRows) {
    const due = dueOf(row);
    if (!due) continue;
    if (lateDays(due, today) <= 1) onTime += 1;
  }
  const unscheduled = pendingRows.length;
  const total = unscheduled + scheduledOpen;
  return {
    kpi_hours: kpiHours,
    total,
    unscheduled,
    scheduled: scheduledOpen,
    on_time: onTime,
    late: total - onTime,
    on_time_percent: pct(onTime, total),
    late_percent: pct(total - onTime, total),
  };
}

/** ລາຍບິນທີ່ເລີຍກຳນົດ ສຳລັບໜ້າ "ບິນທີ່ຊ້າ". */
function buildLateBills(rows, today, limit = 40) {
  return rows
    .map((row) => {
      const due = dueOf(row);
      return {
        bill_no: row.doc_no,
        cust_name: String(row.cust_name || row.cust_code || "-"),
        area: String(row.cust_area || ""),
        due_label: due ? dueLabel(due) : "-",
        days_late: due ? lateDays(due, today) : 0,
        has_due: Boolean(due),
      };
    })
    .filter((row) => !row.has_due || row.days_late > 0)
    .sort((a, b) => b.days_late - a.days_late)
    .slice(0, limit);
}

module.exports = {
  MAX_TODO_ROWS,
  dueOf,
  lateDays,
  buildTodoRows,
  buildWorkload,
  buildLateBills,
};
