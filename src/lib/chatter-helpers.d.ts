// Types for chatter-helpers.js (runtime ຢູ່ .js ເພາະ query layer ເປັນ CommonJS)
export type ChatterMsgType = "note" | "comment" | "system";

export declare function normalizeMsgType(type?: string | null): ChatterMsgType;

export declare function serializeMentions(
  mentions?: string[] | string | null
): string | null;

export declare function mentionsInclude(
  csv: string | null | undefined,
  code: string
): boolean;

export declare function isSalesUser(
  input?: { emp_department_code?: string | null; title?: string | null } | null
): boolean;

export declare function isChatterAdmin(
  input?: { emp_department_code?: string | null; title?: string | null } | null
): boolean;

export declare function shouldNotifyChatter(p: {
  userCode: string;
  isAdmin: boolean;
  authorCode?: string | null;
  mentionsCsv?: string | null;
  isFollower?: boolean;
  billSaleCode?: string | null;
}): boolean;

export declare function parseDataUrl(
  dataUrl: string
): { mime: string; base64: string } | null;

export declare function collectChatterRecipients(p: {
  mentions?: string[] | string | null;
  followers?: string[];
  saleCode?: string | null;
  authorCode?: string | null;
}): string[];
