"use client";

import { useEffect } from "react";

// iOS Safari **ບໍ່ສົນໃຈ** `user-scalable=no` ໃນ meta viewport ມາຕັ້ງແຕ່ iOS 10
// — ຕັ້ງຢູ່ layout.tsx ຢ່າງດຽວຈຶ່ງປິດການບີບຂະຫຍາຍໄດ້ແຕ່ Android/Chrome ສ່ວນ
// iPhone ກັບ iPad ຍັງຊູມໄດ້ຢູ່. ທາງດຽວທີ່ເຫຼືອຄືກັນເຫດການ `gesture*` ຂອງ
// WebKit ເຊິ່ງເປັນເຫດການສະເພາະຂອງ Safari ສຳລັບການບີບສອງນິ້ວ.
const WEBKIT_GESTURE_EVENTS: string[] = [
  "gesturestart",
  "gesturechange",
  "gestureend",
];

// ປຸ່ມທີ່ browser ຜູກກັບການຊູມ. ໃຊ້ `code` ບໍ່ແມ່ນ `key` ເພາະ `key` ປ່ຽນຕາມ
// ຜັງແປ້ນພິມ (ລາວ/ອັງກິດ) ແລະ ຕາມການກົດ Shift ນຳ.
const ZOOM_KEY_CODES = new Set([
  "Equal",
  "Minus",
  "Digit0",
  "NumpadAdd",
  "NumpadSubtract",
  "Numpad0",
]);

/**
 * ປິດການຊູມໜ້າເວັບ ໃນທາງທີ່ meta viewport ກວມບໍ່ເຖິງ.
 *
 * ສາມທາງ:
 *  1. `gesture*` ຂອງ WebKit — ການບີບສອງນິ້ວຢູ່ iOS Safari (meta ຖືກເມີນ)
 *  2. Ctrl/⌘ + ລໍ້ເມົ້າ — zoom ຂອງ browser ເອງ; ກວມການບີບຢູ່ trackpad ນຳ
 *     ເພາະ Chrome/Edge/Firefox ແປງການບີບເປັນ wheel ທີ່ມີ ctrlKey
 *  3. Ctrl/⌘ + `+` / `-` / `0`
 *
 * ⚠️ ຂໍ້ຈຳກັດ: ຂໍ້ 3 ຂຶ້ນກັບ browser — ບາງ browser ຖື Ctrl +/− ເປັນທາງລັດ
 * ລະດັບໂປຣແກຣມ ທີ່ໜ້າເວັບຍົກເລີກບໍ່ໄດ້. ຂໍ້ 2 ກັນໄດ້ແນ່ນອນກວ່າ.
 *
 * ⚠️ ຍົກເວັ້ນແຜນທີ່: Leaflet ຈັດການການບີບ ແລະ ລໍ້ເມົ້າຂອງມັນເອງ (ບໍ່ໃຊ້
 * ctrlKey) ຈຶ່ງບໍ່ຖືກກັນຢູ່ແລ້ວ — ແຕ່ປ່ອຍຜ່ານ `gesture*` ໃຫ້ຊັດເຈນໄວ້ ເພື່ອ
 * ບໍ່ໃຫ້ຮອບຕໍ່ໄປມາຕັດການຊູມແຜນທີ່ຖິ້ມໂດຍບໍ່ຕັ້ງໃຈ.
 */
export function DisablePageZoom() {
  useEffect(() => {
    const blockGesture = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".leaflet-container")) return;
      event.preventDefault();
    };

    // ກັນສະເພາະຕອນກົດ Ctrl/⌘ ຄ້າງ — ການເລື່ອນລໍ້ທຳມະດາຕ້ອງໃຊ້ໄດ້ຄືເກົ່າ.
    const blockWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    const blockKeyZoom = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (ZOOM_KEY_CODES.has(event.code)) event.preventDefault();
    };

    // passive: false ຈຳເປັນ ບໍ່ດັ່ງນັ້ນ preventDefault() ຈະຖືກເມີນເສີຍ —
    // browser ຖື wheel ເປັນ passive ໂດຍປະລິຍາຍ.
    for (const name of WEBKIT_GESTURE_EVENTS) {
      document.addEventListener(name, blockGesture, { passive: false });
    }
    window.addEventListener("wheel", blockWheelZoom, { passive: false });
    window.addEventListener("keydown", blockKeyZoom);

    return () => {
      for (const name of WEBKIT_GESTURE_EVENTS) {
        document.removeEventListener(name, blockGesture);
      }
      window.removeEventListener("wheel", blockWheelZoom);
      window.removeEventListener("keydown", blockKeyZoom);
    };
  }, []);

  return null;
}
