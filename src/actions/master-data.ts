"use server";

import { requireSession } from "./_helpers";
import {
  getCars as svcGetCars,
  addCar as svcAddCar,
  updateCar as svcUpdateCar,
  deleteCar as svcDeleteCar,
  getCarDefaults as svcGetCarDefaults,
  getCarProfiles as svcGetCarProfiles,
  getCarCapacity as svcGetCarCapacity,
  addCarProfile as svcAddCarProfile,
  updateCarProfile as svcUpdateCarProfile,
  deleteCarProfile as svcDeleteCarProfile,
  getDrivers as svcGetDrivers,
  addDriver as svcAddDriver,
  updateDriver as svcUpdateDriver,
  deleteDriver as svcDeleteDriver,
  getDispatchDrivers as svcGetDispatchDrivers,
  getDispatchWorkers as svcGetDispatchWorkers,
  getDispatchWorkersWithBranch as svcGetDispatchWorkersWithBranch,
  setWorkerBranch as svcSetWorkerBranch,
  setWorkerProfile as svcSetWorkerProfile,
  getWorkerDispatchBranches as svcGetWorkerDispatchBranches,
  setWorkerDispatchBranches as svcSetWorkerDispatchBranches,
  getTransportBranches as svcGetTransportBranches,
  getWarehouseWorkers as svcGetWarehouseWorkers,
  addWarehouseWorker as svcAddWarehouseWorker,
  updateWarehouseWorker as svcUpdateWarehouseWorker,
  deleteWarehouseWorker as svcDeleteWarehouseWorker,
} from "@/queries/master-data.js";

// Cars
export async function getCars() {
  await requireSession();
  return svcGetCars();
}
export async function addCar(code: string, name_1: string) {
  await requireSession();
  return svcAddCar(code, name_1);
}
export async function updateCar(code: string, name_1: string) {
  await requireSession();
  return svcUpdateCar(code, name_1);
}
export async function deleteCar(code: string) {
  await requireSession();
  return svcDeleteCar(code);
}
export async function getCarDefaults(carCode: string) {
  await requireSession();
  return svcGetCarDefaults(carCode);
}
export async function getCarProfiles() {
  await requireSession();
  return svcGetCarProfiles();
}
export async function getCarCapacity(carCode: string) {
  await requireSession();
  return svcGetCarCapacity(carCode);
}
export async function addCarProfile(data: unknown) {
  const s = await requireSession();
  return svcAddCarProfile(s, data);
}
export async function updateCarProfile(data: unknown) {
  const s = await requireSession();
  return svcUpdateCarProfile(s, data);
}
export async function deleteCarProfile(code: string) {
  await requireSession();
  return svcDeleteCarProfile(code);
}

// Drivers
export async function getDrivers() {
  await requireSession();
  return svcGetDrivers();
}
export async function addDriver(code: string, name_1: string) {
  await requireSession();
  return svcAddDriver(code, name_1);
}
export async function updateDriver(code: string, name_1: string) {
  await requireSession();
  return svcUpdateDriver(code, name_1);
}
export async function deleteDriver(code: string) {
  await requireSession();
  return svcDeleteDriver(code);
}
export async function getDispatchDrivers() {
  const s = await requireSession();
  return svcGetDispatchDrivers(s);
}
export async function getDispatchWorkers() {
  const s = await requireSession();
  return svcGetDispatchWorkers(s);
}
export async function getDispatchWorkersWithBranch() {
  await requireSession();
  return svcGetDispatchWorkersWithBranch();
}
export async function setWorkerBranch(
  workerCode: string,
  transportCode: string | null
) {
  const s = await requireSession();
  return svcSetWorkerBranch(s, workerCode, transportCode);
}
export async function setWorkerProfile(
  workerCode: string,
  transportCode: string | null,
  positionCode: string | null
) {
  const s = await requireSession();
  return svcSetWorkerProfile(s, workerCode, transportCode, positionCode);
}
export async function getWorkerDispatchBranches(workerCode: string) {
  await requireSession();
  return svcGetWorkerDispatchBranches(workerCode);
}
export async function setWorkerDispatchBranches(
  workerCode: string,
  transportCodes: string[]
) {
  const s = await requireSession();
  return svcSetWorkerDispatchBranches(s, workerCode, transportCodes);
}
export async function getTransportBranches() {
  await requireSession();
  return svcGetTransportBranches();
}

// Warehouse workers
export async function getWarehouseWorkers() {
  await requireSession();
  return svcGetWarehouseWorkers();
}
export async function addWarehouseWorker(code: string, name_1: string) {
  await requireSession();
  return svcAddWarehouseWorker(code, name_1);
}
export async function updateWarehouseWorker(code: string, name_1: string) {
  await requireSession();
  return svcUpdateWarehouseWorker(code, name_1);
}
export async function deleteWarehouseWorker(code: string) {
  await requireSession();
  return svcDeleteWarehouseWorker(code);
}
