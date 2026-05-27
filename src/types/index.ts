export interface VehicleOption {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeOption {
  code: string;
  name: string;
}

export type InspectionOptionType = "vehicle" | "employee" | "driver";

export type ChecklistStatus = "Passed" | "Failed";
export type ChecklistSeverity = "Low" | "Medium" | "High" | "Stop";
export type ChecklistPhotoType = "front" | "side" | "odometer" | "problem";

export interface DailyChecklistInput {
  vehicleId: string;
  checkDate?: string;
  inspectorName: string;
  currentOdometer: number;
  engineOil: boolean;
  coolant: boolean;
  frontLeftTire: boolean;
  frontRightTire: boolean;
  rearLeftTire: boolean;
  rearRightTire: boolean;
  brakes: boolean;
  headLights: boolean;
  tailLights: boolean;
  turnSignals: boolean;
  battery: boolean;
  severity?: ChecklistSeverity;
  canOperate?: boolean;
  photoType: ChecklistPhotoType;
  vehiclePhotoData?: string;
  remarks?: string;
}

export interface DailyChecklist extends DailyChecklistInput {
  id: number;
  status: ChecklistStatus;
  vehicleName?: string;
  hasVehiclePhoto?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InspectItem {
  item_code: string;
  item_name: string;
  sort_order: number;
}

export interface InspectStatus {
  status_code: number;
  status_name: string;
}

export interface InspectionDetailInput {
  item_code: string;
  status_code: number;
}

export interface InspectionInput {
  vehicle_code: string;
  inspect_date: string;
  inspect_time?: string;
  driver_code?: string;
  employee_code: string;
  odometer?: number;
  note?: string;
  details: InspectionDetailInput[];
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Inspection {
  inspect_code: string;
  vehicle_code: string;
  vehicle_name?: string;
  year: number;
  month: number;
  inspect_date: string;
  inspect_time?: string;
  driver_code?: string;
  driver_name?: string;
  employee_code: string;
  employee_name?: string;
  odometer?: number;
  note?: string;
  detail_count?: number;
  overall_status?: 'normal' | 'warning' | 'critical';
  created_at: string;
  approval_status: ApprovalStatus;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  approval_note?: string;
}

export interface InspectionSummary {
  inspected_today: number;
  vehicles_with_issues: number;
  total_vehicles: number;
  pending_approval: number;
}

export interface InspectionDetailItem {
  item_name: string;
  status_name: string;
}
