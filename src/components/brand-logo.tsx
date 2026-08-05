/**
 * ໂລໂກ້ ODIEN Mall — ບັງຄັບກົດການໃຊ້ຕາມ Brand Guideline ໜ້າ 8-9 ໄວ້ບ່ອນດຽວ:
 *
 *  · ເວີຊັນ 3 ສີ ໃຊ້ໄດ້ "ສະເພາະພື້ນຂາວ" → variant "auto" ຈຶ່ງຫຸ້ມດ້ວຍກ່ອງຂາວສະເໝີ
 *  · ພື້ນເຂັ້ມ ໃຫ້ໃຊ້ເວີຊັນຂາວລ້ວນ (ໜ້າ 11) → variant "white"
 *  · ພື້ນແຈ້ງທີ່ບໍ່ແມ່ນຂາວສະນິດ ໃຫ້ໃຊ້ເວີຊັນສີດຽວ (ໜ້າ 12) → variant "navy"
 *  · ຫ້າມບີບ/ຢຶດ/ໝຸນ → ກຳນົດແຕ່ຄວາມສູງ ແລ້ວປ່ອຍ w-auto ສະເໝີ
 *  · ຫ້າມເພີ່ມເງົາ/gradient/ຂອບ/ລວດລາຍ → ບໍ່ມີ class ປະເພດນັ້ນຢູ່ນີ້
 *
 * ໄຟລ໌ຕົ້ນສະບັບດຶງມາຈາກ Brand Guideline PDF ໂດຍກົງ (ໜ້າ 10-12).
 */
type BrandLogoProps = {
  /** "auto" = 3 ສີເທິງກ່ອງຂາວ (ໂໝດແຈ້ງ) ແລະ ຂາວລ້ວນ (ໂໝດມືດ) */
  variant?: "auto" | "white" | "navy";
  /** ກຳນົດແຕ່ຄວາມສູງ ເຊັ່ນ "h-8" — ຄວາມກວ້າງຄິດໄລ່ເອງເພື່ອຮັກສາອັດຕາສ່ວນ */
  className?: string;
};

export function BrandLogo({ variant = "auto", className = "h-8" }: BrandLogoProps) {
  if (variant !== "auto") {
    const src = variant === "white" ? "odien-logo-white" : "odien-logo-navy";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/brand/${src}.png`} alt="ODIEN Mall" className={`w-auto ${className}`} />
    );
  }

  return (
    <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 dark:bg-transparent dark:p-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/odien-logo.png"
        alt="ODIEN Mall"
        className={`block w-auto dark:hidden ${className}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/odien-logo-white.png"
        alt=""
        aria-hidden
        className={`hidden w-auto dark:block ${className}`}
      />
    </span>
  );
}
