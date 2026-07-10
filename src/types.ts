export interface Employee {
  id: string;
  name: string;
  department: string;
  role?: string;
  photo?: string; // Base64 registered face photo
  updatedAt?: string; // ISO string for merging
}

export interface AlcoholTestLog {
  id: string;
  timestamp: string; // ISO string
  employeeName: string;
  employeeId?: string;
  department?: string;
  alcoholLevel: number; // in mg%
  passLimit: number; // custom pass threshold in mg%
  isPassed: boolean;
  symptoms: string[]; // e.g. ["ตาแดง", "กลิ่นสุรา", "ทรงตัวไม่ปกติ"]
  photo?: string; // base64 photo
  signature?: string; // base64 signature
  notes?: string;
  witness?: string; // validator / tester name
  isLeave?: boolean; // true if employee is on leave and cannot be tested
}

export interface AppSettings {
  defaultPassLimit: number; // standard limit: 50 mg% or 20 mg%
  companyName: string;
  testerName: string; // default tester
  requireSignature: boolean;
  requirePhoto: boolean;
  retestGracePeriodMinutes: number; // grace period in minutes for re-testing after failing
  adminPasscode: string; // passcode for modifying databases or removing logs
  autoBackupToDrive?: boolean;
  updatedAt?: string; // ISO string for merging
}
