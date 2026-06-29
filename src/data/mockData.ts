import { AlcoholTestLog, Employee } from "../types";

// Helper to create a few dates relative to today
const getDateOffset = (hoursOffset: number): string => {
  const d = new Date();
  d.setHours(d.getHours() - hoursOffset);
  return d.toISOString();
};

export const INITIAL_LOGS: AlcoholTestLog[] = [
  {
    id: "LOG-001",
    timestamp: getDateOffset(1.5),
    employeeName: "สมควร มีสติ",
    employeeId: "EMP-4012",
    department: "แผนกจัดส่งสินค้า (ขนส่ง)",
    alcoholLevel: 0,
    passLimit: 50,
    isPassed: true,
    symptoms: ["ปกติ"],
    notes: "ตรวจสภาพความพร้อมก่อนสลับกะขับขี่รถพ่วงข้ามจังหวัด",
    witness: "พ.ต.ต. ณรงค์ พลเดช",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231f2937'/><circle cx='50' cy='35' r='20' fill='%239ca3af'/><path d='M20 80c0-15 15-20 30-20s30 5 30 20' fill='%239ca3af'/><text x='50' y='90' fill='%2310b981' font-size='8' font-family='sans-serif' text-anchor='middle'>SAFE (0 mg%)</text></svg>"
  },
  {
    id: "LOG-002",
    timestamp: getDateOffset(3.2),
    employeeName: "วันชัย นอบน้อม",
    employeeId: "EMP-1085",
    department: "รักษาความปลอดภัย (รปภ.)",
    alcoholLevel: 12,
    passLimit: 50,
    isPassed: true,
    symptoms: ["ปกติ"],
    notes: "การตรวจคัดกรองพนักงาน รปภ. ก่อนกะเช้า",
    witness: "ร.ต.อ. วันชนะ ยิ่งใหญ่",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%2327272a'/><circle cx='50' cy='35' r='20' fill='%23a1a1aa'/><path d='M20 80c0-15 15-20 30-20s30 5 30 20' fill='%23a1a1aa'/><text x='50' y='90' fill='%2310b981' font-size='8' font-family='sans-serif' text-anchor='middle'>SAFE (12 mg%)</text></svg>"
  },
  {
    id: "LOG-003",
    timestamp: getDateOffset(4.8),
    employeeName: "อภิสิทธิ์ สายบันเทิง",
    employeeId: "EMP-3042",
    department: "แผนกจัดส่งสินค้า (ขนส่ง)",
    alcoholLevel: 68,
    passLimit: 50,
    isPassed: false,
    symptoms: ["ตาแดง", "มีกลิ่นสุราชัดเจน"],
    notes: "พบบุคคลต้องสงสัย หน้าแดง ตาหวาดกลัว จึงสั่งเป่าแอลกอฮอล์ระดับพรีเมียม พบเกินเกณฑ์กำหนด ส่งตัวพักงานด่วนเพื่อความปลอดภัย",
    witness: "พ.ต.ต. ณรงค์ พลเดช",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23450a0a'/><circle cx='50' cy='35' r='20' fill='%23fca5a5'/><path d='M20 80c0-15 15-20 30-20s30 5 30 20' fill='%23fca5a5'/><text x='50' y='90' fill='%23ef4444' font-size='8' font-family='sans-serif' text-anchor='middle'>WARNING (68 mg%)</text></svg>"
  }
];

export const REGISTERED_EMPLOYEES: Employee[] = [
  {
    id: "EMP-4012",
    name: "สมควร มีสติ",
    department: "แผนกจัดส่งสินค้า (ขนส่ง)",
    role: "คนขับรถพ่วงสิบแปดล้อ",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231e3a8a'/><circle cx='50' cy='38' r='18' fill='%2360a5fa'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='%2360a5fa'/><text x='50' y='92' fill='%2393c5fd' font-size='7' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: EMP-4012</text></svg>"
  },
  {
    id: "EMP-1085",
    name: "วันชัย นอบน้อม",
    department: "รักษาความปลอดภัย (รปภ.)",
    role: "พนักงาน รปภ. ประตูกลาง",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23064e3b'/><circle cx='50' cy='38' r='18' fill='%2334d399'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='%2334d399'/><text x='50' y='92' fill='%23a7f3d0' font-size='7' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: EMP-1085</text></svg>"
  },
  {
    id: "EMP-3042",
    name: "อภิสิทธิ์ สายบันเทิง",
    department: "แผนกจัดส่งสินค้า (ขนส่ง)",
    role: "พนักงานขับรถขนส่งจักรยานยนต์",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23701a75'/><circle cx='50' cy='38' r='18' fill='%23e879f9'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='%23e879f9'/><text x='50' y='92' fill='%23fbcfe8' font-size='7' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: EMP-3042</text></svg>"
  },
  {
    id: "EMP-2384",
    name: "ชาญชัย เรืองรอง",
    department: "พนักงานขับรถยก (Forklift)",
    role: "พนักงานขับฟอร์คลิฟต์โรงงาน A",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%237c2d12'/><circle cx='50' cy='38' r='18' fill='%23fb923c'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='%23fb923c'/><text x='50' y='92' fill='%23ffedd5' font-size='7' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: EMP-2384</text></svg>"
  },
  {
    id: "EMP-1122",
    name: "สมชาย แข็งแกร่ง",
    department: "พนักงานขับรถยก (Forklift)",
    role: "พนักงานขับฟอร์คลิฟต์บ่อสารเคมี",
    photo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111827'/><circle cx='50' cy='38' r='18' fill='%239ca3af'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='%239ca3af'/><text x='50' y='92' fill='%23f3f4f6' font-size='7' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: EMP-1122</text></svg>"
  }
];

export const DEFAULT_SUPERVISORS: string[] = [
  "พ.ต.ต. ณรงค์ พลเดช",
  "ร.ต.อ. วันชนะ ยิ่งใหญ่",
  "จ.ส.อ. เทิดพงษ์ สมบัติ",
  "นางกัญญารัตน์ ศรีสุข (ฝ่ายบุคคล)"
];

export const DEPARTMENTS = [
  "แผนกจัดส่งสินค้า (ขนส่ง)",
  "รักษาความปลอดภัย (รปภ.)",
  "พนักงานขับรถยก (Forklift)",
  "พนักงานคลังสินค้า (Warehouse)",
  "แผนกวิศวกรรม/ซ่อมบำรุง",
  "แผนกต้อนรับ/ออฟฟิศ",
  "อื่นๆ (บุคคลภายนอก/แขกผู้มาติดต่อ)"
];

export const SYMPTOMS_LIST = [
  "ปกติ",
  "ตาแดง/หน้าแดง",
  "มีกลิ่นสุราชัดเจน",
  "พูดจาอ้อแอ้/ไม่เป็นคำ",
  "ทรงตัวไม่อยู่/เดินเซ/โอนเอน"
];
