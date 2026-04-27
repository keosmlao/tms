import * as auth from "@/actions/auth";
import * as approve from "@/actions/approve";
import * as billShipment from "@/actions/bill-shipment";
import * as bills from "@/actions/bills";
import * as dashboard from "@/actions/dashboard";
import * as gps from "@/actions/gps";
import * as jobs from "@/actions/jobs";
import * as masterData from "@/actions/master-data";
import * as reports from "@/actions/reports";
import * as tracking from "@/actions/tracking";

export const Actions = {
  // Dashboard
  getDashboardData: dashboard.getDashboardData,

  // Approve
  getApproveList: approve.getApproveList,
  approveJob: approve.approveJob,
  getApproveReport: approve.getApproveReport,

  // Jobs
  getJobs: jobs.getJobs,
  createJob: jobs.createJob,
  deleteJob: jobs.deleteJob,
  closeJob: jobs.closeJob,
  getJobInit: jobs.getJobInit,
  getJobAddPageData: jobs.getJobAddPageData,
  getJobBillsWithProducts: jobs.getJobBillsWithProducts,
  addBillToDraft: jobs.addBillToDraft,
  removeBillFromDraft: jobs.removeBillFromDraft,
  searchBills: jobs.searchBills,

  // Bills
  getAvailableBills: bills.getAvailableBills,
  getAvailableBillsWithProducts: bills.getAvailableBillsWithProducts,
  getAvailableBillProducts: bills.getAvailableBillProducts,
  getBillsPending: bills.getBillsPending,
  updateBillTransport: bills.updateBillTransport,
  getBillProducts: bills.getBillProducts,
  getBillsWaitingSent: bills.getBillsWaitingSent,
  getBillsWaitingSentDetails: bills.getBillsWaitingSentDetails,
  getBillsInProgress: bills.getBillsInProgress,
  getBillCompleteList: bills.getBillCompleteList,

  // Reports
  getReportDaily: reports.getReportDaily,
  getReportByDriver: reports.getReportByDriver,
  getReportByCar: reports.getReportByCar,
  getReportByBill: reports.getReportByBill,
  getReportMonthlyCar: reports.getReportMonthlyCar,
  getReportMonthlyDriver: reports.getReportMonthlyDriver,

  // Cars
  getCars: masterData.getCars,
  addCar: masterData.addCar,
  updateCar: masterData.updateCar,
  deleteCar: masterData.deleteCar,
  getCarDefaults: masterData.getCarDefaults,
  getCarProfiles: masterData.getCarProfiles,
  addCarProfile: masterData.addCarProfile,
  updateCarProfile: masterData.updateCarProfile,
  deleteCarProfile: masterData.deleteCarProfile,

  // Drivers
  getDrivers: masterData.getDrivers,
  addDriver: masterData.addDriver,
  updateDriver: masterData.updateDriver,
  deleteDriver: masterData.deleteDriver,
  getDispatchDrivers: masterData.getDispatchDrivers,
  getDispatchWorkers: masterData.getDispatchWorkers,
  getDispatchWorkersWithBranch: masterData.getDispatchWorkersWithBranch,
  setWorkerBranch: masterData.setWorkerBranch,
  getTransportBranches: masterData.getTransportBranches,

  // Warehouse workers
  getWarehouseWorkers: masterData.getWarehouseWorkers,
  addWarehouseWorker: masterData.addWarehouseWorker,
  updateWarehouseWorker: masterData.updateWarehouseWorker,
  deleteWarehouseWorker: masterData.deleteWarehouseWorker,

  // Tracking
  trackBill: tracking.trackBill,
  getGpsRealtime: tracking.getGpsRealtime,
  getGpsRealtimeAll: tracking.getGpsRealtimeAll,
  getLocations: tracking.getLocations,

  // GPS
  getGpsObjectList: gps.getGpsObjectList,
  getGpsCars: gps.getGpsCars,
  syncGpsDay: gps.syncGpsDay,
  syncGpsRange: gps.syncGpsRange,
  getGpsUsageSummary: gps.getGpsUsageSummary,
  getGpsUsageDaily: gps.getGpsUsageDaily,
  getGpsUsageTrack: gps.getGpsUsageTrack,
  startGpsBackfill: gps.startGpsBackfill,
  getGpsBackfillStatus: gps.getGpsBackfillStatus,
  stopGpsBackfill: gps.stopGpsBackfill,

  // Bill shipment
  getBillShipmentData: billShipment.getBillShipmentData,
  saveBillShipment: billShipment.saveBillShipment,
};

export const Auth = {
  login: auth.login,
  logout: auth.logout,
  me: auth.me,
};
