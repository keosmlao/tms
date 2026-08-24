-- ຜູກສາຂາໃຫ້ລົດ ແລະ ພະນັກງານ ທີ່ຍັງບໍ່ມີສາຂາ — 2026-08-24
--
-- ເກນ: "ຂົນບິນຈາກສາງໃດ ໃຫ້ເອົາເຂົ້າສາຂານັ້ນ"
--
-- ເປັນຫຍັງຕ້ອງເຮັດ: ທຸກລາຍງານທີ່ກັ່ນຕອງຕາມສາຂາ ຖິ້ມແຖວທີ່ transport_code ຫວ່າງ
-- ຖິ້ມແບບງຽບໆ. ຜົນຄື ລົດ 6 ຄັນນີ້ແລ່ນ 4,375 ກມ ໃນເດືອນ 08/2026 ແຕ່ບໍ່ຂຶ້ນໃນ
-- ລາຍງານໃດເລີຍ (ກມ ທັງກອງລົດ 21,190 — ເຫັນພຽງ 16,814).
--
-- ═══ ພາກ 1: ລົດ ═══
-- ລົດ 6 ຄັນນີ້ບໍ່ເຄີຍຂົນບິນຜ່ານ TMS ຈັກໃບ (0 ບິນທັງປີ) ຈຶ່ງອ່ານ "ສາງ" ຈາກ
-- ບ່ອນທີ່ມັນຈອດກາງຄືນແທນ: ຄ່າກາງ (median) ຂອງພິກັດ GPS ຊ່ວງ 23:00–05:00
-- ຄວາມໄວ < 3 ກມ/ຊມ ຍ້ອນຫຼັງ 45 ວັນ ທຽບກັບຈຸດສາງທີ່ getBranchOrigins() ຄິດໄວ້
-- (ຄ່າກາງຂອງ odg_tms.lat_start/lng_start ຂອງແຕ່ລະສາຂາ).
--
--   ລົດ        ຄືນທີ່ວັດ   ສາງທີ່ໃກ້ສຸດ   ຫ່າງ     ສາງຖັດໄປ
--   ກຍ4899     46         02-0001         5 ແມັດ   02-0007 2.7 ກມ
--   ກຮ6264     29         02-0001        64 ແມັດ   02-0007 2.6 ກມ
--   ກຍ 0364    46         02-0002        45 ແມັດ   02-0007 10.6 ກມ
--   ກນ9855     46         02-0002        40 ແມັດ   02-0007 10.6 ກມ
--   ກນ4458     45         02-0002        32 ແມັດ   02-0007 10.6 ກມ
--   ກບ3646     29         02-0002        50 ແມັດ   02-0007 10.6 ກມ
--
-- ບໍ່ແຕະ 'Forklift' (code 0000): ບໍ່ມີ GPS ແລະ ບໍ່ແມ່ນລົດຂົນສົ່ງ.

BEGIN;

UPDATE public.odg_tms_car SET transport_code = '02-0001'
 WHERE code IN ('ກຍ4899', 'ກຮ6264')
   AND COALESCE(NULLIF(TRIM(transport_code), ''), '') = '';

UPDATE public.odg_tms_car SET transport_code = '02-0002'
 WHERE code IN ('0364', 'ກນ9855', 'ກນ4458', 'ກບ3646')
   AND COALESCE(NULLIF(TRIM(transport_code), ''), '') = '';

