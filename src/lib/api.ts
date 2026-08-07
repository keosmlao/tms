import * as auth from "@/actions/auth";
import * as approve from "@/actions/approve";
import * as auditLog from "@/actions/audit-log";
import * as billShipment from "@/actions/bill-shipment";
import * as bills from "@/actions/bills";
import * as dashboard from "@/actions/dashboard";
import * as deliveryRound from "@/actions/delivery-round";
import * as deliveryRoute from "@/actions/delivery-route";
import * as deliveryCalendar from "@/actions/delivery-calendar";
import * as carType from "@/actions/car-type";
import * as chatter from "@/actions/chatter";
import * as fuel from "@/actions/fuel";
import * as geofence from "@/actions/geofence";
import * as gps from "@/actions/gps";
import * as jobs from "@/actions/jobs";
import * as deliveryAudit from "@/actions/delivery-audit";
import * as pod from "@/actions/pod";
import * as tripSuggest from "@/actions/trip-suggest";
import * as masterData from "@/actions/master-data";
import * as notifications from "@/actions/notifications";
import * as pickupVariance from "@/actions/pickup-variance";
import * as packDim from "@/actions/pack-dim";
import * as pipeDim from "@/actions/pipe-dim";
import * as presence from "@/actions/presence";
import * as reports from "@/actions/reports";
import * as routing from "@/actions/routing";
import * as settings from "@/actions/settings";
import * as thunjai from "@/actions/thunjai";
import * as tracking from "@/actions/tracking";
import * as tripDraft from "@/actions/trip-draft";
import * as tripVolume from "@/actions/trip-volume";

