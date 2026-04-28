import * as auth from "@/actions/auth";
import * as approve from "@/actions/approve";
import * as billShipment from "@/actions/bill-shipment";
import * as bills from "@/actions/bills";
import * as dashboard from "@/actions/dashboard";
import * as deliveryRound from "@/actions/delivery-round";
import * as fuel from "@/actions/fuel";
import * as gps from "@/actions/gps";
import * as jobs from "@/actions/jobs";
import * as masterData from "@/actions/master-data";
import * as reports from "@/actions/reports";
import * as settings from "@/actions/settings";
import * as tracking from "@/actions/tracking";

export const Actions = {
  // Dashboard
  getDashboardData: dashboard.getDashboardData,

  // Approve
  getApproveList: approve.getApproveList,
  approveJob: approve.approveJob,
  getApproveReport: approve.getApproveReport,
  getApprovedList: approve.getApprovedList,

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
  addBillsToJob: jobs.addBillsToJob,
  searchBillsForJob: jobs.searchBillsForJob,
  getJobsClosedByDriver: jobs.getJobsClosedByDriver,
  getJobsClosed: jobs.getJobsClosed,
  getJobsWaitingReceive: jobs.getJobsWaitingReceive,
  getJobsWaitingPickup: jobs.getJobsWaitingPickup,

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
  getBillsCancelledList: bills.getBillsCancelledList,
  getBillsPartialList: bills.getBillsPartialList,
  getPendingBillSchedule: bills.getPendingBillSchedule,
  upsertPendingBillSchedule: bills.upsertPendingBillSchedule,
  getBillTodos: bills.getBillTodos,
  createBillTodo: bills.createBillTodo,
  setBillTodoDone: bills.setBillTodoDone,
  deleteBillTodo: bills.deleteBillTodo,

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
  searchActiveDeliveryBills: tracking.searchActiveDeliveryBills,
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

  // Fuel
  getFuelLogs: fuel.getFuelLogs,
  getFuelSummary: fuel.getFuelSummary,
  getFuelImage: fuel.getFuelImage,
  deleteFuelLog: fuel.deleteFuelLog,
  saveFuelRefill: fuel.saveFuelRefill,

  // Settings (notification test mode etc.)
  getNotifySettings: settings.getNotifySettings,
  saveNotifySettings: settings.saveNotifySettings,

  // Delivery rounds
  listDeliveryRounds: deliveryRound.listDeliveryRounds,
  getDeliveryRound: deliveryRound.getDeliveryRound,
  upsertDeliveryRound: deliveryRound.upsertDeliveryRound,
  deleteDeliveryRound: deliveryRound.deleteDeliveryRound,
};

export const Auth = {
  login: auth.login,
  logout: auth.logout,
  me: auth.me,
};