-- ═══ ພາກ 2: ພະນັກງານ ═══
-- 3 ຄົນນີ້ຂັບຈິງມາເປັນຮ້ອຍຖ້ຽວແຕ່ຍັງບໍ່ມີ position_code. ດຽວນີ້ລະບົບເດົາຈາກ
-- ປະຫວັດການຂັບໃຫ້ (ເບິ່ງ getTransportDepartmentEmployees) ຈຶ່ງຍັງບໍ່ຫາຍ ແຕ່ພໍ
-- ຕັ້ງໃຫ້ຊັດແລ້ວ ຈະບໍ່ຂຶ້ນກັບການເດົາອີກ.
--
-- ສາຂາອ່ານຈາກສາງທີ່ບິນຂອງເຂົາຖືກຂົນອອກ (odg_tms_pending_bill.transport_code
-- → ic_trans_shipment.transport_code). ບໍ່ນັບ 02-0004 ເພາະນັ້ນແມ່ນ
-- "ລູກຄ້າຮັບເອງ" ບໍ່ແມ່ນສາງ:
--
--   23006 ເເສງເດືອນ ໄຊຍະປະເສີດ   02-0001 = 884 ບິນ   (02-0002 = 16)
--   25043 ຈັນທະສອນ ນ້ອຍວົງ        02-0001 = 285 ບິນ   (02-0002 = 7)
--   25011 ວົງໂພຄຳ ພັນທະວົງ        02-0002 = 858 ບິນ

INSERT INTO public.odg_tms_worker_branch (worker_code, transport_code, position_code, updated_by)
VALUES ('23006', '02-0001', 'driver', 'branch-backfill-2026-08-24'),
       ('25043', '02-0001', 'driver', 'branch-backfill-2026-08-24'),
       ('25011', '02-0002', 'driver', 'branch-backfill-2026-08-24')
ON CONFLICT (worker_code) DO UPDATE
  SET transport_code = COALESCE(NULLIF(TRIM(public.odg_tms_worker_branch.transport_code), ''),
                                EXCLUDED.transport_code),
      position_code  = COALESCE(NULLIF(TRIM(public.odg_tms_worker_branch.position_code), ''),
                                EXCLUDED.position_code),
      updated_at     = LOCALTIMESTAMP(0),
      updated_by     = EXCLUDED.updated_by;

-- ═══ ກວດຜົນກ່ອນ COMMIT ═══
-- ຄາດວ່າ: ລົດເຫຼືອ 1 ຄັນທີ່ບໍ່ມີສາຂາ (Forklift) ແລະ ພະນັກງານເຫຼືອ 4 ຄົນ
-- (ທີ່ບໍ່ເຄີຍຂັບເລີຍ ຈຶ່ງເດົາບໍ່ໄດ້ — ຕ້ອງໃຫ້ຄົນກຳນົດເອງ).
SELECT 'ລົດທີ່ຍັງບໍ່ມີສາຂາ' AS ລາຍການ, COUNT(*) AS ຈຳນວນ
  FROM public.odg_tms_car
 WHERE COALESCE(NULLIF(TRIM(transport_code), ''), '') = ''
UNION ALL
SELECT 'ພະນັກງານຂົນສົ່ງທີ່ຂໍ້ມູນບໍ່ຄົບ', COUNT(*)
  FROM public.odg_employee e
  LEFT JOIN public.odg_department d ON d.department_code = e.department_code
  LEFT JOIN public.odg_tms_worker_branch wb ON wb.worker_code = e.employee_code
 WHERE e.employment_status = 'ACTIVE'
   AND d.department_name_lo ILIKE '%ຂົນສົ່ງ%'
   AND (COALESCE(NULLIF(TRIM(wb.position_code), ''), '') = ''
     OR COALESCE(NULLIF(TRIM(wb.transport_code), ''), '') = '');

COMMIT;

-- ═══ ຄືນຄ່າເດີມ ຖ້າຕ້ອງການ ═══
-- BEGIN;
-- UPDATE public.odg_tms_car SET transport_code = NULL
--  WHERE code IN ('ກຍ4899', 'ກຮ6264', '0364', 'ກນ9855', 'ກນ4458', 'ກບ3646');
-- DELETE FROM public.odg_tms_worker_branch
--  WHERE updated_by = 'branch-backfill-2026-08-24' AND worker_code = '25011';
-- UPDATE public.odg_tms_worker_branch SET position_code = NULL
--  WHERE worker_code IN ('23006', '25043') AND updated_by = 'branch-backfill-2026-08-24';
-- COMMIT;
