const { query, queryOne } = require("../lib/db");
const { getFixedYearSqlFilter } = require("../lib/fixed-year");
const {
  getBranchScope,
  branchFilterShipment,
} = require("./helpers");

async function getBillShipmentData(session, search) {
  const scope = getBranchScope(session);
  const branchClause = branchFilterShipment(scope, "b");
  const data = search
    ? await query(`SELECT to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no, a.cust_code, b.transport_code, c.name_1 as transport_name, d.name_1 as cus_name FROM ic_trans a LEFT JOIN ic_trans_shipment b ON a.doc_no = b.doc_no LEFT JOIN transport_type c ON c.code = b.transport_code LEFT JOIN ar_customer d ON a.cust_code = d.code WHERE a.trans_flag = '44' AND ${getFixedYearSqlFilter("a.doc_date")} ${branchClause} AND a.doc_no LIKE $1 ORDER BY a.doc_date DESC LIMIT 20`, [`%${search}%`])
    : await query(`SELECT to_char(a.doc_date,'DD-MM-YYYY') as doc_date, a.doc_no, a.cust_code, b.transport_code, c.name_1 as transport_name, d.name_1 as cus_name FROM ic_trans a LEFT JOIN ic_trans_shipment b ON a.doc_no = b.doc_no LEFT JOIN transport_type c ON c.code = b.transport_code LEFT JOIN ar_customer d ON a.cust_code = d.code WHERE a.trans_flag = '44' AND ${getFixedYearSqlFilter("a.doc_date")} ${branchClause} ORDER BY a.doc_date DESC LIMIT 20`);
  const transport = await query("SELECT * FROM transport_type WHERE code LIKE '02%'");
  return { data, transport };
}

async function saveBillShipment(session, docNo, transportCode) {
  const result = await queryOne(`SELECT (SELECT EXISTS (SELECT 1 FROM odg_tms_shipment WHERE doc_no = $1)) AS tms_shipment, (SELECT EXISTS (SELECT 1 FROM ic_trans_shipment WHERE doc_no = $1)) AS trans_shipment`, [docNo]);
  if (!result) return;
  if (!result.tms_shipment && !result.trans_shipment) {
    await queryOne("INSERT INTO odg_tms_shipment (doc_no, transport_code, user_create) VALUES ($1,$2,$3)", [docNo, transportCode, session.usercode]);
    await queryOne(`INSERT INTO ic_trans_shipment (doc_no, doc_date, trans_flag, cust_code, transport_code, check_status) SELECT doc_no, doc_date, trans_flag, cust_code, $1, 0 FROM ic_trans WHERE doc_no = $2`, [transportCode, docNo]);
  } else if (!result.tms_shipment && result.trans_shipment) {
    await queryOne("INSERT INTO odg_tms_shipment (doc_no, transport_code, user_create) VALUES ($1,$2,$3)", [docNo, transportCode, session.usercode]);
    await queryOne("UPDATE ic_trans_shipment SET transport_code=$1 WHERE doc_no=$2", [transportCode, docNo]);
  } else if (result.tms_shipment && !result.trans_shipment) {
    await queryOne("UPDATE odg_tms_shipment SET transport_code=$1, user_create=$2 WHERE doc_no=$3", [transportCode, session.usercode, docNo]);
    await queryOne(`INSERT INTO ic_trans_shipment (doc_no, doc_date, trans_flag, cust_code, transport_code, check_status) SELECT doc_no, doc_date, trans_flag, cust_code, $1, 0 FROM ic_trans WHERE doc_no = $2`, [transportCode, docNo]);
  } else {
    await queryOne("UPDATE odg_tms_shipment SET transport_code=$1, user_create=$2 WHERE doc_no=$3", [transportCode, session.usercode, docNo]);
    await queryOne("UPDATE ic_trans_shipment SET transport_code=$1 WHERE doc_no=$2", [transportCode, docNo]);
  }
}

module.exports = {
  getBillShipmentData,
  saveBillShipment,
};
