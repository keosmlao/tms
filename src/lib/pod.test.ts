import { describe, expect, it } from "vitest";
import {
  podAgoLabel,
  podConditionLabel,
  podMissingParts,
  podPercent,
  podProofImages,
  podRequiredParts,
  podState,
  type PodFlags,
  type PodProof,
} from "./pod";

const flags = (over: Partial<PodFlags> = {}): PodFlags => ({
  has_photo: true,
  has_signature: true,
  has_gps: true,
  ...over,
});

describe("podRequiredParts", () => {
  it("ຄ່າເລີ່ມຕົ້ນ ບັງຄັບແຕ່ ຮູບ + GPS (ລາຍເຊັນຍັງເກັບບໍ່ທົ່ວ)", () => {
    expect(podRequiredParts("to_customer")).toEqual(["photo", "gps"]);
  });

  it("ເປີດບັງຄັບລາຍເຊັນ ຈຶ່ງເພີ່ມສະເພາະບິນສົ່ງລູກຄ້າ", () => {
    expect(podRequiredParts("to_customer", true)).toEqual(["photo", "signature", "gps"]);
    for (const c of ["to_branch", "to_carrier", "to_bus"]) {
      expect(podRequiredParts(c, true)).toEqual(["photo", "gps"]);
    }
  });
});

describe("podState", () => {
  it("ຄົບເມື່ອມີຄົບທຸກອັນທີ່ບັງຄັບ", () => {
    expect(podState(flags(), "to_customer")).toBe("complete");
  });

  it("ບໍ່ມີລາຍເຊັນ ຍັງນັບວ່າຄົບ ຕາມຄ່າເລີ່ມຕົ້ນ", () => {
    const f = flags({ has_signature: false });
    expect(podState(f, "to_customer")).toBe("complete");
    expect(podMissingParts(f, "to_customer")).toEqual([]);
  });

  it("ບິນຝາກສາຂາທີ່ບໍ່ມີລາຍເຊັນ ຍັງຄົບ ເຖິງເປີດບັງຄັບແລ້ວ", () => {
    const f = flags({ has_signature: false });
    expect(podState(f, "to_branch", true)).toBe("complete");
    expect(podMissingParts(f, "to_branch", true)).toEqual([]);
  });

  it("ເປີດບັງຄັບ: ຂາດລາຍເຊັນຢູ່ບິນສົ່ງລູກຄ້າ = ຂາດບາງສ່ວນ", () => {
    const f = flags({ has_signature: false });
    expect(podState(f, "to_customer", true)).toBe("partial");
    expect(podMissingParts(f, "to_customer", true)).toEqual(["signature"]);
  });

  it("ຂາດຮູບແຕ່ມີ GPS = ຂາດບາງສ່ວນ", () => {
    expect(podState(flags({ has_photo: false }), "to_customer")).toBe("partial");
  });

  it("ຂາດໝົດທຸກອັນທີ່ບັງຄັບ = ບໍ່ມີຫຼັກຖານ", () => {
    const empty = flags({ has_photo: false, has_signature: false, has_gps: false });
    expect(podState(empty, "to_customer")).toBe("none");
    expect(podState(empty, "to_customer", true)).toBe("none");
    // ບໍ່ບັງຄັບລາຍເຊັນ: ຂາດຮູບ + GPS ກໍຄື "ຂາດໝົດ" ແລ້ວ
    expect(podState(flags({ has_photo: false, has_gps: false }), "to_branch")).toBe("none");
  });

  it("ບິນເກົ່າທີ່ບໍ່ມີເງື່ອນໄຂ ຖືເປັນສົ່ງລູກຄ້າ ຕາມ fallback ຂອງ SQL", () => {
    expect(podConditionLabel("")).toBe("ສົ່ງລູກຄ້າ");
  });
});

describe("podAgoLabel", () => {
  it("ໜ້ອຍກວ່ານາທີ = ຫາກໍປິດ", () => {
    expect(podAgoLabel(12)).toBe("ຫາກໍປິດ");
  });

  it("ນາທີ ແລະ ຊົ່ວໂມງ", () => {
    expect(podAgoLabel(300)).toBe("5 ນາທີກ່ອນ");
    expect(podAgoLabel(3900)).toBe("1 ຊມ. 5 ນທ. ກ່ອນ");
  });

  it("ເກີນມື້", () => {
    expect(podAgoLabel(90_000)).toBe("1 ມື້ກ່ອນ");
  });

  it("ຄ່າຕິດລົບ (ໂມງ server/DB ບໍ່ກົງ) ບໍ່ໃຫ້ອອກມາເປັນລົບ", () => {
    expect(podAgoLabel(-30)).toBe("ຫາກໍປິດ");
  });
});

describe("podProofImages", () => {
  const proof = (over: Partial<PodProof>): PodProof =>
    ({
      delivery_images: [],
      url_img: "",
      sight_img: "",
      recipt_img: "",
      recipt_sign_img: "",
      ...over,
    }) as PodProof;

  it("ຮູບສົ່ງມາກ່ອນ ແລ້ວຄ່ອຍຮູບຫຼັກ/ລາຍເຊັນ", () => {
    const out = podProofImages(
      proof({ delivery_images: ["a", "b"], url_img: "c", sight_img: "d" })
    );
    expect(out.map((i) => i.src)).toEqual(["a", "b", "c", "d"]);
    expect(out[0].label).toBe("ຮູບສົ່ງ 1");
  });

  it("ຮູບຊ້ຳ (url_img ຖືກເກັບເປັນ delivery image ນຳ) ຂຶ້ນເທື່ອດຽວ", () => {
    const out = podProofImages(proof({ delivery_images: ["a"], url_img: "a" }));
    expect(out).toHaveLength(1);
  });

  it("ບິນທີ່ບໍ່ມີຮູບເລີຍ ໄດ້ລາຍການວ່າງ", () => {
    expect(podProofImages(proof({}))).toEqual([]);
  });
});

describe("podPercent", () => {
  it("ຄິດເປີເຊັນປົກກະຕິ", () => {
    expect(podPercent(41, 50)).toBe(82);
  });

  it("ໂຕຫານ 0 ໃຫ້ 0 ບໍ່ແມ່ນ NaN", () => {
    expect(podPercent(0, 0)).toBe(0);
  });
});
