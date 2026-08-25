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

/**
 * ປິດການບີບຂະຫຍາຍ (pinch-zoom) ຂອງໜ້າເວັບ ໃນ browser ທີ່ບໍ່ສົນໃຈ meta viewport.
 *
 * ⚠️ ຍົກເວັ້ນແຜນທີ່: Leaflet ຈັດການການບີບຂອງມັນເອງດ້ວຍ touch event ບໍ່ແມ່ນ
 * `gesture*` ຈຶ່ງບໍ່ຖືກກັນຢູ່ແລ້ວ — ແຕ່ປ່ອຍຜ່ານໃຫ້ຊັດເຈນໄວ້ ເພື່ອບໍ່ໃຫ້ຮອບ
 * ຕໍ່ໄປມາຕັດການຊູມແຜນທີ່ຖິ້ມໂດຍບໍ່ຕັ້ງໃຈ.
 */
export function DisablePageZoom() {
  useEffect(() => {
    const blockPageZoom = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".leaflet-container")) return;
      event.preventDefault();
    };

    // passive: false ຈຳເປັນ ບໍ່ດັ່ງນັ້ນ preventDefault() ຈະຖືກເມີນເສີຍ.
    for (const name of WEBKIT_GESTURE_EVENTS) {
      document.addEventListener(name, blockPageZoom, { passive: false });
    }
    return () => {
      for (const name of WEBKIT_GESTURE_EVENTS) {
        document.removeEventListener(name, blockPageZoom);
      }
    };
  }, []);

  return null;
}
