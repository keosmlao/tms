// ຮູບແຖວຂອງຕົ້ນທຶນຂົນສົ່ງ — ແຍກອອກຈາກ actions/trip-cost.ts ເພາະໄຟລ໌ "use server"
// re-export type ບໍ່ໄດ້ (ເບິ່ງໝາຍເຫດຢູ່ຫົວ actions/fuel.ts).

export interface TripCostRow {
  id: number;
  /** YYYY-MM-DD */
  cost_date: string;
  /** ເບິ່ງ @/lib/trip-cost-type */
  cost_type: string;
  amount: number;
  car: string;
  car_name: string;
  doc_no: string;
  driver: string;
  transport_code: string;
  note: string;
  created_by: string;
  created_at: string;
}

export interface TripCostByType {
  cost_type: string;
  entries: number;
  amount: number;
}

export interface TripCostSummary {
  total: number;
  entries: number;
  by_type: TripCostByType[];
}
