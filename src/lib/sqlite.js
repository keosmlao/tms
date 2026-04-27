const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = path.join(process.cwd(), "data", "local.db");

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobdetail (
        doc_no TEXT,
        doc_date TEXT,
        date_logistic TEXT,
        car TEXT,
        bill_no TEXT,
        bill_date TEXT,
        cust_code TEXT,
        count_item TEXT,
        telephone TEXT
      )
    `);
  }
  return db;
}

function getJobDetails(docNo) {
  return getDb()
    .prepare(
      "SELECT doc_no, doc_date, telephone, count_item, date_logistic, car, bill_no, bill_date, cust_code FROM jobdetail WHERE doc_no = ?"
    )
    .all(docNo);
}

function insertJobDetail(item) {
  getDb()
    .prepare(
      "INSERT INTO jobdetail (doc_no, doc_date, date_logistic, car, bill_no, bill_date, cust_code, count_item, telephone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      item.doc_no,
      item.doc_date,
      item.date_logistic,
      item.car,
      item.bill_no,
      item.bill_date,
      item.cust_code,
      item.count_item,
      item.telephone
    );
}

function deleteJobDetail(billNo, docNo) {
  getDb()
    .prepare("DELETE FROM jobdetail WHERE bill_no = ? AND doc_no = ?")
    .run(billNo, docNo);
}

function clearJobDetails(docNo) {
  getDb().prepare("DELETE FROM jobdetail WHERE doc_no = ?").run(docNo);
}

module.exports = {
  getJobDetails,
  insertJobDetail,
  deleteJobDetail,
  clearJobDetails,
};
