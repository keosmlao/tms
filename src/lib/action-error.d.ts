// Types ຂອງ action-error.js (runtime ຢູ່ .js ເພາະ src/queries/*.js ເປັນ CommonJS)

/** ຄຳນຳໜ້າ digest ທີ່ໝາຍວ່າ digest ນັ້ນຄືຂໍ້ຄວາມສຳລັບຜູ້ໃຊ້. */
export declare const USER_ERROR_DIGEST_PREFIX: string;

/**
 * ຂໍ້ຜິດພາດ "ຜູ້ໃຊ້ອ່ານໄດ້" — ຝາກ message ໄປກັບ digest ເພື່ອໃຫ້ລອດຜ່ານການ
 * ລົບຂໍ້ຄວາມຂອງ Next ຢູ່ production. ໃຊ້ຄູ່ກັບ userErrorMessage() ຝັ່ງ client.
 */
export declare function userError(message: string): Error;

/** true ຖ້າ error ນີ້ຖືກສ້າງດ້ວຍ userError(). */
export declare function isUserError(error: unknown): boolean;

/** ຂໍ້ຄວາມລາວທີ່ຝາກມາກັບ digest, ຫຼື null ຖ້າບໍ່ແມ່ນ digest ຂອງ userError(). */
export declare function decodeUserErrorDigest(digest: unknown): string | null;

/** ຂໍ້ຄວາມທີ່ຄວນສະແດງໃຫ້ຜູ້ໃຊ້ ຈາກ error ທີ່ catch ມາ (ໃຊ້ໄດ້ທັງ dev ແລະ prod). */
export declare function userErrorMessage(error: unknown, fallback: string): string;