export const Actions = {
  // Dashboard
  getDashboardData: dashboard.getDashboardData,
  getDashboardSummary: dashboard.getDashboardSummary,
  getDashboardKpi: dashboard.getDashboardKpi,
  getDashboardDeliveryPerformance: dashboard.getDashboardDeliveryPerformance,
  getDashboardPending: dashboard.getDashboardPending,
  getDashboardActivity: dashboard.getDashboardActivity,
  getDriverLeaderboard: dashboard.getDriverLeaderboard,

  // Audit log
  getAuditLog: auditLog.getAuditLog,

  // ຮ່າງຖ້ຽວ (ວັນ × ຮອບ × ສາຍ) — planning before a trip exists
  listTripDrafts: tripDraft.listTripDrafts,
  getTripDraftBills: tripDraft.getTripDraftBills,
  listDraftedBillNos: tripDraft.listDraftedBillNos,
  getTripDraftCandidates: tripDraft.getTripDraftCandidates,
  createTripDraft: tripDraft.createTripDraft,
  updateTripDraft: tripDraft.updateTripDraft,
  deleteTripDraft: tripDraft.deleteTripDraft,
  addBillsToTripDraft: tripDraft.addBillsToTripDraft,
  removeBillFromTripDraft: tripDraft.removeBillFromTripDraft,
  setTripDraftBillOptions: tripDraft.setTripDraftBillOptions,
  dispatchTripDraft: tripDraft.dispatchTripDraft,
  // ພື້ນທີ່ບັນທຸກ ທຽບຄວາມຈຸລົດ — ຮ່າງຖ້ຽວ, ຖ້ຽວຈິງ ແລະ ລາຍງານຍ້ອນຫຼັງ
  getTripDraftVolume: tripVolume.getTripDraftVolume,
  listTripDraftsWithVolume: tripVolume.listTripDraftsWithVolume,
  getTripVolume: tripVolume.getTripVolume,
  getTripVolumesBulk: tripVolume.getTripVolumesBulk,
  getPendingBillVolumes: tripVolume.getPendingBillVolumes,
  getBillItemVolumes: tripVolume.getBillItemVolumes,
  getUtilizationReport: tripVolume.getUtilizationReport,

  // Pickup variance (ບິນເບີກບໍ່ຄົບ)
  getPickupVarianceList: pickupVariance.getPickupVarianceList,
  acknowledgePickupVariance: pickupVariance.acknowledgePickupVariance,
  getOpenPickupVarianceCount: pickupVariance.getOpenPickupVarianceCount,

  // Presence
  heartbeat: presence.heartbeat,
  getUserPresence: presence.getUserPresence,

  // Approve
  getApproveList: approve.getApproveList,
  approveJob: approve.approveJob,
  getApproveReport: approve.getApproveReport,
  getApprovedList: approve.getApprovedList,

  // Jobs
  getJobs: jobs.getJobs,
  createJob: jobs.createJob,
  updateJob: jobs.updateJob,
  getJobForEdit: jobs.getJobForEdit,
  deleteJob: jobs.deleteJob,
  closeJob: jobs.closeJob,
  getJobInit: jobs.getJobInit,
  getJobAddPageData: jobs.getJobAddPageData,
  getJobBillsWithProducts: jobs.getJobBillsWithProducts,
  getJobPrintData: jobs.getJobPrintData,
  getTripRoutePlan: jobs.getTripRoutePlan,
  getDeliveryLocationReport: deliveryAudit.getDeliveryLocationReport,

  // POD — ຫຼັກຖານການສົ່ງ (ຮູບ · ລາຍເຊັນ · GPS)
  getPodTrackingReport: pod.getPodTrackingReport,
  getPodLiveFeed: pod.getPodLiveFeed,
  getPodBillProof: pod.getPodBillProof,

  getSuggestedTrips: tripSuggest.getSuggestedTrips,
  addBillToDraft: jobs.addBillToDraft,
  removeBillFromDraft: jobs.removeBillFromDraft,
  searchBills: jobs.searchBills,
  addBillsToJob: jobs.addBillsToJob,
  searchBillsForJob: jobs.searchBillsForJob,
  getJobsClosedByDriver: jobs.getJobsClosedByDriver,
  getJobsClosed: jobs.getJobsClosed,
  getJobsWaitingReceive: jobs.getJobsWaitingReceive,
  getJobsWaitingPickup: jobs.getJobsWaitingPickup,
  listPickupReadyJobs: jobs.listPickupReadyJobs,
  moveBillToJob: jobs.moveBillToJob,
  reclassifyDeliveredBillToBranch: jobs.reclassifyDeliveredBillToBranch,

  // Bills
  getAvailableBills: bills.getAvailableBills,
  getAvailableBillsWithProducts: bills.getAvailableBillsWithProducts,
  getAvailableBillProducts: bills.getAvailableBillProducts,
  getBillItemsByWarehouse: bills.getBillItemsByWarehouse,
  getBillRemainingItemsByWarehouse: bills.getBillRemainingItemsByWarehouse,
  dispatchBillRemainingByBranch: bills.dispatchBillRemainingByBranch,
  searchManualPendingBills: bills.searchManualPendingBills,
  addManualPendingBill: bills.addManualPendingBill,
  createCustomPendingBill: bills.createCustomPendingBill,
  removeManualPendingBill: bills.removeManualPendingBill,
  getBillsPending: bills.getBillsPending,
  updateBillTransport: bills.updateBillTransport,
  sendBillContactLine: bills.sendBillContactLine,
  getBillProducts: bills.getBillProducts,
  getBillsWaitingSent: bills.getBillsWaitingSent,
  getBillsWaitingSentDetails: bills.getBillsWaitingSentDetails,
  getBillsInProgress: bills.getBillsInProgress,
  getBillCompleteList: bills.getBillCompleteList,
  getBillsCancelledList: bills.getBillsCancelledList,
  getBillsPartialList: bills.getBillsPartialList,
  getPendingBillSchedule: bills.getPendingBillSchedule,
  getPendingBillScheduleHistory: bills.getPendingBillScheduleHistory,
  getBillDeliveryHistory: bills.getBillDeliveryHistory,
  upsertPendingBillSchedule: bills.upsertPendingBillSchedule,
  bulkUpdatePendingBills: bills.bulkUpdatePendingBills,
  setPendingBillLocation: bills.setPendingBillLocation,
  getBillTodos: bills.getBillTodos,
  getAllBillTodos: bills.getAllBillTodos,
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
  getReportMonthlyDelivery: reports.getReportMonthlyDelivery,
  getMonthlyDeliveryKpi: reports.getMonthlyDeliveryKpi,
  getDeliveryPerformance: reports.getDeliveryPerformance,
  getReportPendingDaily: reports.getReportPendingDaily,
  getReportDeliveredDaily: reports.getReportDeliveredDaily,
  getReportCancelledDaily: reports.getReportCancelledDaily,
  getReportDailyActivity: reports.getReportDailyActivity,
  getReportDailyActivityBills: reports.getReportDailyActivityBills,
  getReportDailyActivityItems: reports.getReportDailyActivityItems,
  getReportDailyDepartment: reports.getReportDailyDepartment,
  getAttemptDeliveryItems: reports.getAttemptDeliveryItems,

  // Cars
  getCars: masterData.getCars,
  addCar: masterData.addCar,
  updateCar: masterData.updateCar,
  deleteCar: masterData.deleteCar,
  getCarDefaults: masterData.getCarDefaults,
  getCarProfiles: masterData.getCarProfiles,
  getCarCapacity: masterData.getCarCapacity,
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
  setWorkerProfile: masterData.setWorkerProfile,
  getWorkerDispatchBranches: masterData.getWorkerDispatchBranches,
  setWorkerDispatchBranches: masterData.setWorkerDispatchBranches,
  getTransportBranches: masterData.getTransportBranches,

  // Warehouse workers
  getWarehouseWorkers: masterData.getWarehouseWorkers,
  addWarehouseWorker: masterData.addWarehouseWorker,
  updateWarehouseWorker: masterData.updateWarehouseWorker,
  deleteWarehouseWorker: masterData.deleteWarehouseWorker,

  // Tracking
  trackBill: tracking.trackBill,
  getSalesBillTrackingList: tracking.getSalesBillTrackingList,
  getSalesDeliveredBillTrackingList: tracking.getSalesDeliveredBillTrackingList,
  trackSalesBill: tracking.trackSalesBill,
  searchActiveDeliveryBills: tracking.searchActiveDeliveryBills,
  getGpsRealtime: tracking.getGpsRealtime,
  getGpsRealtimeAll: tracking.getGpsRealtimeAll,
  getGpsRealtimeAllLive: tracking.getGpsRealtimeAllLive,
  getGpsRealtimeAllLean: tracking.getGpsRealtimeAllLean,
  getLocations: tracking.getLocations,
  getPhoneTrackingJobs: tracking.getPhoneTrackingJobs,
  getPhoneFleet: tracking.getPhoneFleet,
  getPhoneTrail: tracking.getPhoneTrail,
  getDailyOpenedBillsForSales: tracking.getDailyOpenedBillsForSales,
  getSalesTransportBranches: tracking.getSalesTransportBranches,
  saveSalesBillSchedule: tracking.saveSalesBillSchedule,

  // Geofence (per-branch start/end points)
  getGeofences: geofence.getGeofences,
  saveGeofenceConfig: geofence.saveGeofenceConfig,

  // GPS
  getGpsObjectList: gps.getGpsObjectList,
  getGpsCars: gps.getGpsCars,
  syncGpsDay: gps.syncGpsDay,
  syncGpsRange: gps.syncGpsRange,
  getGpsUsageSummary: gps.getGpsUsageSummary,
  getGpsUsageSummaryCached: gps.getGpsUsageSummaryCached,
  getGpsUsageDaily: gps.getGpsUsageDaily,
  getGpsUsageDailyCached: gps.getGpsUsageDailyCached,
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

  // ThunJai Express integration
  getThunJaiSettings: thunjai.getThunJaiSettings,
  saveThunJaiSettings: thunjai.saveThunJaiSettings,
  testThunJaiToken: thunjai.testThunJaiToken,
  listThunJaiOrders: thunjai.listThunJaiOrders,
  listThunJaiSenderAddresses: thunjai.listThunJaiSenderAddresses,
  listThunJaiPackaging: thunjai.listThunJaiPackaging,
  listThunJaiProvinces: thunjai.listThunJaiProvinces,
  listThunJaiDistricts: thunjai.listThunJaiDistricts,
  listThunJaiVillages: thunjai.listThunJaiVillages,
  searchThunJaiSourceProducts: thunjai.searchThunJaiSourceProducts,
  checkThunJaiServiceType: thunjai.checkThunJaiServiceType,
  estimateThunJaiPrice: thunjai.estimateThunJaiPrice,
  createThunJaiOrder: thunjai.createThunJaiOrder,
  deleteThunJaiOrder: thunjai.deleteThunJaiOrder,
  getThunJaiOrderDetail: thunjai.getThunJaiOrderDetail,
  getThunJaiOrderTracking: thunjai.getThunJaiOrderTracking,
  getThunJaiOrderLabel: thunjai.getThunJaiOrderLabel,
  listThunJaiPickups: thunjai.listThunJaiPickups,
  requestThunJaiPickup: thunjai.requestThunJaiPickup,
  getThunJaiPickupDetail: thunjai.getThunJaiPickupDetail,

  // Notifications
  getActivityNotifications: notifications.getActivityNotifications,
  markActivityNotificationRead: notifications.markActivityNotificationRead,
  markAllActivityNotificationsRead: notifications.markAllActivityNotificationsRead,

  // Delivery rounds
  listDeliveryRounds: deliveryRound.listDeliveryRounds,
  getDeliveryRound: deliveryRound.getDeliveryRound,
  upsertDeliveryRound: deliveryRound.upsertDeliveryRound,
  deleteDeliveryRound: deliveryRound.deleteDeliveryRound,

  // Car types (ປະເພດລົດ) — ລວມຄວາມຈຸບັນທຸກເລີ່ມຕົ້ນຂອງແຕ່ລະປະເພດ
  listCarTypes: carType.listCarTypes,
  upsertCarType: carType.upsertCarType,
  deleteCarType: carType.deleteCarType,

  // ຂະໜາດທໍ່ຕາມສູດ — ໃຊ້ຄິດພື້ນທີ່ທໍ່ໂດຍບໍ່ຕ້ອງວັດເປັນລາຍການ
  listPipeDims: pipeDim.listPipeDims,
  upsertPipeDim: pipeDim.upsertPipeDim,
  deletePipeDim: pipeDim.deletePipeDim,
  getPipeCoverage: pipeDim.getPipeCoverage,
  resolvePipeItemVolumes: pipeDim.resolvePipeItemVolumes,

  // ຂະໜາດຫີບທີ່ວັດແລ້ວ — ຂໍ້ຕໍ່/ອຸປະກອນ ວັດຫີບແທນວັດຕົວ
  listPackDims: packDim.listPackDims,
  upsertPackDim: packDim.upsertPackDim,
  importPackDims: packDim.importPackDims,
  deletePackDim: packDim.deletePackDim,
  getPackCoverage: packDim.getPackCoverage,
  resolvePackItemVolumes: packDim.resolvePackItemVolumes,

  // Chatter (Odoo-style discussion thread + activities + followers)
  getChatterMessages: chatter.getChatterMessages,
  getChatterBundle: chatter.getChatterBundle,
  postChatterMessage: chatter.postChatterMessage,
  editChatterMessage: chatter.editChatterMessage,
  deleteChatterMessage: chatter.deleteChatterMessage,
  getChatterFollowers: chatter.getChatterFollowers,
  toggleChatterFollower: chatter.toggleChatterFollower,
  getChatterActivities: chatter.getChatterActivities,
  scheduleChatterActivity: chatter.scheduleChatterActivity,
  completeChatterActivity: chatter.completeChatterActivity,
  deleteChatterActivity: chatter.deleteChatterActivity,
  getChatterUsers: chatter.getChatterUsers,
  markChatterRead: chatter.markChatterRead,
  getUnreadChatterCounts: chatter.getUnreadChatterCounts,
  getInboxConversations: chatter.getInboxConversations,
  getDmPeople: chatter.getDmPeople,
  getDmPeerRead: chatter.getDmPeerRead,

  // Delivery route master
  listDeliveryRoutes: deliveryRoute.listDeliveryRoutes,
  getDeliveryRoute: deliveryRoute.getDeliveryRoute,
  upsertDeliveryRoute: deliveryRoute.upsertDeliveryRoute,
  listRouteStopSuggestions: deliveryRoute.listRouteStopSuggestions,
  getDrivingRoute: routing.getDrivingRoute,
  deleteDeliveryRoute: deliveryRoute.deleteDeliveryRoute,

  // Delivery calendar (ປະຕິທິນຈັດສົ່ງ)
  getDeliveryCalendar: deliveryCalendar.getDeliveryCalendar,
  getDeliveryCalendarDay: deliveryCalendar.getDeliveryCalendarDay,
};

export const Auth = {
  login: auth.login,
  logout: auth.logout,
  me: auth.me,
  heartbeat: presence.heartbeat,
};
