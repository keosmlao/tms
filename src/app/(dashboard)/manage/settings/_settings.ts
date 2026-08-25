export interface NotifySettings {
  "line.test_enabled": string;
  "line.test_to": string;
  "line.customer.test_enabled": string;
  "line.customer.test_to": string;
  "whatsapp.test_enabled": string;
  "whatsapp.test_to": string;
  "pending.not_yet_days": string;
  "pending.erp_transfer_enabled": string;
  "app.qr_scan_verify_enabled": string;
  "app.mobile.location_tracking_enabled": string;
  "app.mobile.min_version": string;
  "app.mobile.min_version_mode": string;
  "app.mobile.force_after_trip": string;
  "app.mobile.latest_version": string;
  "app.mobile.update_url_android": string;
  "app.mobile.update_url_ios": string;
  "kpi.target_on_time_rate": string;
  "kpi.target_avg_delivery_minutes": string;
  "kpi.target_avg_close_minutes": string;
  "kpi.target_cost_per_km": string;
  "kpi.target_cost_per_trip": string;
  "kpi.target_load_pct": string;
  "kpi.alert_enabled": string;
  "kpi.alert_line_to": string;
  "fleet.alert_enabled": string;
  "fleet.parked_minutes": string;
  "fleet.left_base_metres": string;
  "fleet.speed_limit_kmh": string;
  "fleet.off_point_metres": string;
  "fleet.off_route_km": string;
  "fleet.close_reminder_minutes": string;
  "fleet.alert_line_to": string;
  "tv.pages": string;
  "tv.secs": string;
}

export const EMPTY_SETTINGS: NotifySettings = {
  "tv.pages": "1,2,3,4",
  "tv.secs": "20",
  "line.test_enabled": "",
  "line.test_to": "",
  "line.customer.test_enabled": "",
  "line.customer.test_to": "",
  "whatsapp.test_enabled": "",
  "whatsapp.test_to": "",
  "pending.not_yet_days": "3",
  "pending.erp_transfer_enabled": "1",
  "app.qr_scan_verify_enabled": "1",
  "app.mobile.location_tracking_enabled": "1",
  "app.mobile.min_version": "",
  "app.mobile.min_version_mode": "auto",
  "app.mobile.force_after_trip": "1",
  "app.mobile.latest_version": "",
  "app.mobile.update_url_android": "",
  "app.mobile.update_url_ios": "",
  "kpi.target_on_time_rate": "90",
  "kpi.target_avg_delivery_minutes": "120",
  "kpi.target_avg_close_minutes": "30",
  "kpi.target_cost_per_km": "",
  "kpi.target_cost_per_trip": "",
  "kpi.target_load_pct": "",
  "kpi.alert_enabled": "0",
  "kpi.alert_line_to": "",
  "fleet.alert_enabled": "0",
  "fleet.parked_minutes": "30",
  "fleet.left_base_metres": "500",
  "fleet.speed_limit_kmh": "80",
  "fleet.off_point_metres": "300",
  "fleet.off_route_km": "",
  "fleet.close_reminder_minutes": "20",
  "fleet.alert_line_to": "",
};

export const SETTING_TOPICS = [
  {
    key: "tv",
    title: "ຈໍ TV ຫ້ອງຈັດສົ່ງ",
    subtitle: "ເລືອກໜ້າທີ່ຈໍຈະສະແດງ ແລະ ຄວາມໄວການໝຸນ",
    icon: "chart",
    tone: "sky",
  },
  {
    key: "app",
    title: "App ຄົນຂັບ",
    subtitle: "ທົດສອບແຈ້ງເຕືອນ · ຕິດຕາມ location · ບັງຄັບອັບເດດ",
    icon: "qr",
    tone: "teal",
  },
  {
    key: "notify",
    title: "ໃຜຮັບແຈ້ງເຕືອນຫຍັງ",
    subtitle: "ກຳນົດປະເພດແຈ້ງເຕືອນທີ່ພະນັກງານແຕ່ລະຄົນຈະໄດ້ຮັບ",
    icon: "bell",
    tone: "teal",
  },
  {
    key: "geofence",
    title: "Geofence ຈຸດເລີ່ມ/ສິ້ນສຸດ",
    subtitle: "ກຳນົດຈຸດ ແລະ ໄລຍະທີ່ຄົນຂັບຕ້ອງຢູ່ ຈຶ່ງເລີ່ມ/ປິດຖ້ຽວໄດ້ (ແຍກຕາມສາຂາ)",
    icon: "map",
    tone: "sky",
  },
  {
    key: "pending",
    title: "Pending ບິນ",
    subtitle: "ກຳນົດເກນວັນສຳລັບມຸມມອງ “ຍັງບໍ່ເຖິງເວລາ”",
    icon: "cog",
    tone: "sky",
  },
  {
    key: "kpi",
    title: "KPI ການຈັດສົ່ງ",
    subtitle: "ກຳນົດເປົ້າໝາຍສຳເລັດທັນເວລາ, ເວລາສົ່ງ ແລະ ເວລາປິດຖ້ຽວ",
    icon: "chart",
    tone: "teal",
  },
  {
    key: "fleet",
    title: "ແຈ້ງເຕືອນລົດ",
    subtitle: "ເຕືອນເມື່ອລົດຈອດດົນ ຫຼື ອອກຈາກສາງແຕ່ຍັງບໍ່ກົດເລີ່ມຈັດສົ່ງ",
    icon: "map",
    tone: "amber",
  },
  {
    key: "line-sales",
    title: "LINE — ພະນັກງານຂາຍ",
    subtitle: "ຂໍ້ຄວາມສະຖານະການຈັດສົ່ງສົ່ງຫາ LINE OA ຂອງພະນັກງານຂາຍ",
    icon: "user",
    tone: "emerald",
  },
  {
    key: "line-customer",
    title: "LINE — ລູກຄ້າ",
    subtitle: "ຂໍ້ຄວາມສະຖານະການຈັດສົ່ງສົ່ງຫາ LINE OA ຂອງລູກຄ້າ",
    icon: "line",
    tone: "emerald",
  },
  {
    key: "whatsapp",
    title: "WhatsApp — ລູກຄ້າ",
    subtitle: "ຂໍ້ຄວາມຕິດຕາມການສົ່ງໄປຫາລູກຄ້າ",
    icon: "whatsapp",
    tone: "emerald",
  },
] as const;
