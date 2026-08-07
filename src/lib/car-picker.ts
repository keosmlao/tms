/**
 * Which vehicles may be dispatched on a trip, and from where.
 *
 * The trip form used to list every row in `odg_tms_car`, so yard equipment
 * (Forklift) and other branches' trucks sat in the same dropdown as the ones
 * the dispatcher can actually send.
 */

export interface CarOption {
  code: string;
  name_1: string;
  /** Type name as set on the vehicle; '' when never classified. */
  car_type?: string;
  /** Branch the vehicle belongs to; '' when never assigned. */
  transport_code?: string;
  /** Server-side: the vehicle's type exists in the car-type master. */
  is_delivery?: boolean;
}

/**
 * A delivery vehicle is one whose type is a configured vehicle class. Forklifts
 * and other yard equipment carry no such type.
 *
 * Rows from an older API without the flag are kept — hiding a dispatcher's
 * whole fleet because the server hasn't been deployed yet would be far worse
 * than showing one forklift.
 */
export function isDeliveryVehicle(car: CarOption): boolean {
  if (car.is_delivery === undefined) return true;
  return car.is_delivery;
}

/**
 * Vehicles the dispatcher may pick for a trip out of [branch].
 *
 * - Equipment that isn't a delivery vehicle is dropped.
 * - With a branch chosen, only that branch's vehicles remain — plus any vehicle
 *   with no branch on record. Those unassigned trucks are real and still get
 *   dispatched; dropping them would silently make them unbookable, and the fix
 *   (set the branch on the vehicle) lives on another page.
 * - With no branch chosen yet (a manager who hasn't picked), everything
 *   dispatchable is offered.
 */
export function dispatchableCars(
  cars: CarOption[],
  branch: string
): CarOption[] {
  const wanted = branch.trim();
  return cars.filter((car) => {
    if (!isDeliveryVehicle(car)) return false;
    if (!wanted) return true;
    const own = (car.transport_code ?? "").trim();
    return own === "" || own === wanted;
  });
}

/** True when the vehicle is offered only because no branch is recorded for it
 *  — the UI marks these so the gap is visible and fixable. */
export function isUnassignedToBranch(car: CarOption): boolean {
  return (car.transport_code ?? "").trim() === "";
}

/** Free-text match over the visible fields, used by the search dropdown. */
export function matchesCarSearch(car: CarOption, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    car.name_1.toLowerCase().includes(needle) ||
    car.code.toLowerCase().includes(needle)
  );
}
