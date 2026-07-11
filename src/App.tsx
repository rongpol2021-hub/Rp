/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Shield, 
  Check, 
  AlertTriangle, 
  Search, 
  Trash2, 
  Plus, 
  User, 
  Briefcase, 
  FileText, 
  Clock, 
  Settings, 
  X, 
  Calendar, 
  CalendarCheck,
  Eye, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft,
  Printer,
  Download,
  Award,
  AlertCircle,
  HelpCircle,
  FileCheck,
  FolderHeart,
  Camera,
  UserCheck,
  Lock,
  Unlock,
  Edit,
  Pencil,
  Upload,
  FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AlcoholTestLog, AppSettings, Employee } from "./types";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
  LabelList
} from "recharts";
import { INITIAL_LOGS, DEPARTMENTS, SYMPTOMS_LIST, REGISTERED_EMPLOYEES, DEFAULT_SUPERVISORS } from "./data/mockData";
import CameraCapture from "./components/CameraCapture";
import SignaturePad from "./components/SignaturePad";
import { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  disableNetwork
} from "firebase/firestore";
import {
  initAuth,
  googleSignIn,
  logout as googleLogout,
  uploadBackupToDrive,
  listBackupsInDrive,
  downloadBackupFromDrive,
  deleteBackupFromDrive,
  GoogleDriveFile,
  db
} from "./services/googleDrive";

// Helper to convert an SVG string to a safe, browser-compatible Base64 Data URL
const svgToBase64 = (svgString: string): string => {
  try {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
  } catch (err) {
    console.error("Failed to encode SVG to base64:", err);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }
};

export default function App() {
  // 1. Core State
  const [logs, setLogs] = useState<AlcoholTestLog[]>(() => {
    try {
      const local = localStorage.getItem("alcohol_logs");
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const local = localStorage.getItem("alcohol_settings");
      if (local) return JSON.parse(local);
    } catch {}
    return {
      defaultPassLimit: 50, // default limit in Thailand (mg%)
      companyName: "คลังสินค้ากลาง (ศูนย์กระจายสินค้าภาคกลาง)",
      testerName: "นรินทร์ สมบูรณ์ทรัพย์",
      requireSignature: true,
      requirePhoto: true,
      retestGracePeriodMinutes: 15,
      adminPasscode: "1234",
      autoBackupToDrive: false,
    };
  });

  // Helper to calculate attempt number for any given log in the system
  const getLogAttemptInfo = (logId: string) => {
    const targetLog = logs.find(l => l.id === logId);
    if (!targetLog) return { attempt: 1, isRetest: false, sessionTotal: 1, sessionId: "" };

    // Filter and sort all logs of this employee chronologically
    const empLogs = logs
      .filter(l => l.employeeName.trim().toLowerCase() === targetLog.employeeName.trim().toLowerCase())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // We will assign a session ID and attempt number to each log
    const attemptsMap = new Map<string, { attempt: number; isRetest: boolean; sessionId: string }>();
    const sessionCountMap = new Map<string, number>(); // sessionId -> max attempts

    let currentSessionId = "";
    let currentAttempt = 1;
    let lastFailedTime: number | null = null;

    for (const l of empLogs) {
      const lTime = new Date(l.timestamp).getTime();
      const gracePeriodMs = (settings.retestGracePeriodMinutes || 15) * 60 * 1000;

      // Determine if this log belongs to the current session
      let belongsToCurrentSession = false;
      if (currentSessionId && lastFailedTime !== null) {
        const lastFailedDate = new Date(lastFailedTime);
        const currentDate = new Date(lTime);
        const isSameDay = lastFailedDate.toDateString() === currentDate.toDateString();

        // If within the grace period OR on the same day, continue the attempt count from the latest
        if (lTime - lastFailedTime <= gracePeriodMs || isSameDay) {
          belongsToCurrentSession = true;
        }
      }

      if (belongsToCurrentSession) {
        currentAttempt++;
      } else {
        // Start new session
        currentSessionId = l.id; // use the first log's ID as session ID
        currentAttempt = 1;
        lastFailedTime = null;
      }

      // If this log failed, update/set the last failed time for the session
      if (!l.isPassed) {
        lastFailedTime = lTime;
      } else {
        // If passed, we can end the failure session tracking for future tests
        lastFailedTime = null;
      }

      attemptsMap.set(l.id, {
        attempt: currentAttempt,
        isRetest: currentAttempt > 1,
        sessionId: currentSessionId
      });

      sessionCountMap.set(currentSessionId, Math.max(sessionCountMap.get(currentSessionId) || 0, currentAttempt));
    }

    const info = attemptsMap.get(logId) || { attempt: 1, isRetest: false, sessionId: logId };
    const total = sessionCountMap.get(info.sessionId) || 1;

    return {
      attempt: info.attempt,
      isRetest: info.isRetest,
      sessionTotal: total,
      sessionId: info.sessionId
    };
  };

  // UI States
  const [selectedLog, setSelectedLog] = useState<AlcoholTestLog | null>(null);
  const [showPrintReport, setShowPrintReport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PASS" | "FAIL" | "LEAVE">("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [calendarMode, setCalendarMode] = useState<"SINGLE" | "RANGE" | "ALL">("SINGLE");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [selectedCalendarEndDate, setSelectedCalendarEndDate] = useState<Date | null>(null);
  const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(new Date());
  const [time, setTime] = useState<string>("");

  const THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  // New Record Form State
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [alcoholLevel, setAlcoholLevel] = useState<number>(0);
  const [symptoms, setSymptoms] = useState<string[]>(["ปกติ"]);
  const [capturedPhoto, setCapturedPhoto] = useState<string>("");
  const [capturedSignature, setCapturedSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [witness, setWitness] = useState(settings.testerName);
  const [isTestModePersonal, setIsTestModePersonal] = useState(false); // Personal vs Shift supervisor mode

  // Custom non-blocking visual notification system
  const [appNotification, setAppNotification] = useState<{
    show: boolean;
    type: "success" | "error" | "warning" | "info";
    title?: string;
    message: string;
  }>({
    show: false,
    type: "info",
    message: ""
  });

  const showNotification = (message: string, type: "success" | "error" | "warning" | "info" = "success", title?: string) => {
    setAppNotification({ show: true, type, message, title });
    setTimeout(() => {
      setAppNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  // Custom non-blocking confirmation modal state
  const [appConfirmation, setAppConfirmation] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });

  const triggerConfirmation = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = "ยืนยันการลบ",
    cancelText = "ยกเลิก"
  ) => {
    setAppConfirmation({
      show: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setAppConfirmation(prev => ({ ...prev, show: false }));
      },
      confirmText,
      cancelText
    });
  };

  // State for the Admin Authorization PIN dialog
  const [permissionModal, setPermissionModal] = useState<{
    show: boolean;
    actionName: string;
    onSuccess: () => void;
    inputValue: string;
    errorMsg: string;
  }>({
    show: false,
    actionName: "",
    onSuccess: () => {},
    inputValue: "",
    errorMsg: ""
  });

  // State for recording custom leave reason
  const [leaveModal, setLeaveModal] = useState<{
    show: boolean;
    employee: Employee | null;
    reason: string;
    notes: string;
  }>({
    show: false,
    employee: null,
    reason: "ลากิจ",
    notes: ""
  });

  const requestPermission = (actionName: string, onSuccess: () => void) => {
    setPermissionModal({
      show: true,
      actionName,
      onSuccess,
      inputValue: "",
      errorMsg: ""
    });
  };

  // Form Submission Success Trigger Animation State
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [recentSavedId, setRecentSavedId] = useState<string>("");

  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const local = localStorage.getItem("alcohol_employees");
      return local ? JSON.parse(local) : REGISTERED_EMPLOYEES;
    } catch {
      return REGISTERED_EMPLOYEES;
    }
  });
  const [supervisors, setSupervisors] = useState<string[]>(() => {
    try {
      const local = localStorage.getItem("alcohol_supervisors");
      return local ? JSON.parse(local) : DEFAULT_SUPERVISORS;
    } catch {
      return DEFAULT_SUPERVISORS;
    }
  });
  const [newSupervisorInput, setNewSupervisorInput] = useState("");
  const [departments, setDepartments] = useState<string[]>(() => {
    try {
      const local = localStorage.getItem("alcohol_departments");
      return local ? JSON.parse(local) : DEPARTMENTS;
    } catch {
      return DEPARTMENTS;
    }
  });
  const [newDeptInput, setNewDeptInput] = useState("");
  const [deptSearchQuery, setDeptSearchQuery] = useState("");
  const [showManageDb, setShowManageDb] = useState(false);
  const [newEmpId, setNewEmpId] = useState("");
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpDept, setNewEmpDept] = useState(DEPARTMENTS[0]);
  const [newEmpRole, setNewEmpRole] = useState("");
  const [newEmpPhoto, setNewEmpPhoto] = useState<string>("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [empSearchQuery, setEmpSearchQuery] = useState("");
  const [empFilterDept, setEmpFilterDept] = useState("ALL");
  const [excelFileError, setExcelFileError] = useState<string | null>(null);
  const [parsedEmployees, setParsedEmployees] = useState<Employee[]>([]);
  const [importOption, setImportOption] = useState<"SKIP" | "OVERWRITE">("OVERWRITE");
  const [showExcelPreview, setShowExcelPreview] = useState(false);
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [driveBackups, setDriveBackups] = useState<GoogleDriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState<boolean>(false);
  const [isDbLoading, setIsDbLoading] = useState<boolean>(true);
  const [dbStatus, setDbStatus] = useState<"connecting" | "connected" | "error" | "offline">("connecting");
  const [dbRetryCount, setDbRetryCount] = useState<number>(0);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showEmployeeSuggestions, setShowEmployeeSuggestions] = useState(false);

  const hasNotifiedOffline = useRef(false);
  const hasNotifiedQuotaExceeded = useRef(false);

  const logsRef = useRef<AlcoholTestLog[]>([]);
  const employeesRef = useRef<Employee[]>([]);
  const supervisorsRef = useRef<string[]>([]);
  const departmentsRef = useRef<string[]>([]);

  const deletedRecordsRef = useRef<Map<string, string>>(new Map());

  // Load initial deleted records cache from localStorage
  useEffect(() => {
    try {
      const local = localStorage.getItem("alcohol_deleted_records");
      const list = local ? JSON.parse(local) : [];
      deletedRecordsRef.current = new Map(list.map((item: any) => [item.id, item.type]));
    } catch (e) {
      console.error("Error parsing local deleted records:", e);
    }
  }, []);

  // Helper to save logs safely to localStorage to prevent QuotaExceededError
  const saveLogsToLocalStorage = (logsList: AlcoholTestLog[]) => {
    try {
      // Sort and keep only the latest 50 logs for localStorage cache to prevent QuotaExceededError
      const sorted = [...logsList].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const prunedLogs = sorted.slice(0, 50);
      localStorage.setItem("alcohol_logs", JSON.stringify(prunedLogs));
    } catch (error) {
      console.warn("Failed to write logs to localStorage (QuotaExceededError). Retrying with fewer items...", error);
      try {
        const sorted = [...logsList].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const prunedLogs = sorted.slice(0, 20);
        localStorage.setItem("alcohol_logs", JSON.stringify(prunedLogs));
      } catch (e2) {
        console.error("Critical failure: localStorage is completely full.", e2);
      }
    }
  };

  // Helper to save employees safely to localStorage
  const saveEmployeesToLocalStorage = (employeesList: Employee[]) => {
    try {
      localStorage.setItem("alcohol_employees", JSON.stringify(employeesList));
    } catch (error) {
      console.warn("Failed to write employees to localStorage. Retrying with pruned list...", error);
      try {
        // Keep up to 100 employees in local storage if quota is exceeded
        const prunedEmps = employeesList.slice(0, 100);
        localStorage.setItem("alcohol_employees", JSON.stringify(prunedEmps));
      } catch (e2) {
        console.error("Critical failure: localStorage is completely full.", e2);
      }
    }
  };

  // Safe wrapper for other localStorage setItem calls
  const safeLocalStorageSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`safeLocalStorageSetItem failed for key "${key}":`, error);
    }
  };

  const purgeDeletedRecords = (deletedMap: Map<string, string>) => {
    let logsChanged = false;
    const currentLogs = [...logsRef.current];
    const filteredLogs = currentLogs.filter(log => {
      if (deletedMap.has(log.id) && deletedMap.get(log.id) === "log") {
        logsChanged = true;
        return false;
      }
      return true;
    });
    if (logsChanged) {
      logsRef.current = filteredLogs;
      setLogs(filteredLogs);
      saveLogsToLocalStorage(filteredLogs);
    }

    let empsChanged = false;
    const currentEmps = [...employeesRef.current];
    const filteredEmps = currentEmps.filter(emp => {
      if (deletedMap.has(emp.id) && deletedMap.get(emp.id) === "employee") {
        empsChanged = true;
        return false;
      }
      return true;
    });
    if (empsChanged) {
      employeesRef.current = filteredEmps;
      setEmployees(filteredEmps);
      saveEmployeesToLocalStorage(filteredEmps);
    }

    let supsChanged = false;
    const currentSups = [...supervisorsRef.current];
    const filteredSups = currentSups.filter(sup => {
      if (deletedMap.has(sup) && deletedMap.get(sup) === "supervisor") {
        supsChanged = true;
        return false;
      }
      return true;
    });
    if (supsChanged) {
      supervisorsRef.current = filteredSups;
      setSupervisors(filteredSups);
      safeLocalStorageSetItem("alcohol_supervisors", JSON.stringify(filteredSups));
    }

    let deptsChanged = false;
    const currentDepts = [...departmentsRef.current];
    const filteredDepts = currentDepts.filter(dept => {
      if (deletedMap.has(dept) && deletedMap.get(dept) === "department") {
        deptsChanged = true;
        return false;
      }
      return true;
    });
    if (deptsChanged) {
      departmentsRef.current = filteredDepts;
      setDepartments(filteredDepts);
      safeLocalStorageSetItem("alcohol_departments", JSON.stringify(filteredDepts));
    }
  };



  // States for dynamic employee photo capture from camera
  const [isRegCameraActive, setIsRegCameraActive] = useState<boolean>(false);
  const [regCameraStream, setRegCameraStream] = useState<MediaStream | null>(null);
  const [regCameraError, setRegCameraError] = useState<string | null>(null);
  const regVideoRef = useRef<HTMLVideoElement | null>(null);
  const regCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Manage stopping/cleaning up the registration camera stream on change / unmount
  useEffect(() => {
    return () => {
      if (regCameraStream) {
        regCameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [regCameraStream]);

  const startRegCamera = async () => {
    setRegCameraError(null);
    setIsRegCameraActive(true);
    if (regCameraStream) {
      regCameraStream.getTracks().forEach(track => track.stop());
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });
      setRegCameraStream(mediaStream);
      if (regVideoRef.current) {
        regVideoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Registration camera access failed", err);
      setRegCameraError("ไม่สามารถเข้าถึงกล้องถ่ายภาพได้ กรุณาตรวจสอบสิทธิ์กล้องในเบราว์เซอร์");
      setIsRegCameraActive(false);
    }
  };

  const stopRegCamera = () => {
    if (regCameraStream) {
      regCameraStream.getTracks().forEach(track => track.stop());
      setRegCameraStream(null);
    }
    setIsRegCameraActive(false);
  };

  const captureRegPhoto = () => {
    if (regVideoRef.current && regCanvasRef.current) {
      const video = regVideoRef.current;
      const canvas = regCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Set canvas to a proportional square dimensions
        const size = Math.min(video.videoWidth || 320, video.videoHeight || 320);
        canvas.width = size;
        canvas.height = size;
        
        // Horizontal centering crop
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        
        ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setNewEmpPhoto(dataUrl);
        showNotification("ถ่ายรูปภาพจริงเพื่อตั้งเป็นโปรไฟล์เรียบร้อยแล้ว", "success", "บันทึกใบหน้าพนักงานสำเร็จ");
        stopRegCamera();
      }
    }
  };

  // 2. Load / Save from Cloud Firestore & Local Cache
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let isLoaded = false;
    let timeoutId: any = null;
    const initialLoadMap = {
      logs: true,
      employees: true,
      supervisors: true,
      departments: true,
      settings: true
    };

    const loadLocalStorageFallback = () => {
      const localLogsStr = localStorage.getItem("alcohol_logs");
      const localLogs = localLogsStr ? JSON.parse(localLogsStr) : [];
      logsRef.current = localLogs;
      setLogs(localLogs);

      const localEmployeesStr = localStorage.getItem("alcohol_employees");
      const localEmployees = localEmployeesStr ? JSON.parse(localEmployeesStr) : REGISTERED_EMPLOYEES;
      employeesRef.current = localEmployees;
      setEmployees(localEmployees);

      const localSupervisorsStr = localStorage.getItem("alcohol_supervisors");
      const localSupervisors = localSupervisorsStr ? JSON.parse(localSupervisorsStr) : DEFAULT_SUPERVISORS;
      supervisorsRef.current = localSupervisors;
      setSupervisors(localSupervisors);

      const localDeptsStr = localStorage.getItem("alcohol_departments");
      const localDepts = localDeptsStr ? JSON.parse(localDeptsStr) : DEPARTMENTS;
      departmentsRef.current = localDepts;
      setDepartments(localDepts);

      const localSettingsStr = localStorage.getItem("alcohol_settings");
      if (localSettingsStr) {
        const parsed = JSON.parse(localSettingsStr);
        setSettings(parsed);
        setWitness(parsed.testerName);
      } else {
        const defaultSettings = {
          defaultPassLimit: 50,
          companyName: "คลังสินค้ากลาง (ศูนย์กระจายสินค้าภาคกลาง)",
          testerName: "นรินทร์ สมบูรณ์ทรัพย์",
          requireSignature: true,
          requirePhoto: true,
          retestGracePeriodMinutes: 15,
          adminPasscode: "1234",
          autoBackupToDrive: false
        };
        setSettings(defaultSettings);
        setWitness(defaultSettings.testerName);
      }
    };

    const initializeFirestoreSync = async () => {
      setDbStatus("connecting");
      setDbErrorMessage(null);
      setIsDbLoading(true);

      // Fallback timeout of 12 seconds to load from local storage if firestore is slow or offline
      timeoutId = setTimeout(() => {
        if (!isLoaded) {
          console.warn("Firestore sync timed out. Falling back to local storage...");
          setDbStatus("offline");
          if (!hasNotifiedOffline.current) {
            showNotification("ระบบสลับไปใช้งานโหมดออฟไลน์เพื่อความต่อเนื่อง (สามารถบันทึกข้อมูลและใช้งานได้ปกติ)", "info", "โหมดทำงานแบบออฟไลน์");
            hasNotifiedOffline.current = true;
          }
          
          loadLocalStorageFallback();
          setIsDbLoading(false);
        }
      }, 12000);

      // 2a. Setup real-time snapshot listeners for everything first (non-blocking)
      try {
        const loadedCollections = new Set<string>();

        const checkAllLoaded = (collectionName: string) => {
          loadedCollections.add(collectionName);
          if (loadedCollections.size >= 6) {
            isLoaded = true;
            if (timeoutId) clearTimeout(timeoutId);
            setDbStatus("connected");
            setIsDbLoading(false);
          }
        };

        const handleConnectionError = (collectionKey: string, err: any) => {
          console.error(`Error listening to ${collectionKey}:`, err);
          const isQuotaExceeded = err?.code === "resource-exhausted" || 
                                  (err?.message && (err.message.includes("quota") || err.message.includes("exhausted") || err.message.includes("Quota")));
          if (isQuotaExceeded) {
            setDbStatus("offline");
            setDbErrorMessage("โควตาระบบคลาวด์ฟรีเต็มชั่วคราววันนี้ แอปพลิเคชันยังคงบันทึกข้อมูลเรียลไทม์ในอุปกรณ์ของคุณอย่างปลอดภัยและจะซิงค์ขึ้นระบบคลาวด์โดยอัตโนมัติเมื่อสัญญาณและระบบพร้อม");
            if (!hasNotifiedQuotaExceeded.current) {
              showNotification(
                "เชื่อมต่อระบบคลาวด์เรียลไทม์: โควตาระบบคลาวด์ฟรีเต็มชั่วคราวแล้ว แต่ข้อมูลจะถูกเซฟลงในเครื่องอย่างปลอดภัย และอัปโหลดซิงค์ระหว่างโทรศัพท์และเครื่องอื่น ๆ โดยอัตโนมัติเมื่อระบบคลาวด์พร้อม",
                "info",
                "กำลังซิงค์เรียลไทม์"
              );
              hasNotifiedQuotaExceeded.current = true;
            }
          } else {
            setDbStatus("error");
            setDbErrorMessage(`เชื่อมโยงข้อมูล${collectionKey === "logs" ? "ประวัติลมเป่า" : collectionKey === "employees" ? "รายชื่อพนักงาน" : collectionKey === "supervisors" ? "รายชื่อผู้ควบคุม" : collectionKey === "departments" ? "รายชื่อแผนก" : "ตั้งค่าระบบ"}ล้มเหลว: ${err?.message || String(err)}`);
          }
          if (!isLoaded) {
            loadLocalStorageFallback();
            isLoaded = true;
          }
          setIsDbLoading(false);
        };

        // 0. Deleted Records Tombstones (Loaded first so other collections can check against it)
        const unsubDeleted = onSnapshot(collection(db, "deleted_records"), (snapshot) => {
          const deletedMap = new Map<string, string>();
          const deletedList: {id: string, type: string}[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.id) {
              deletedMap.set(data.id, data.type);
              deletedList.push({ id: data.id, type: data.type });
            }
          });
          safeLocalStorageSetItem("alcohol_deleted_records", JSON.stringify(deletedList));
          deletedRecordsRef.current = deletedMap;
          
          // Proactively purge any locally loaded items that have been deleted
          purgeDeletedRecords(deletedMap);
          checkAllLoaded("deleted_records");
        }, (err) => {
          handleConnectionError("deleted_records", err);
          checkAllLoaded("deleted_records");
        });
        unsubs.push(unsubDeleted);

        // 1. Logs
        const unsubLogs = onSnapshot(collection(db, "alcohol_logs"), (snapshot) => {
          const fetchedLogs: AlcoholTestLog[] = [];
          snapshot.forEach((docSnap) => {
            fetchedLogs.push(docSnap.data() as AlcoholTestLog);
          });

          const localLogsStr = localStorage.getItem("alcohol_logs");
          const localLogs: AlcoholTestLog[] = localLogsStr ? JSON.parse(localLogsStr) : [];
          const isLogsSeeded = localStorage.getItem("alcohol_logs_seeded") === "true";
          
          if (snapshot.empty && localLogs.length === 0 && !isLogsSeeded) {
            console.log("Both Firestore and localStorage logs are empty. Seeding INITIAL_LOGS...");
            INITIAL_LOGS.forEach(log => {
              setDoc(doc(db, "alcohol_logs", log.id), JSON.parse(JSON.stringify(log))).catch(err => {
                console.error("Error seeding initial log:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_logs_seeded", "true");
            logsRef.current = INITIAL_LOGS;
            setLogs(INITIAL_LOGS);
            saveLogsToLocalStorage(INITIAL_LOGS);
          } else if (snapshot.empty && localLogs.length > 0) {
            console.log("Firestore is empty but local logs exist. Syncing local logs to Firestore...");
            localLogs.forEach(log => {
              setDoc(doc(db, "alcohol_logs", log.id), JSON.parse(JSON.stringify(log))).catch(err => {
                console.error("Error syncing local log to empty Firestore:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_logs_seeded", "true");
            logsRef.current = localLogs;
            setLogs(localLogs);
          } else {
            // Mark as seeded/initialized since we either have logs, or are intentionally empty
            safeLocalStorageSetItem("alcohol_logs_seeded", "true");

            // Filter out deleted items
            const activeFetched = fetchedLogs.filter(l => !(deletedRecordsRef.current.has(l.id) && deletedRecordsRef.current.get(l.id) === "log"));

            activeFetched.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            logsRef.current = activeFetched;
            setLogs(activeFetched);
            saveLogsToLocalStorage(activeFetched);
          }
          
          checkAllLoaded("logs");
        }, (err) => handleConnectionError("logs", err));
        unsubs.push(unsubLogs);

        // 2. Employees
        const unsubEmployees = onSnapshot(collection(db, "employees"), (snapshot) => {
          const fetchedEmployees: Employee[] = [];
          snapshot.forEach((docSnap) => {
            fetchedEmployees.push(docSnap.data() as Employee);
          });

          const localEmployeesStr = localStorage.getItem("alcohol_employees");
          const localEmployees: Employee[] = localEmployeesStr ? JSON.parse(localEmployeesStr) : [];
          const isEmployeesSeeded = localStorage.getItem("alcohol_employees_seeded") === "true";

          if (snapshot.empty && localEmployees.length === 0 && !isEmployeesSeeded) {
            console.log("Both Firestore and localStorage employees are empty. Seeding REGISTERED_EMPLOYEES...");
            REGISTERED_EMPLOYEES.forEach(emp => {
              setDoc(doc(db, "employees", emp.id), JSON.parse(JSON.stringify(emp))).catch(err => {
                console.error("Error seeding default employee:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_employees_seeded", "true");
            employeesRef.current = REGISTERED_EMPLOYEES;
            setEmployees(REGISTERED_EMPLOYEES);
            saveEmployeesToLocalStorage(REGISTERED_EMPLOYEES);
          } else if (snapshot.empty && localEmployees.length > 0) {
            console.log("Firestore is empty but local employees exist. Syncing to Firestore...");
            localEmployees.forEach(emp => {
              setDoc(doc(db, "employees", emp.id), JSON.parse(JSON.stringify(emp))).catch(err => {
                console.error("Error syncing local employee to empty Firestore:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_employees_seeded", "true");
            employeesRef.current = localEmployees;
            setEmployees(localEmployees);
          } else {
            // Mark as seeded/initialized since we either have employees or are intentionally empty
            safeLocalStorageSetItem("alcohol_employees_seeded", "true");

            const activeFetched = fetchedEmployees.filter(e => !(deletedRecordsRef.current.has(e.id) && deletedRecordsRef.current.get(e.id) === "employee"));

            employeesRef.current = activeFetched;
            setEmployees(activeFetched);
            saveEmployeesToLocalStorage(activeFetched);
          }

          checkAllLoaded("employees");
        }, (err) => handleConnectionError("employees", err));
        unsubs.push(unsubEmployees);

        // 3. Supervisors
        const unsubSupervisors = onSnapshot(collection(db, "supervisors"), (snapshot) => {
          const fetchedSupervisors: string[] = [];
          snapshot.forEach((docSnap) => {
            const name = docSnap.data().name as string;
            if (name) fetchedSupervisors.push(name);
          });

          const localSupervisorsStr = localStorage.getItem("alcohol_supervisors");
          const localSupervisors: string[] = localSupervisorsStr ? JSON.parse(localSupervisorsStr) : [];
          const isSupervisorsSeeded = localStorage.getItem("alcohol_supervisors_seeded") === "true";

          if (snapshot.empty && localSupervisors.length === 0 && !isSupervisorsSeeded) {
            console.log("Both Firestore and localStorage supervisors are empty. Seeding DEFAULT_SUPERVISORS...");
            DEFAULT_SUPERVISORS.forEach(sup => {
              setDoc(doc(db, "supervisors", sup), { name: sup }).catch(err => {
                console.error("Error seeding default supervisor:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_supervisors_seeded", "true");
            supervisorsRef.current = DEFAULT_SUPERVISORS;
            setSupervisors(DEFAULT_SUPERVISORS);
            safeLocalStorageSetItem("alcohol_supervisors", JSON.stringify(DEFAULT_SUPERVISORS));
          } else if (snapshot.empty && localSupervisors.length > 0) {
            console.log("Firestore is empty but local supervisors exist. Syncing to Firestore...");
            localSupervisors.forEach(sup => {
              setDoc(doc(db, "supervisors", sup), { name: sup }).catch(err => {
                console.error("Error syncing local supervisor to empty Firestore:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_supervisors_seeded", "true");
            supervisorsRef.current = localSupervisors;
            setSupervisors(localSupervisors);
          } else {
            // Mark as seeded/initialized since we either have supervisors or are intentionally empty
            safeLocalStorageSetItem("alcohol_supervisors_seeded", "true");

            const activeFetched = fetchedSupervisors.filter(s => !(deletedRecordsRef.current.has(s) && deletedRecordsRef.current.get(s) === "supervisor"));

            supervisorsRef.current = activeFetched;
            setSupervisors(activeFetched);
            safeLocalStorageSetItem("alcohol_supervisors", JSON.stringify(activeFetched));
          }

          checkAllLoaded("supervisors");
        }, (err) => handleConnectionError("supervisors", err));
        unsubs.push(unsubSupervisors);

        // 4. Departments
        const unsubDepartments = onSnapshot(collection(db, "departments"), (snapshot) => {
          const fetchedDepartments: string[] = [];
          snapshot.forEach((docSnap) => {
            const name = docSnap.data().name as string;
            if (name) fetchedDepartments.push(name);
          });

          const localDeptsStr = localStorage.getItem("alcohol_departments");
          const localDepts: string[] = localDeptsStr ? JSON.parse(localDeptsStr) : [];
          const isDepartmentsSeeded = localStorage.getItem("alcohol_departments_seeded") === "true";

          if (snapshot.empty && localDepts.length === 0 && !isDepartmentsSeeded) {
            console.log("Both Firestore and localStorage departments are empty. Seeding DEPARTMENTS...");
            DEPARTMENTS.forEach(dept => {
              setDoc(doc(db, "departments", dept), { name: dept }).catch(err => {
                console.error("Error seeding default department:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_departments_seeded", "true");
            departmentsRef.current = DEPARTMENTS;
            setDepartments(DEPARTMENTS);
            safeLocalStorageSetItem("alcohol_departments", JSON.stringify(DEPARTMENTS));
          } else if (snapshot.empty && localDepts.length > 0) {
            console.log("Firestore is empty but local departments exist. Syncing to Firestore...");
            localDepts.forEach(dept => {
              setDoc(doc(db, "departments", dept), { name: dept }).catch(err => {
                console.error("Error syncing local department to empty Firestore:", err);
              });
            });
            safeLocalStorageSetItem("alcohol_departments_seeded", "true");
            departmentsRef.current = localDepts;
            setDepartments(localDepts);
          } else {
            // Mark as seeded/initialized since we either have departments or are intentionally empty
            safeLocalStorageSetItem("alcohol_departments_seeded", "true");

            const activeFetched = fetchedDepartments.filter(d => !(deletedRecordsRef.current.has(d) && deletedRecordsRef.current.get(d) === "department"));

            departmentsRef.current = activeFetched;
            setDepartments(activeFetched);
            safeLocalStorageSetItem("alcohol_departments", JSON.stringify(activeFetched));
          }

          checkAllLoaded("departments");
        }, (err) => handleConnectionError("departments", err));
        unsubs.push(unsubDepartments);

        // 5. Settings
        const unsubSettings = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
          if (docSnap.exists()) {
            const cloudSettings = docSnap.data() as AppSettings;
            setSettings(cloudSettings);
            setWitness(cloudSettings.testerName);
            safeLocalStorageSetItem("alcohol_settings", JSON.stringify(cloudSettings));
          } else {
            console.log("Firestore settings doc is empty. Seeding from local settings...");
            const localSettingsStr = localStorage.getItem("alcohol_settings");
            const defaultSettings = localSettingsStr ? JSON.parse(localSettingsStr) : {
              defaultPassLimit: 50,
              companyName: "คลังสินค้ากลาง (ศูนย์กระจายสินค้าภาคกลาง)",
              testerName: "นรินทร์ สมบูรณ์ทรัพย์",
              requireSignature: true,
              requirePhoto: true,
              retestGracePeriodMinutes: 15,
              adminPasscode: "1234",
              autoBackupToDrive: false,
              updatedAt: new Date().toISOString()
            };
            setDoc(doc(db, "settings", "global"), defaultSettings).catch(err => {
              console.error("Error seeding global settings doc:", err);
            });
            setSettings(defaultSettings);
            setWitness(defaultSettings.testerName);
            safeLocalStorageSetItem("alcohol_settings", JSON.stringify(defaultSettings));
          }

          checkAllLoaded("settings");
        }, (err) => handleConnectionError("settings", err));
        unsubs.push(unsubSettings);

      } catch (err) {
        console.error("Failed to establish real-time Firestore synchronization:", err);
        setDbStatus("error");
        setDbErrorMessage(err instanceof Error ? err.message : String(err));
        if (!isLoaded) {
          loadLocalStorageFallback();
          isLoaded = true;
        }
        setIsDbLoading(false);
      }
    };

    initializeFirestoreSync();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubs.forEach(unsub => unsub());
    };
  }, [dbRetryCount]);

  // Reset notify state upon successful connection
  useEffect(() => {
    if (dbStatus === "connected") {
      hasNotifiedOffline.current = false;
    }
  }, [dbStatus]);

  // Handle browser online events and periodic auto-reconnection
  useEffect(() => {
    const handleOnline = () => {
      if (hasNotifiedQuotaExceeded.current) return;
      console.log("Network online detected. Triggering database sync reconnect...");
      setDbRetryCount(prev => prev + 1);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if ((dbStatus === "error" || dbStatus === "offline") && !hasNotifiedQuotaExceeded.current) {
      const interval = setInterval(() => {
        console.log("Database status is offline/error. Auto-retrying connection...");
        setDbRetryCount(prev => prev + 1);
      }, 15000); // Retry every 15 seconds
      return () => clearInterval(interval);
    }
  }, [dbStatus]);

  const triggerAutoBackup = async (
    customLogs?: AlcoholTestLog[],
    customEmployees?: Employee[],
    customSupervisors?: string[],
    customDepartments?: string[]
  ) => {
    if (!googleToken || !settings.autoBackupToDrive) return;
    try {
      const activeLogs = customLogs !== undefined ? customLogs : logs;
      const activeEmployees = customEmployees !== undefined ? customEmployees : employees;
      const activeSupervisors = customSupervisors !== undefined ? customSupervisors : supervisors;
      const activeDepartments = customDepartments !== undefined ? customDepartments : departments;

      await uploadBackupToDrive(googleToken, activeLogs, activeEmployees, activeSupervisors, activeDepartments);
      console.log("Auto-backup to Google Drive completed.");
      fetchBackupsList(googleToken);
    } catch (err) {
      console.error("Auto-backup to Google Drive failed:", err);
    }
  };

  const handleSaveError = (err: any) => {
    console.error("Error syncing to Firestore:", err);
    const isQuotaExceeded = err?.code === "resource-exhausted" || 
                            (err?.message && (err.message.includes("quota") || err.message.includes("exhausted") || err.message.includes("Quota")));
    if (isQuotaExceeded) {
      setDbStatus("offline");
      setDbErrorMessage("โควตาระบบคลาวด์เต็มวันนี้ ระบบเซฟข้อมูลลงในเครื่องของคุณอย่างปลอดภัยและจะพยายามอัปโหลดซิงค์ขึ้นคลาวด์ให้อัตโนมัติในเบื้องหลังเมื่อช่องสัญญาณว่าง");
      if (!hasNotifiedQuotaExceeded.current) {
        showNotification(
          "บันทึกข้อมูลเรียลไทม์ออนไลน์: ข้อมูลของคุณได้รับการบันทึกในเครื่องและเข้าสู่คิวสมาร์ทซิงค์ระบบคลาวด์แล้ว ข้อมูลจะซิงค์กับคอมพิวเตอร์และมือถืออื่น ๆ อัตโนมัติเมื่อระบบพร้อม",
          "info",
          "บันทึกข้อมูลแบบเรียลไทม์"
        );
        hasNotifiedQuotaExceeded.current = true;
      }
    }
  };

  const saveLogs = async (updatedLogs: AlcoholTestLog[], isFullOverwrite: boolean = false) => {
    const oldLogs = [...logsRef.current];
    setLogs(updatedLogs);
    logsRef.current = updatedLogs;
    saveLogsToLocalStorage(updatedLogs);
    triggerAutoBackup(updatedLogs, undefined, undefined, undefined);

    try {
      const oldLogsMap = new Map(oldLogs.map(l => [l.id, l]));

      let deletePromises: Promise<void>[] = [];
      if (isFullOverwrite) {
        const newLogsMap = new Map(updatedLogs.map(l => [l.id, l]));
        const logsToDelete = oldLogs.filter(l => !newLogsMap.has(l.id));
        deletePromises = logsToDelete.flatMap(l => [
          deleteDoc(doc(db, "alcohol_logs", l.id)),
          setDoc(doc(db, "deleted_records", l.id), { id: l.id, type: "log", timestamp: new Date().toISOString() })
        ]);
      }

      const savePromises = updatedLogs
        .filter(l => {
          const old = oldLogsMap.get(l.id);
          return !old || JSON.stringify(old) !== JSON.stringify(l);
        })
        .flatMap(l => [
          setDoc(doc(db, "alcohol_logs", l.id), JSON.parse(JSON.stringify(l))),
          deleteDoc(doc(db, "deleted_records", l.id))
        ]);

      await Promise.all([...deletePromises, ...savePromises]);
    } catch (e) {
      handleSaveError(e);
    }
  };

  const saveEmployees = async (updatedEmployees: Employee[], isFullOverwrite: boolean = false) => {
    const oldEmployees = [...employeesRef.current];
    const oldEmpMap = new Map(oldEmployees.map(e => [e.id, e]));

    const nowIso = new Date().toISOString();
    const finalEmployees = updatedEmployees.map(emp => {
      const old = oldEmpMap.get(emp.id);
      const oldWithoutUpdated = old ? { ...old, updatedAt: undefined } : null;
      const empWithoutUpdated = { ...emp, updatedAt: undefined };
      if (!old || JSON.stringify(oldWithoutUpdated) !== JSON.stringify(empWithoutUpdated)) {
        return {
          ...emp,
          updatedAt: nowIso
        };
      }
      return emp;
    });

    setEmployees(finalEmployees);
    employeesRef.current = finalEmployees;
    saveEmployeesToLocalStorage(finalEmployees);
    triggerAutoBackup(undefined, finalEmployees, undefined, undefined);

    try {
      const finalEmpMap = new Map(finalEmployees.map(e => [e.id, e]));

      let deletePromises: Promise<void>[] = [];
      if (isFullOverwrite) {
        const empsToDelete = oldEmployees.filter(e => !finalEmpMap.has(e.id));
        deletePromises = empsToDelete.flatMap(e => [
          deleteDoc(doc(db, "employees", e.id)),
          setDoc(doc(db, "deleted_records", e.id), { id: e.id, type: "employee", timestamp: nowIso })
        ]);
      }

      const savePromises = finalEmployees
        .filter(e => {
          const old = oldEmpMap.get(e.id);
          return !old || JSON.stringify(old) !== JSON.stringify(e);
        })
        .flatMap(e => [
          setDoc(doc(db, "employees", e.id), JSON.parse(JSON.stringify(e))),
          deleteDoc(doc(db, "deleted_records", e.id))
        ]);

      await Promise.all([...deletePromises, ...savePromises]);
    } catch (e) {
      handleSaveError(e);
    }
  };

  const saveSupervisors = async (updatedSupervisors: string[], isFullOverwrite: boolean = false) => {
    const oldSupervisors = [...supervisorsRef.current];
    setSupervisors(updatedSupervisors);
    supervisorsRef.current = updatedSupervisors;
    safeLocalStorageSetItem("alcohol_supervisors", JSON.stringify(updatedSupervisors));
    triggerAutoBackup(undefined, undefined, updatedSupervisors, undefined);

    try {
      const oldSet = new Set(oldSupervisors);

      let deletePromises: Promise<void>[] = [];
      if (isFullOverwrite) {
        const newSet = new Set(updatedSupervisors);
        const supsToDelete = oldSupervisors.filter(name => !newSet.has(name));
        deletePromises = supsToDelete.flatMap(name => [
          deleteDoc(doc(db, "supervisors", name)),
          setDoc(doc(db, "deleted_records", name), { id: name, type: "supervisor", timestamp: new Date().toISOString() })
        ]);
      }

      const savePromises = updatedSupervisors
        .filter(name => !oldSet.has(name))
        .flatMap(name => [
          setDoc(doc(db, "supervisors", name), { name }),
          deleteDoc(doc(db, "deleted_records", name))
        ]);

      await Promise.all([...deletePromises, ...savePromises]);
    } catch (e) {
      handleSaveError(e);
    }
  };

  const saveDepartments = async (updatedDepartments: string[], isFullOverwrite: boolean = false) => {
    const oldDepartments = [...departmentsRef.current];
    setDepartments(updatedDepartments);
    departmentsRef.current = updatedDepartments;
    safeLocalStorageSetItem("alcohol_departments", JSON.stringify(updatedDepartments));
    triggerAutoBackup(undefined, undefined, undefined, updatedDepartments);

    try {
      const oldSet = new Set(oldDepartments);

      let deletePromises: Promise<void>[] = [];
      if (isFullOverwrite) {
        const newSet = new Set(updatedDepartments);
        const deptsToDelete = oldDepartments.filter(name => !newSet.has(name));
        deletePromises = deptsToDelete.flatMap(name => [
          deleteDoc(doc(db, "departments", name)),
          setDoc(doc(db, "deleted_records", name), { id: name, type: "department", timestamp: new Date().toISOString() })
        ]);
      }

      const savePromises = updatedDepartments
        .filter(name => !oldSet.has(name))
        .flatMap(name => [
          setDoc(doc(db, "departments", name), { name }),
          deleteDoc(doc(db, "deleted_records", name))
        ]);

      await Promise.all([...deletePromises, ...savePromises]);
    } catch (e) {
      handleSaveError(e);
    }
  };

  const saveSettings = async (updatedSettings: AppSettings) => {
    setSettings(updatedSettings);
    safeLocalStorageSetItem("alcohol_settings", JSON.stringify(updatedSettings));
    try {
      await setDoc(doc(db, "settings", "global"), JSON.parse(JSON.stringify(updatedSettings)));
    } catch (e) {
      handleSaveError(e);
    }
  };

  // Force upload local cache data to Cloud Firestore (for multi-device sync seeding)
  const handleForceUploadToCloud = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setDbStatus("connecting");
    showNotification("กำลังดำเนินการอัปโหลดข้อมูลเครื่องนี้เพื่อเขียนทับฐานข้อมูลระบบคลาวด์...", "info", "ซิงค์ระบบคลาวด์");
    
    try {
      // 1. Logs
      for (const log of logs) {
        await setDoc(doc(db, "alcohol_logs", log.id), JSON.parse(JSON.stringify(log)));
      }
      
      // 2. Employees
      for (const emp of employees) {
        await setDoc(doc(db, "employees", emp.id), JSON.parse(JSON.stringify(emp)));
      }
      
      // 3. Supervisors
      for (const sup of supervisors) {
        await setDoc(doc(db, "supervisors", sup), { name: sup });
      }
      
      // 4. Departments
      for (const dept of departments) {
        await setDoc(doc(db, "departments", dept), { name: dept });
      }
      
      // 5. Settings
      await setDoc(doc(db, "settings", "global"), JSON.parse(JSON.stringify(settings)));
      
      setDbStatus("connected");
      setDbErrorMessage(null);
      showNotification("สำเร็จ! อัปโหลดข้อมูลท้องถิ่นขึ้นระบบคลาวด์หลักเสร็จสมบูรณ์ ทุกเครื่องเปิดแอปจะเห็นข้อมูลตรงกัน", "success", "ซิงค์ข้อมูลสำเร็จ");
    } catch (err: any) {
      console.error("Force upload failed:", err);
      setDbStatus("error");
      setDbErrorMessage(`อัปโหลดล้มเหลว: ${err.message || String(err)}`);
      showNotification(`ไม่สามารถส่งข้อมูลขึ้นคลาวด์: ${err.message || String(err)}`, "error", "ซิงค์คลาวด์ล้มเหลว");
    } finally {
      setIsSyncing(false);
    }
  };

  // Force download latest data from Cloud Firestore (overwriting local state & localStorage cache)
  const handleForceDownloadFromCloud = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setDbStatus("connecting");
    showNotification("กำลังดึงข้อมูลล่าสุดจากระบบคลาวด์ลงมายังเครื่องนี้...", "info", "ซิงค์ระบบคลาวด์");

    try {
      // 1. Logs
      const logsSnap = await getDocs(collection(db, "alcohol_logs"));
      const fetchedLogs: AlcoholTestLog[] = [];
      logsSnap.forEach(snap => {
        if (snap.exists()) fetchedLogs.push(snap.data() as AlcoholTestLog);
      });
      
      // 2. Employees
      const empsSnap = await getDocs(collection(db, "employees"));
      const fetchedEmps: Employee[] = [];
      empsSnap.forEach(snap => {
        if (snap.exists()) fetchedEmps.push(snap.data() as Employee);
      });

      // 3. Supervisors
      const supsSnap = await getDocs(collection(db, "supervisors"));
      const fetchedSups: string[] = [];
      supsSnap.forEach(snap => {
        if (snap.exists() && snap.data().name) fetchedSups.push(snap.data().name);
      });

      // 4. Departments
      const deptsSnap = await getDocs(collection(db, "departments"));
      const fetchedDepts: string[] = [];
      deptsSnap.forEach(snap => {
        if (snap.exists() && snap.data().name) fetchedDepts.push(snap.data().name);
      });

      // 5. Settings
      const settingsSnap = await getDoc(doc(db, "settings", "global"));
      let fetchedSettings: AppSettings | null = null;
      if (settingsSnap.exists()) {
        fetchedSettings = settingsSnap.data() as AppSettings;
      }

      // Apply to memory states & local caches
      if (fetchedLogs.length > 0) {
        fetchedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLogs(fetchedLogs);
        saveLogsToLocalStorage(fetchedLogs);
        logsRef.current = fetchedLogs;
      }
      
      if (fetchedEmps.length > 0) {
        setEmployees(fetchedEmps);
        saveEmployeesToLocalStorage(fetchedEmps);
        employeesRef.current = fetchedEmps;
      }

      if (fetchedSups.length > 0) {
        setSupervisors(fetchedSups);
        safeLocalStorageSetItem("alcohol_supervisors", JSON.stringify(fetchedSups));
        supervisorsRef.current = fetchedSups;
      }

      if (fetchedDepts.length > 0) {
        setDepartments(fetchedDepts);
        safeLocalStorageSetItem("alcohol_departments", JSON.stringify(fetchedDepts));
        departmentsRef.current = fetchedDepts;
      }

      if (fetchedSettings) {
        setSettings(fetchedSettings);
        safeLocalStorageSetItem("alcohol_settings", JSON.stringify(fetchedSettings));
        setWitness(fetchedSettings.testerName);
      }

      setDbStatus("connected");
      setDbErrorMessage(null);
      showNotification("สำเร็จ! ดาวน์โหลดข้อมูลล่าสุดจากคลาวด์และเขียนทับเครื่องนี้เรียบร้อยแล้ว", "success", "ซิงค์ข้อมูลสำเร็จ");
    } catch (err: any) {
      console.error("Force download failed:", err);
      setDbStatus("error");
      setDbErrorMessage(`ดาวน์โหลดล้มเหลว: ${err.message || String(err)}`);
      showNotification(`ไม่สามารถดาวน์โหลดข้อมูล: ${err.message || String(err)}`, "error", "ซิงค์คลาวด์ล้มเหลว");
    } finally {
      setIsSyncing(false);
    }
  };

  // Google Drive Auth initialization on component mount
  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        // Load backups list immediately on successful login
        fetchBackupsList(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchBackupsList = async (token: string) => {
    setIsDriveLoading(true);
    try {
      const list = await listBackupsInDrive(token);
      setDriveBackups(list);
    } catch (err: any) {
      console.error("Error fetching backups from Google Drive:", err);
      showNotification("ไม่สามารถดึงข้อมูลรายการสำรองข้อมูลจาก Google Drive", "error", "ผิดพลาด");
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        showNotification(`เชื่อมต่อบัญชี Google ของคุณ "${res.user.displayName}" เรียบร้อยแล้ว`, "success", "เชื่อมต่อสำเร็จ");
        fetchBackupsList(res.accessToken);
      }
    } catch (err: any) {
      console.error("Google sign in failed:", err);
      showNotification("ไม่สามารถเชื่อมต่อบัญชี Google ได้ในขณะนี้", "error", "เชื่อมต่อล้มเหลว");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setGoogleUser(null);
      setGoogleToken(null);
      setDriveBackups([]);
      showNotification("ยกเลิกการเชื่อมต่อบัญชี Google เรียบร้อยแล้ว", "info", "ลงชื่อออกสำเร็จ");
    } catch (err: any) {
      console.error("Logout failed:", err);
    }
  };

  const handleBackupToDrive = async () => {
    if (!googleToken) {
      showNotification("กรุณาเชื่อมต่อบัญชี Google Drive ก่อนทำรายการ", "warning", "ต้องการสิทธิ์การเข้าถึง");
      return;
    }
    setIsDriveLoading(true);
    try {
      await uploadBackupToDrive(googleToken, logs, employees, supervisors, departments);
      showNotification("สำรองข้อมูลทั้งหมดขึ้น Google Drive สำเร็จ", "success", "สำรองข้อมูลสำเร็จ");
      fetchBackupsList(googleToken);
    } catch (err: any) {
      console.error("Upload backup failed:", err);
      showNotification("เกิดข้อผิดพลาดในการอัปโหลดไฟล์ไปที่ Google Drive", "error", "อัปโหลดล้มเหลว");
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleRestoreFromDrive = async (fileId: string, fileName: string) => {
    if (!googleToken) return;
    
    // User confirmation for destructive restore
    triggerConfirmation(
      "ยืนยันการฟื้นฟูข้อมูลจากระบบสำรอง",
      `คุณแน่ใจหรือไม่ว่าต้องการฟื้นฟูข้อมูลระบบ โดยดึงข้อมูลไฟล์ "${fileName}" จาก Google Drive มาแทนที่ข้อมูลทั้งหมดบนเบราว์เซอร์ปัจจุบันนี้? (ข้อมูลล่าสุดที่ยังไม่ได้บันทึกจะสูญหาย)`,
      async () => {
        setIsDriveLoading(true);
        try {
          const data = await downloadBackupFromDrive(googleToken, fileId);
          if (data && (data.logs || data.employees)) {
            if (data.logs) saveLogs(data.logs, true);
            if (data.employees) saveEmployees(data.employees, true);
            if (data.supervisors) saveSupervisors(data.supervisors, true);
            if (data.departments) saveDepartments(data.departments, true);
            
            showNotification(`ฟื้นฟูระบบข้อมูลจากสำรอง "${fileName}" เรียบร้อยแล้ว!`, "success", "คืนค่าระบบสำเร็จ");
          } else {
            showNotification("รูปแบบข้อมูลไฟล์สำรองไม่ถูกต้องหรือไม่พบข้อมูล", "error", "ข้อมูลไม่ถูกต้อง");
          }
        } catch (err: any) {
          console.error("Restore from drive failed:", err);
          showNotification("ไม่สามารถดาวน์โหลดและฟื้นฟูข้อมูลได้ในขณะนี้", "error", "ฟื้นฟูล้มเหลว");
        } finally {
          setIsDriveLoading(false);
        }
      }
    );
  };

  const handleDeleteBackupFromDrive = async (fileId: string, fileName: string) => {
    if (!googleToken) return;
    
    // User confirmation for destructive delete
    triggerConfirmation(
      "ยืนยันการลบไฟล์สำรองบน Google Drive",
      `คุณต้องการลบไฟล์สำรอง "${fileName}" ออกจากพื้นที่เก็บข้อมูล Google Drive ของคุณหรือไม่?`,
      async () => {
        setIsDriveLoading(true);
        try {
          await deleteBackupFromDrive(googleToken, fileId);
          showNotification("ลบไฟล์สำรองออกจาก Google Drive เรียบร้อยแล้ว", "success", "ลบไฟล์สำเร็จ");
          fetchBackupsList(googleToken);
        } catch (err: any) {
          console.error("Delete backup failed:", err);
          showNotification("ไม่สามารถลบไฟล์สำรองบน Google Drive ได้", "error", "ลบล้มเหลว");
        } finally {
          setIsDriveLoading(false);
        }
      }
    );
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    saveSettings(newSettings);
    setWitness(newSettings.testerName);
    setShowSettings(false);
  };

  // Real-time Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleDateString("th-TH", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        }) + 
        " | " + 
        now.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " น."
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const playBuzzerSound = () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const audioCtx = new AudioCtxClass();
      
      const playBeep = (freq: number, start: number, duration: number, type: OscillatorType = "sawtooth") => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        gainNode.gain.setValueAtTime(0.18, start);
        gainNode.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = audioCtx.currentTime;
      // High-pitched attention siren sequence (Alarm Sound)
      playBeep(440, now, 0.15, "triangle");
      playBeep(220, now + 0.1, 0.15, "sawtooth");
      playBeep(440, now + 0.25, 0.15, "triangle");
      playBeep(220, now + 0.35, 0.3, "sawtooth");
    } catch (err) {
      console.warn("Audio warning cue couldn't play.", err);
    }
  };



  // 3. Alcohol Level Evaluation Logic
  const getPassLimit = () => settings.defaultPassLimit;
  const isPassedResult = alcoholLevel <= getPassLimit();

  // 4. Input presets for sandbox convenience
  const handleQuickLevelSet = (level: number) => {
    setAlcoholLevel(level);
  };

  // Symptoms Selection Manager
  const handleSymptomToggle = (symptom: string) => {
    if (symptom === "ปกติ") {
      setSymptoms(["ปกติ"]);
      return;
    }

    let updated = symptoms.filter(s => s !== "ปกติ");
    if (updated.includes(symptom)) {
      updated = updated.filter(s => s !== symptom);
      if (updated.length === 0) {
        updated = ["ปกติ"];
      }
    } else {
      updated.push(symptom);
    }
    setSymptoms(updated);
  };

  // 5. Submit Form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!employeeName.trim()) {
      showNotification("กรุณากรอกชื่อ-นามสกุล ผู้ได้รับการตรวจ", "warning", "ข้อมูลไม่ครบถ้วน");
      return;
    }

    if (settings.requirePhoto && !capturedPhoto) {
      showNotification("กรุณาถ่ายภาพผู้รับการตรวจก่อนกดบันทึกข้อมูล", "warning", "ไม่พบรูปถ่าย");
      return;
    }

    if (settings.requireSignature && !capturedSignature) {
      showNotification("กรุณาให้ผู้รับการตรวจลงลายมือชื่อดิจิทัลก่อนกดบันทึกข้อมูล", "warning", "ไม่พบลายมือชื่อ");
      return;
    }

    // Capture standard/random webcam snapshot if none is taken, to keep list pretty
    let finalPhoto = capturedPhoto;
    if (!finalPhoto) {
      // Simple custom avatar generation to present visual context
      const textParam = encodeURIComponent(`${alcoholLevel} mg%`);
      finalPhoto = svgToBase64(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='${isPassedResult ? "#1c1917" : "#450a0a"}'/><circle cx='50' cy='35' r='20' fill='#a8a29e'/><path d='M20 80c0-15 15-20 30-20s30 5 30 20' fill='#a8a29e'/><text x='50' y='90' fill='${isPassedResult ? "#10b981" : "#ef4444"}' font-size='8' font-family='sans-serif' text-anchor='middle'>${isPassedResult ? "PASS" : "ALARM"} (${alcoholLevel} mg%)</text></svg>`);
    }

    // Determine if we need to auto-append/set "เกินกำหนดเวลา" notes
    let finalNotes = notes.trim();
    if (employeeName.trim()) {
      const empLogs = logs
        .filter(log => log.employeeName.trim().toLowerCase() === employeeName.trim().toLowerCase())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      if (empLogs.length > 0) {
        const lastLog = empLogs[0];
        if (!lastLog.isPassed) {
          const failTime = new Date(lastLog.timestamp).getTime();
          const gracePeriodMs = (settings.retestGracePeriodMinutes || 15) * 60 * 1000;
          const isExpired = (failTime + gracePeriodMs) < Date.now();
          if (isExpired) {
            if (finalNotes) {
              finalNotes = `เกินกำหนดเวลา | ${finalNotes}`;
            } else {
              finalNotes = "เกินกำหนดเวลา";
            }
          }
        }
      }
    }

    let finalDept = isTestModePersonal ? "ตรวจวัดส่วนบุคคล" : department;
    let finalEmpId = isTestModePersonal ? "PERSONAL" : (employeeId.trim() || undefined);

    if (!isTestModePersonal && employeeName.trim()) {
      const match = employees.find(emp => emp.name.trim().toLowerCase() === employeeName.trim().toLowerCase());
      if (match) {
        finalDept = match.department;
        if (!finalEmpId) {
          finalEmpId = match.id;
        }
      }
    }

    const testId = `LOG-${Date.now().toString().slice(-6)}`;
    const newLog: AlcoholTestLog = {
      id: testId,
      timestamp: new Date().toISOString(),
      employeeName: employeeName.trim(),
      employeeId: finalEmpId,
      department: finalDept,
      alcoholLevel,
      passLimit: getPassLimit(),
      isPassed: isPassedResult,
      symptoms,
      photo: finalPhoto,
      signature: capturedSignature || undefined,
      notes: finalNotes || undefined,
      witness: witness.trim() || settings.testerName,
    };

    const updatedLogs = [newLog, ...logs];
    saveLogs(updatedLogs);

    // Reset Form Fields (keep tester name for speed)
    setEmployeeName("");
    setEmployeeId("");
    setAlcoholLevel(0);
    setSymptoms(["ปกติ"]);
    setCapturedPhoto("");
    setCapturedSignature(null); // Triggers re-renders on components
    setNotes("");

    // Trigger Success feedback
    setRecentSavedId(testId);
    setShowSuccessBanner(true);
    setTimeout(() => {
      setShowSuccessBanner(false);
    }, 4500);
    showNotification(`บันทึกผลแกนตรวจของ ${newLog.employeeName} เรียบร้อยแล้ว`, "success", "บันทึกสำเร็จ");
  };

  // 6. Delete single log
  const handleDeleteLog = (id: string) => {
    requestPermission("ลบประวัติการตรวจวัดแอลกอฮอล์", () => {
      triggerConfirmation(
        "ยืนยันการลบประวัติการตรวจ",
        "คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการเป่าแอลกอฮอล์รายการนี้ออกจากระบบ? (การลบนี้ใช้ผลทันทีและไม่สามารถดึงกลับมาได้)",
        async () => {
          try {
            // Update local state and localStorage first for instant responsiveness
            const updatedLogs = logs.filter(l => l.id !== id);
            setLogs(updatedLogs);
            logsRef.current = updatedLogs;
            saveLogsToLocalStorage(updatedLogs);

            if (dbStatus !== "offline") {
              await deleteDoc(doc(db, "alcohol_logs", id));
              await setDoc(doc(db, "deleted_records", id), { id, type: "log", timestamp: new Date().toISOString() });
            }
            if (selectedLog?.id === id) {
              setSelectedLog(null);
            }
            showNotification("ลบประวัติการเป่าแอลกอฮอล์เรียบร้อยแล้ว", "success", "ลบสำเร็จ");
          } catch (e) {
            console.error("Error deleting log:", e);
            showNotification("เกิดข้อผิดพลาดในการลบข้อมูล", "error", "ลบล้มเหลว");
          }
        }
      );
    });
  };

  // 7. Reset entire log database
  const handleResetAllLogs = () => {
    requestPermission("ล้างประวัติการตรวจวัดทั้งหมด (Reset Database)", () => {
      triggerConfirmation(
        "⚠️ ลบประวัติการตรวจทั้งหมด",
        "คุณต้องการล้างประวัติการตรวจวัดแอลกอฮอล์ทั้งหมดออกจากระบบ (รวมถึงข้อมูลจำลองและข้อมูลทดสอบทั้งหมด) ใช่หรือไม่? รายการทั้งหมดจะหายไปอย่างถาวร!",
        async () => {
          try {
            await saveLogs([], true);
            setSelectedLog(null);
            showNotification("รีเซ็ตล้างประวัติการตรวจวัดทั้งหมดและอัปเดตระบบเรียบร้อยแล้ว", "success", "ล้างระบบเรียบร้อย");
          } catch (e) {
            console.error("Error resetting all logs:", e);
            showNotification("เกิดข้อผิดพลาดในการล้างข้อมูล", "error", "ล้างล้มเหลว");
          }
        },
        "ลบทั้งหมดถาวร"
      );
    });
  };

  // 8. Restore Mock logs
  const handleLoadMockLogs = () => {
    saveLogs(INITIAL_LOGS);
    showNotification("ฟื้นฟูข้อมูลสรุปรายการจำลอง 8 รายการเรียบร้อยแล้ว", "success", "โหลดข้อมูลตัวอย่าง");
  };

  // 8.1 Employee Database Management Helpers
  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) {
      showNotification("กรุณาระบุชื่อ-นามสกุลพนักงานจริง", "warning", "ข้อมูลไม่สมบูรณ์");
      return;
    }

    if (editingEmployeeId) {
      const runEdit = () => {
        const newIdTrimmed = newEmpId.trim() || editingEmployeeId;
        
        // Let's check duplicates if ID is changed
        if (newIdTrimmed.toLowerCase() !== editingEmployeeId.toLowerCase() && 
            employees.some(emp => emp.id.toLowerCase() === newIdTrimmed.toLowerCase())) {
          showNotification("รหัสพนักงานซ้ำกับคนอื่น! กรุณาป้อนรหัสอื่น", "error", "รหัสพนักงานซ้ำซ้อน");
          return;
        }

        const updated = employees.map(emp => {
          if (emp.id === editingEmployeeId) {
            return {
              ...emp,
              id: newIdTrimmed,
              name: newEmpName.trim(),
              department: newEmpDept,
              role: newEmpRole.trim() || "พนักงานทั่วไป",
              photo: newEmpPhoto || emp.photo
            };
          }
          return emp;
        });

        saveEmployees(updated);
        setEditingEmployeeId(null);
        setNewEmpId("");
        setNewEmpName("");
        setNewEmpRole("");
        setNewEmpPhoto("");
        showNotification(`แก้ไขข้อมูลคุณ "${newEmpName.trim()}" เรียบร้อยแล้ว`, "success", "แก้ไขข้อมูลสำเร็จ");
      };
      requestPermission(`แก้ไขข้อมูลพนักงาน: ${newEmpName.trim()}`, runEdit);
      return;
    }

    const empIdStr = newEmpId.trim() || `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Check duplication for new employee
    if (employees.some(emp => emp.id.toLowerCase() === empIdStr.toLowerCase())) {
      showNotification("รหัสพนักงานซ้ำ! รหัสนี้มีอยู่แล้วในฐานข้อมูล กรุณาป้อนรหัสอื่น", "error", "รหัสพนักงานซ้ำซ้อน");
      return;
    }

    const runAdd = () => {
      const defaultColors = ["#0284c7", "#4f46e5", "#0891b2", "#0d9488", "#ea580c"];
      const randomCol = defaultColors[Math.floor(Math.random() * defaultColors.length)];
      const fallbackPhoto = svgToBase64(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='${randomCol}'/><circle cx='50' cy='38' r='18' fill='white'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='white'/><text x='50' y='92' fill='white' font-size='6.5' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: ${empIdStr}</text></svg>`);

      const newEmp: Employee = {
        id: empIdStr,
        name: newEmpName.trim(),
        department: newEmpDept,
        role: newEmpRole.trim() || "พนักงานทั่วไป",
        photo: newEmpPhoto || fallbackPhoto
      };

      const updated = [...employees, newEmp];
      saveEmployees(updated);

      // Reset inputs
      setNewEmpId("");
      setNewEmpName("");
      setNewEmpRole("");
      setNewEmpPhoto("");
      showNotification(`ลงทะเบียนผู้รับตรวจคุณ "${newEmp.name}" เข้าระเบียบบันทึกแล้ว`, "success", "เพิ่มรายชื่อสำเร็จ");
    };

    requestPermission(`ลงทะเบียนพนักงานใหม่: ${newEmpName.trim()}`, runAdd);
  };

  const handleSaveAsNewEmployee = () => {
    if (!newEmpName.trim()) {
      showNotification("กรุณาระบุชื่อ-นามสกุลพนักงานจริง", "warning", "ข้อมูลไม่สมบูรณ์");
      return;
    }

    const baseId = newEmpId.trim() && newEmpId.trim() !== editingEmployeeId ? newEmpId.trim() : "EMP";
    let empIdStr = baseId;
    
    // Check duplication for new employee ID or auto generate
    if (employees.some(emp => emp.id.toLowerCase() === empIdStr.toLowerCase()) || !newEmpId.trim() || empIdStr === editingEmployeeId) {
      empIdStr = `${baseId}-${Math.floor(1000 + Math.random() * 9000)}`;
      while (employees.some(emp => emp.id.toLowerCase() === empIdStr.toLowerCase())) {
        empIdStr = `${baseId}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    const runAdd = () => {
      const defaultColors = ["#0284c7", "#4f46e5", "#0891b2", "#0d9488", "#ea580c"];
      const randomCol = defaultColors[Math.floor(Math.random() * defaultColors.length)];
      const fallbackPhoto = svgToBase64(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='${randomCol}'/><circle cx='50' cy='38' r='18' fill='white'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='white'/><text x='50' y='92' fill='white' font-size='6.5' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: ${empIdStr}</text></svg>`);

      const newEmp: Employee = {
        id: empIdStr,
        name: newEmpName.trim(),
        department: newEmpDept,
        role: newEmpRole.trim() || "พนักงานทั่วไป",
        photo: newEmpPhoto || fallbackPhoto
      };

      const updated = [...employees, newEmp];
      saveEmployees(updated);

      // Reset inputs & editing state
      setEditingEmployeeId(null);
      setNewEmpId("");
      setNewEmpName("");
      setNewEmpRole("");
      setNewEmpPhoto("");
      showNotification(`คัดลอกและบันทึกเป็นพนักงานใหม่คุณ "${newEmp.name}" เรียบร้อยแล้ว`, "success", "บันทึกข้อมูลใหม่สำเร็จ");
    };

    requestPermission(`บันทึกข้อมูลเป็นพนักงานใหม่: ${newEmpName.trim()}`, runAdd);
  };

  const handleDeleteEmployee = (id: string, name: string) => {
    requestPermission(`ลบรายชื่อพนักงานคุณ ${name}`, () => {
      triggerConfirmation(
        "ยืนยันการลบรายชื่อพนักงาน",
        `คุณต้องการลบคุณ "${name}" (รหัส: ${id}) ออกจากฐานข้อมูลรายชื่อพนักงานจริงประจำคลังสินค้าใช่หรือไม่?`,
        async () => {
          try {
            // Update local state and localStorage first for instant responsiveness
            const updatedEmployees = employees.filter(e => e.id !== id);
            setEmployees(updatedEmployees);
            employeesRef.current = updatedEmployees;
            saveEmployeesToLocalStorage(updatedEmployees);

            if (dbStatus !== "offline") {
              await deleteDoc(doc(db, "employees", id));
              await setDoc(doc(db, "deleted_records", id), { id, type: "employee", timestamp: new Date().toISOString() });
            }
            showNotification(`ลบพนักงาน "${name}" ออกจากฐานข้อมูลระบบแล้ว`, "success", "ลบพนักงานสำเร็จ");
          } catch (e) {
            console.error("Error deleting employee:", e);
            showNotification("เกิดข้อผิดพลาดในการลบพนักงาน", "error", "ลบล้มเหลว");
          }
        }
      );
    });
  };

  const handleDeleteAllEmployees = () => {
    requestPermission("ลบรายชื่อพนักงานทั้งหมด", () => {
      triggerConfirmation(
        "⚠️ ยืนยันการลบรายชื่อพนักงานทั้งหมด",
        `คุณต้องการลบรายชื่อพนักงานทั้งหมดจำนวน ${employees.length} คน ออกจากฐานข้อมูลระบบคัดกรองใช่หรือไม่? (การดำเนินการนี้ไม่สามารถย้อนกลับได้)`,
        async () => {
          try {
            await saveEmployees([], true);
            showNotification("ลบรายชื่อพนักงานทั้งหมดสำเร็จแล้ว", "success", "ลบข้อมูลสำเร็จ");
          } catch (e) {
            console.error("Error deleting all employees:", e);
            showNotification("เกิดข้อผิดพลาดในการลบพนักงานทั้งหมด", "error", "ลบล้มเหลว");
          }
        }
      );
    });
  };

  const handleDownloadExcelTemplate = () => {
    const templateData = [
      {
        "รหัสพนักงาน (ถ้าไม่มีระบบจะสุ่มให้)": "EMP-9001",
        "ชื่อ-นามสกุล *": "สมชาย ใจมั่นคง",
        "แผนก/สังกัด *": "แผนกจัดส่งสินค้า (ขนส่ง)",
        "ตำแหน่ง": "พนักงานขับรถทั่วไป",
        "รูปถ่ายพนักงาน (ลิงก์/Base64)": ""
      },
      {
        "รหัสพนักงาน (ถ้าไม่มีระบบจะสุ่มให้)": "EMP-9002",
        "ชื่อ-นามสกุล *": "นางสาววรรณา รักษ์ดี",
        "แผนก/สังกัด *": "ฝ่ายผลิต",
        "ตำแหน่ง": "เจ้าหน้าที่ฝ่ายเทคนิค",
        "รูปถ่ายพนักงาน (ลิงก์/Base64)": ""
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายชื่อพนักงาน");
    
    XLSX.writeFile(wb, "แบบฟอร์มนำเข้าพนักงาน_Template.xlsx");
    showNotification("ดาวน์โหลดไฟล์แบบฟอร์มตัวอย่างสำหรับนำเข้าสำเร็จ", "success", "ดาวน์โหลดเทมเพลตสำเร็จ");
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    
    setExcelFileError(null);
    
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (!result) {
          setExcelFileError("ไม่สามารถอ่านข้อมูลจากไฟล์ได้");
          return;
        }
        
        const data = new Uint8Array(result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
        
        if (jsonData.length === 0) {
          setExcelFileError("ไม่พบข้อมูลพนักงานในไฟล์ หรือไฟล์ว่างเปล่า");
          return;
        }
        
        const tempParsed: Employee[] = [];
        const defaultColors = ["%230284c7", "%234f46e5", "%230891b2", "%230d9488", "%23ea580c"];
        let skippedDuplicateCount = 0;
        
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          let nameVal = "";
          let idVal = "";
          let deptVal = "";
          let roleVal = "";
          let photoVal = "";
          
          for (const key of Object.keys(row)) {
            const cleanKey = key.trim().toLowerCase();
            
            if (cleanKey.includes("ชื่อ") || cleanKey.includes("name")) {
              nameVal = String(row[key] || "").trim();
            } else if (cleanKey.includes("รหัส") || cleanKey.includes("id")) {
              idVal = String(row[key] || "").trim();
            } else if (cleanKey.includes("แผนก") || cleanKey.includes("สังกัด") || cleanKey.includes("dept") || cleanKey.includes("department")) {
              deptVal = String(row[key] || "").trim();
            } else if (cleanKey.includes("ตำแหน่ง") || cleanKey.includes("หน้าที่") || cleanKey.includes("role") || cleanKey.includes("position")) {
              roleVal = String(row[key] || "").trim();
            } else if (cleanKey.includes("รูป") || cleanKey.includes("ภาพ") || cleanKey.includes("photo") || cleanKey.includes("image") || cleanKey.includes("avatar")) {
              photoVal = String(row[key] || "").trim();
            }
          }
          
          if (!nameVal) {
            const values = Object.values(row).map(v => String(v || "").trim()).filter(Boolean);
            if (values.length === 1) {
              nameVal = values[0];
            } else if (values.length > 1) {
              const potentialName = values.find(v => 
                v !== idVal && 
                v !== deptVal && 
                v !== roleVal && 
                isNaN(Number(v)) && 
                v.length >= 2
              );
              nameVal = potentialName || values.find(v => v !== idVal) || values[0];
            }
          }
          
          if (!nameVal) {
            continue;
          }
          
          if (!deptVal) {
            deptVal = "อื่นๆ (บุคคลภายนอก/แขกผู้มาติดต่อ)";
          }
          
          if (!roleVal) {
            roleVal = "พนักงานทั่วไป";
          }
          
          if (!idVal) {
            idVal = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
          }
          
          // Check if already in tempParsed (to avoid duplicate entries in the excel sheet itself)
          const isDuplicateInExcel = tempParsed.some(
            emp => (idVal && emp.id.trim().toLowerCase() === idVal.trim().toLowerCase()) ||
                   emp.name.trim().toLowerCase() === nameVal.trim().toLowerCase()
          );
          
          if (isDuplicateInExcel) {
            skippedDuplicateCount++;
            continue; // Skip duplicate within Excel itself
          }
          
          const randomCol = defaultColors[Math.floor(Math.random() * defaultColors.length)];
          const fallbackPhoto = svgToBase64(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='${randomCol}'/><circle cx='50' cy='38' r='18' fill='white'/><path d='M22 80c0-12 14-18 28-18s28 6 28 18' fill='white'/><text x='50' y='92' fill='white' font-size='6.5' font-family='sans-serif' font-weight='bold' text-anchor='middle'>PROFILE: ${idVal}</text></svg>`);
          
          let finalPhoto = fallbackPhoto;
          if (photoVal) {
            if (photoVal.startsWith("data:image/") || photoVal.startsWith("http://") || photoVal.startsWith("https://") || photoVal.startsWith("blob:")) {
              finalPhoto = photoVal;
            } else if (photoVal.length > 40 && !photoVal.includes("/") && !photoVal.includes(" ")) {
              // Looks like a raw base64 string
              finalPhoto = `data:image/jpeg;base64,${photoVal}`;
            } else if (photoVal.length > 10) {
              finalPhoto = photoVal;
            }
          }
          
          tempParsed.push({
            id: idVal,
            name: nameVal,
            department: deptVal,
            role: roleVal,
            photo: finalPhoto
          });
        }
        
        if (tempParsed.length === 0) {
          if (skippedDuplicateCount > 0) {
            setExcelFileError(`ไม่พบรายชื่อในไฟล์ หรือรายชื่อทั้งหมดซ้ำซ้อนภายในไฟล์เอง`);
          } else {
            setExcelFileError("ไม่สามารถจับคู่หัวตารางข้อมูลในไฟล์ได้ กรุณาใช้แบบฟอร์มตัวอย่าง");
          }
          return;
        }
        
        setParsedEmployees(tempParsed);
        setShowExcelPreview(true);
        if (skippedDuplicateCount > 0) {
          showNotification(`อ่านไฟล์พนักงานสำเร็จ พบทั้งหมด ${tempParsed.length} คน (ข้ามรายชื่อที่ซ้ำกันในไฟล์ ${skippedDuplicateCount} คน)`, "info", "อ่านไฟล์สำเร็จ");
        } else {
          showNotification(`อ่านไฟล์พนักงานเรียบร้อย พบทั้งหมด ${tempParsed.length} คน`, "info", "อ่านไฟล์สำเร็จ");
        }
      } catch (err) {
        console.error(err);
        setExcelFileError("เกิดข้อผิดพลาดในการประมวลผลไฟล์ กรุณาตรวจสอบว่าเป็นไฟล์ประเภท Excel หรือ CSV ที่ถูกต้อง");
      }
    };
    
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleConfirmExcelImport = () => {
    if (parsedEmployees.length === 0) return;
    
    const runImport = () => {
      let updated = [...employees];
      const newDepts = [...departments];
      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      
      parsedEmployees.forEach(newEmp => {
        if (newEmp.department && !newDepts.some(d => d.toLowerCase() === newEmp.department.toLowerCase())) {
          newDepts.push(newEmp.department);
        }
        
        const existingIdx = updated.findIndex(emp => 
          emp.id.trim().toLowerCase() === newEmp.id.trim().toLowerCase() ||
          emp.name.trim().toLowerCase() === newEmp.name.trim().toLowerCase()
        );
        if (existingIdx >= 0) {
          if (importOption === "OVERWRITE") {
            const existingEmp = updated[existingIdx];
            updated[existingIdx] = {
              ...existingEmp,
              name: newEmp.name || existingEmp.name,
              department: newEmp.department || existingEmp.department,
              role: newEmp.role || existingEmp.role,
              photo: newEmp.photo && !newEmp.photo.startsWith("data:image/svg+xml") ? newEmp.photo : existingEmp.photo,
              updatedAt: new Date().toISOString()
            };
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          updated.push(newEmp);
          addedCount++;
        }
      });
      
      saveEmployees(updated);
      saveDepartments(newDepts);
      
      setParsedEmployees([]);
      setShowExcelPreview(false);
      
      let summaryParts = [];
      if (addedCount > 0) summaryParts.push(`เพิ่มใหม่ ${addedCount} คน`);
      if (updatedCount > 0) summaryParts.push(`อัปเดตข้อมูลเดิม ${updatedCount} คน`);
      if (skippedCount > 0) summaryParts.push(`ละเว้น/ข้าม ${skippedCount} คน`);
      
      let summaryStr = `นำเข้าพนักงานเรียบร้อย: ` + (summaryParts.length > 0 ? summaryParts.join(", ") : "ไม่มีการเปลี่ยนแปลง");
      
      showNotification(summaryStr, "success", "นำเข้าข้อมูลสำเร็จ");
    };

    requestPermission(`นำเข้าข้อมูลพนักงานจากไฟล์จำนวน ${parsedEmployees.length} คน`, runImport);
  };

  const handleRecordEmployeeLeave = (emp: Employee) => {
    setLeaveModal({
      show: true,
      employee: emp,
      reason: "ลากิจ",
      notes: ""
    });
  };

  const handleConfirmSaveLeave = (emp: Employee, reason: string, notes: string) => {
    const actionLabel = `บันทึกสถานะ ลา ของคุณ: ${emp.name} (${reason})`;
    requestPermission(actionLabel, () => {
      const testId = `LOG-LV-${Date.now().toString().slice(-6)}`;
      const symptomList = [reason];
      if (notes.trim()) {
        symptomList.push(notes.trim());
      }
      const newLog: AlcoholTestLog = {
        id: testId,
        timestamp: new Date().toISOString(),
        employeeName: emp.name,
        employeeId: emp.id,
        department: emp.department,
        alcoholLevel: 0,
        passLimit: getPassLimit(),
        isPassed: true,
        isLeave: true,
        symptoms: symptomList,
        notes: notes.trim() || `พนักงานลาสถานะ: ${reason}`,
        witness: witness.trim() || settings.testerName,
      };

      const updatedLogs = [newLog, ...logs];
      saveLogs(updatedLogs);
      setLeaveModal({ show: false, employee: null, reason: "ลากิจ", notes: "" });
      showNotification(`บันทึกข้อมูลสถานะการลาของคุณ ${emp.name} เรียบร้อยแล้ว`, "success", "บันทึกสำเร็จ");
    });
  };

  // 9. Export to CSV Format (Thai Windows-friendly CSV with BOM)
  const handleExportCSV = () => {
    // Get logs filtered by the selected calendar date
    const targetExportLogs = dbFilteredLogs;

    if (targetExportLogs.length === 0) {
      showNotification("ไม่พบบันทึกข้อมูลตามวันที่ที่เลือกในปฏิทินเพื่อส่งออกเอกสาร", "warning", "ไม่มีข้อมูลประวัติ");
      return;
    }

    const headers = [
      "รหัสการตรวจ",
      "วันและเวลา",
      "ชื่อ-นามสกุล",
      "ครั้งที่เป่า",
      "รหัสพนักงาน/สถานะ",
      "แผนก/สังกัด",
      "ปริมาณแอลกอฮอล์ (mg%)",
      "เกณฑ์ควบคุม (mg%)",
      "ผลการทดสอบ",
      "อาการ",
      "หมายเหตุ",
      "ผู้บันทึกผล"
    ];

    const csvRows = [
      headers.join(","),
      ...targetExportLogs.map(log => {
        const dateStr = new Date(log.timestamp).toLocaleString("th-TH").replace(/,/g, "");
        const statusStr = log.isLeave ? "ลา/ไม่ได้ตรวจ" : (log.isPassed ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์");
        const symptomsStr = log.isLeave ? "ลากิจ/ลาป่วย/ไม่ได้ตรวจคัดกรอง" : log.symptoms.join("; ");
        const attemptInfo = getLogAttemptInfo(log.id);
        const attemptStr = log.isLeave ? "ไม่ได้เป่าตรวจ" : `ครั้งที่ ${attemptInfo.attempt}${attemptInfo.attempt > 1 ? " (แก้ตัว)" : ""}`;
        const alcoholLevelVal = log.isLeave ? "ไม่ได้ตรวจ" : log.alcoholLevel;
        
        return [
          log.id,
          dateStr,
          `"${log.employeeName.replace(/"/g, '""')}"`,
          `"${attemptStr}"`,
          log.employeeId || "ทั่วไป",
          `"${log.department || ""}"`,
          alcoholLevelVal,
          log.passLimit,
          statusStr,
          `"${symptomsStr}"`,
          `"${(log.notes || "").replace(/"/g, '""')}"`,
          `"${(log.witness || "ไม่ระบุ").replace(/"/g, '""')}"`
        ].join(",");
      })
    ];

    // Build filename with date range details
    let dateSuffix = "ทั้งหมด";
    if (calendarMode === "SINGLE") {
      dateSuffix = `ประจำวันที่_${selectedCalendarDate.getFullYear() + 543}-${(selectedCalendarDate.getMonth() + 1).toString().padStart(2, '0')}-${selectedCalendarDate.getDate().toString().padStart(2, '0')}`;
    } else if (calendarMode === "RANGE") {
      const startDateStr = `${selectedCalendarDate.getFullYear() + 543}-${(selectedCalendarDate.getMonth() + 1).toString().padStart(2, '0')}-${selectedCalendarDate.getDate().toString().padStart(2, '0')}`;
      const endD = selectedCalendarEndDate || selectedCalendarDate;
      const endDateStr = `${endD.getFullYear() + 543}-${(endD.getMonth() + 1).toString().padStart(2, '0')}-${endD.getDate().toString().padStart(2, '0')}`;
      dateSuffix = `ระหว่างวันที่_${startDateStr}_ถึง_${endDateStr}`;
    }

    // Add Unicode BOM (\uFEFF) to excel displays Thai language correctly
    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานตรวจแอลกอฮอล์_${dateSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 9.1 Export to EXCEL (HTML table representation with embedded Base64 photos)
  const handleExportExcel = () => {
    // Get logs filtered by the selected calendar date
    const targetExportLogs = dbFilteredLogs;

    if (targetExportLogs.length === 0) {
      showNotification("ไม่พบบันทึกข้อมูลตามวันที่ที่เลือกในปฏิทินเพื่อส่งออกเอกสาร", "warning", "ไม่มีข้อมูลประวัติ");
      return;
    }

    // Build filename with date range details
    let dateSuffix = "ทั้งหมด";
    if (calendarMode === "SINGLE") {
      dateSuffix = `ประจำวันที่_${selectedCalendarDate.getFullYear() + 543}-${(selectedCalendarDate.getMonth() + 1).toString().padStart(2, '0')}-${selectedCalendarDate.getDate().toString().padStart(2, '0')}`;
    } else if (calendarMode === "RANGE") {
      const startDateStr = `${selectedCalendarDate.getFullYear() + 543}-${(selectedCalendarDate.getMonth() + 1).toString().padStart(2, '0')}-${selectedCalendarDate.getDate().toString().padStart(2, '0')}`;
      const endD = selectedCalendarEndDate || selectedCalendarDate;
      const endDateStr = `${endD.getFullYear() + 543}-${(endD.getMonth() + 1).toString().padStart(2, '0')}-${endD.getDate().toString().padStart(2, '0')}`;
      dateSuffix = `ระหว่างวันที่_${startDateStr}_ถึง_${endDateStr}`;
    }

    const htmlRows = targetExportLogs.map(log => {
      const dateStr = new Date(log.timestamp).toLocaleString("th-TH").replace(/,/g, "");
      const statusClass = log.isLeave ? "bg-leave" : (log.isPassed ? "bg-pass" : "bg-fail");
      const statusStr = log.isLeave ? "ลา/ไม่ได้ตรวจ" : (log.isPassed ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์");
      const symptomsStr = log.isLeave ? "ลากิจ/ลาป่วย/ไม่ได้ตรวจคัดกรอง" : log.symptoms.join("; ");
      const attemptInfo = getLogAttemptInfo(log.id);
      const attemptStr = log.isLeave ? "ไม่ได้เป่าตรวจ" : `ครั้งที่ ${attemptInfo.attempt}${attemptInfo.attempt > 1 ? " (แก้ตัว)" : ""}`;
      const alcoholLevelVal = log.isLeave ? "ไม่ได้ตรวจ" : log.alcoholLevel;
      
      // Image rendering inside Excel cell
      let imgHtml = "";
      if (log.photo) {
        imgHtml = `<img src="${log.photo}" width="60" height="60" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1;" />`;
      } else {
        imgHtml = `<span style="color: #94a3b8; font-size: 10px;">ไม่มีรูปภาพ</span>`;
      }

      return `
        <tr>
          <td>${log.id}</td>
          <td>${dateStr}</td>
          <td class="text-left">${log.employeeName}</td>
          <td>${attemptStr}</td>
          <td>${log.employeeId || "ทั่วไป"}</td>
          <td>${log.department || ""}</td>
          <td style="font-weight: bold; font-family: monospace;">${alcoholLevelVal}</td>
          <td style="font-family: monospace;">${log.passLimit}</td>
          <td class="${statusClass}">${statusStr}</td>
          <td class="text-left">${symptomsStr}</td>
          <td class="text-left">${log.notes || ""}</td>
          <td>${log.witness || "ไม่ระบุ"}</td>
          <td style="width: 70px; height: 70px; text-align: center; vertical-align: middle;">${imgHtml}</td>
        </tr>
      `;
    }).join("");

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-excel:office:office" xmlns:x="urn:schemas-microsoft-excel:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <style>
          body { font-family: 'Tahoma', 'Segoe UI', Arial, sans-serif; }
          table { border-collapse: collapse; }
          th { background-color: #4f46e5; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; text-align: center; }
          td { border: 1px solid #cbd5e1; padding: 6px; font-size: 12px; vertical-align: middle; text-align: center; }
          .text-left { text-align: left; }
          .bg-pass { background-color: #d1fae5; color: #065f46; }
          .bg-fail { background-color: #fee2e2; color: #991b1b; }
          .bg-leave { background-color: #f3f4f6; color: #374151; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th>รหัสการตรวจ</th>
              <th>วันและเวลา</th>
              <th>ชื่อ-นามสกุล</th>
              <th>ครั้งที่เป่า</th>
              <th>รหัสพนักงาน/สถานะ</th>
              <th>แผนก/สังกัด</th>
              <th>ปริมาณแอลกอฮอล์ (mg%)</th>
              <th>เกณฑ์ควบคุม (mg%)</th>
              <th>ผลการทดสอบ</th>
              <th>อาการ</th>
              <th>หมายเหตุ</th>
              <th>ผู้บันทึกผล</th>
              <th style="width: 70px;">รูปถ่ายหลักฐาน</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานตรวจแอลกอฮอล์_${dateSuffix}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification("ส่งออกรายงาน Excel พร้อมรูปภาพหลักฐานเรียบร้อยแล้ว", "success", "ส่งออกสำเร็จ");
  };

  // 9.2 Print Report via high-compatibility New Window Popup (supports Base64 images & bypasses iframe restrictions)
  const handlePrintReportWindow = () => {
    const targetPrintLogs = dbFilteredLogs;

    if (targetPrintLogs.length === 0) {
      showNotification("ไม่พบบันทึกข้อมูลตามวันที่เลือกเพื่อพิมพ์รายงาน", "warning", "ไม่มีข้อมูลประวัติ");
      return;
    }

    const dateRangeStr = calendarMode === "SINGLE" 
      ? `ประจำวันที่ ${selectedCalendarDate.getDate()} ${THAI_MONTHS[selectedCalendarDate.getMonth()]} พ.ศ. ${selectedCalendarDate.getFullYear() + 543}`
      : calendarMode === "RANGE"
      ? `ระหว่างวันที่ ${selectedCalendarDate.getDate()} ${THAI_MONTHS[selectedCalendarDate.getMonth()]} พ.ศ. ${selectedCalendarDate.getFullYear() + 543} ถึงวันที่ ${(selectedCalendarEndDate || selectedCalendarDate).getDate()} ${THAI_MONTHS[(selectedCalendarEndDate || selectedCalendarDate).getMonth()]} พ.ศ. ${(selectedCalendarEndDate || selectedCalendarDate).getFullYear() + 543}`
      : "บันทึกประวัติทั้งหมด";

    const reportRows = targetPrintLogs.map((log, index) => {
      const dateStr = new Date(log.timestamp).toLocaleString("th-TH").replace(/,/g, "");
      const statusStr = log.isLeave ? "ลา/ไม่ได้ตรวจ" : (log.isPassed ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์");
      const statusStyle = log.isLeave 
        ? "color: #b45309; background-color: #fffbeb;" 
        : (log.isPassed ? "color: #047857; background-color: #ecfdf5;" : "color: #b91c1c; background-color: #fef2f2;");
      const attemptInfo = getLogAttemptInfo(log.id);
      const attemptStr = log.isLeave ? "" : `(ครั้งที่ ${attemptInfo.attempt})`;
      const symptomsStr = log.isLeave ? "ไม่ได้ตรวจคัดกรองเนื่องจากลางาน" : log.symptoms.join("; ");
      const notesText = log.notes ? `<div style="font-size: 10px; color: #475569; margin-top: 3px; font-style: italic;">[หมายเหตุ: ${log.notes}]</div>` : "";
      
      const photoHtml = log.photo 
        ? `<img src="${log.photo}" style="width: 70px; height: 52px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1;" />`
        : `<span style="font-size: 10px; color: #94a3b8;">ไม่มีรูปภาพ</span>`;

      const signatureHtml = log.signature 
        ? `<img src="${log.signature}" style="max-width: 70px; max-height: 40px; object-fit: contain;" />`
        : `<span style="font-size: 10px; color: #94a3b8;">ไม่ได้เซ็น</span>`;

      return `
        <tr>
          <td style="text-align: center;">${index + 1}</td>
          <td style="text-align: center; font-family: monospace; font-size: 10px;">${dateStr}</td>
          <td style="font-weight: bold; font-size: 12px;">
            <div>${log.employeeName}</div>
            <div style="font-size: 10px; color: #64748b; font-weight: normal; margin-top: 2px;">${attemptStr}</div>
          </td>
          <td style="font-size: 11px;">
            <div style="font-family: monospace; font-weight: bold;">${log.employeeId || "ทั่วไป"}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${log.department || ""}</div>
          </td>
          <td style="text-align: center; font-family: monospace; font-weight: bold; font-size: 12px;">${log.isLeave ? "-" : `${log.alcoholLevel} mg%`}</td>
          <td style="text-align: center; font-weight: bold; font-size: 11px; ${statusStyle}">${statusStr}</td>
          <td style="font-size: 11px;">
            <div>${symptomsStr}</div>
            ${notesText}
          </td>
          <td style="text-align: center; vertical-align: middle;">${photoHtml}</td>
          <td style="text-align: center; vertical-align: middle;">${signatureHtml}</td>
        </tr>
      `;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showNotification("บราวเซอร์ของคุณบล็อกป๊อปอัป กรุณาคลิกปุ่ม 'อนุญาตป๊อปอัป' ของบราวเซอร์เพื่อดาวน์โหลดและพิมพ์ PDF", "warning", "บล็อกป๊อปอัป");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>รายงานผลคัดกรองการวัดปริมาณแอลกอฮอล์รายวัน</title>
          <meta charset="utf-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
            body {
              font-family: 'Sarabun', sans-serif;
              color: #1e293b;
              margin: 25px;
              padding: 0;
            }
            .header {
              text-align: center;
              padding-bottom: 15px;
              border-bottom: 2px solid #e2e8f0;
              margin-bottom: 20px;
            }
            .header h1 {
              font-size: 20px;
              margin: 0 0 6px 0;
              color: #0f172a;
              font-weight: 700;
            }
            .header p {
              font-size: 13px;
              margin: 3px 0;
              color: #475569;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 25px;
              font-size: 11px;
            }
            th {
              background-color: #f8fafc;
              color: #334155;
              font-weight: 700;
              border: 1px solid #cbd5e1;
              padding: 8px 6px;
              text-align: left;
            }
            th.center {
              text-align: center;
            }
            td {
              border: 1px solid #cbd5e1;
              padding: 6px;
              vertical-align: middle;
            }
            .footer-sig {
              margin-top: 40px;
              display: flex;
              justify-content: space-between;
              padding: 0 40px;
              page-break-inside: avoid;
            }
            .sig-box {
              text-align: center;
              width: 260px;
            }
            .sig-line {
              border-bottom: 1px solid #94a3b8;
              height: 40px;
              margin-bottom: 8px;
            }
            @media print {
              body { margin: 15mm 10mm; }
              .no-print { display: none; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>รายงานผลคัดกรองการวัดปริมาณแอลกอฮอล์รายวัน</h1>
            <p>${dateRangeStr}</p>
            <p style="font-size: 10px; color: #64748b;">ออกเอกสารเมื่อ ${new Date().toLocaleString("th-TH")}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th class="center" style="width: 5%;">ลำดับ</th>
                <th class="center" style="width: 15%;">วันและเวลา</th>
                <th style="width: 22%;">ชื่อ-นามสกุลพนักงาน</th>
                <th style="width: 13%;">รหัส/สังกัด</th>
                <th class="center" style="width: 10%;">แอลกอฮอล์</th>
                <th class="center" style="width: 10%;">ผลตรวจ</th>
                <th style="width: 15%;">อาการ / หมายเหตุ</th>
                <th class="center" style="width: 10%;">รูปหลักฐาน</th>
                <th class="center" style="width: 10%;">ลายเซ็น</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows}
            </tbody>
          </table>

          <div class="footer-sig">
            <div class="sig-box">
              <div class="sig-line"></div>
              <p style="font-size: 11px; font-weight: bold; margin: 0;">ลงชื่อผู้บันทึก/ผู้รับผิดชอบการคัดกรอง</p>
              <p style="font-size: 10px; color: #64748b; margin: 3px 0 0 0;">( ${witness.trim() || settings.testerName || "ผู้ตรวจการคัดกรอง"} )</p>
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              <p style="font-size: 11px; font-weight: bold; margin: 0;">ลงชื่อผู้ตรวจสอบ/พนักงานเจ้าหน้าที่หลัก</p>
              <p style="font-size: 10px; color: #64748b; margin: 3px 0 0 0;">( ............................................................ )</p>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Unified print handler that ensures high compatibility inside and outside of iframes
  const handleDirectPrint = () => {
    // If inside an iframe (such as the AI Studio preview environment), direct window.print() is blocked or behaves incorrectly.
    // In that case, we automatically delegate to opening a clean print window to bypass sandbox constraints.
    const isIframe = window.self !== window.top;
    if (isIframe) {
      handlePrintReportWindow();
    } else {
      try {
        window.print();
      } catch (err) {
        console.error("Direct print failed, falling back to window print:", err);
        handlePrintReportWindow();
      }
    }
  };

  // 10. Dashboard Stats Calculations
  // Helper to extract year, month, and day in Thailand (Asia/Bangkok) timezone
  const getBangkokDateParts = (dateOrString: Date | string) => {
    try {
      const d = typeof dateOrString === "string" ? new Date(dateOrString) : dateOrString;
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      const parts = formatter.formatToParts(d);
      const partMap = new Map(parts.map(p => [p.type, p.value]));
      return {
        year: parseInt(partMap.get("year") || "0", 10),
        month: parseInt(partMap.get("month") || "0", 10) - 1, // 0-indexed month
        day: parseInt(partMap.get("day") || "0", 10),
      };
    } catch (e) {
      console.error("Error formatting Bangkok date parts:", e);
      // Fallback to local timezone on error
      const d = typeof dateOrString === "string" ? new Date(dateOrString) : dateOrString;
      return {
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate()
      };
    }
  };

  // Helper to check if a log timestamp falls inside the selected calendar date/range filter
  const checkLogMatchesCalendar = (timestamp: string) => {
    if (calendarMode === "ALL") {
      return true;
    }
    
    if (calendarMode === "SINGLE") {
      const parts1 = getBangkokDateParts(timestamp);
      const parts2 = getBangkokDateParts(selectedCalendarDate);
      return (
        parts1.year === parts2.year &&
        parts1.month === parts2.month &&
        parts1.day === parts2.day
      );
    }
    
    if (calendarMode === "RANGE") {
      const getBangkokMidnight = (dOrStr: Date | string) => {
        const parts = getBangkokDateParts(dOrStr);
        return new Date(parts.year, parts.month, parts.day).getTime();
      };
      
      const logTime = getBangkokMidnight(timestamp);
      const startTime = getBangkokMidnight(selectedCalendarDate);
      const endTime = selectedCalendarEndDate ? getBangkokMidnight(selectedCalendarEndDate) : startTime;
      
      return logTime >= startTime && logTime <= endTime;
    }
    
    return true;
  };

  // Helper to filter logs by selected dashboard calendar date filter, department, and search query
  const getFilteredLogsByDate = (targetLogs: AlcoholTestLog[]) => {
    return targetLogs.filter(log => {
      // 1. Calendar date filter
      if (!checkLogMatchesCalendar(log.timestamp)) return false;

      // 2. Department filter
      if (deptFilter !== "ALL" && log.department !== deptFilter) return false;

      // 3. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          log.employeeName.toLowerCase().includes(query) ||
          (log.employeeId && log.employeeId.toLowerCase().includes(query)) ||
          (log.department && log.department.toLowerCase().includes(query)) ||
          log.id.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    });
  };

  // Compute logs for the dashboard
  const dbFilteredLogs = getFilteredLogsByDate(logs);

  const statsTotal = dbFilteredLogs.length;
  const statsLeave = dbFilteredLogs.filter(l => l.isLeave).length;
  const statsActiveTests = dbFilteredLogs.filter(l => !l.isLeave);
  const statsTotalActive = statsActiveTests.length;
  const statsPassed = statsActiveTests.filter(l => l.isPassed).length;
  const statsFailed = statsActiveTests.filter(l => !l.isPassed).length;
  const statsPassRate = statsTotalActive > 0 ? Math.round((statsPassed / statsTotalActive) * 100) : 100;
  
  // Calculate average alcohol level for logs in matching range (excluding leave records)
  const averageLevel = statsTotalActive > 0
    ? Math.round(statsActiveTests.reduce((acc, curr) => acc + curr.alcoholLevel, 0) / statsTotalActive)
    : 0;

  // 10.1 Daily Roster / Coverage Checks
  // Separate Leave from Active Tests
  const leaveLogs = dbFilteredLogs.filter(l => l.isLeave);
  const leaveEmployeeIds = new Set(leaveLogs.map(l => l.employeeId).filter(id => !!id && id !== "PERSONAL"));
  const leaveEmployeeNames = new Set(leaveLogs.map(l => l.employeeName.trim()));

  const employeesOnLeave = employees.filter(emp =>
    leaveEmployeeIds.has(emp.id) || leaveEmployeeNames.has(emp.name.trim())
  );

  const activeTestLogs = dbFilteredLogs.filter(l => !l.isLeave);
  const activeTestedEmployeeIds = new Set(activeTestLogs.map(l => l.employeeId).filter(id => !!id && id !== "PERSONAL"));
  const activeTestedEmployeeNames = new Set(activeTestLogs.map(l => l.employeeName.trim()));

  const employeesActiveTested = employees.filter(emp =>
    activeTestedEmployeeIds.has(emp.id) || activeTestedEmployeeNames.has(emp.name.trim())
  );

  // Remaining employees: not active tested AND not on leave
  const employeesNotTested = employees.filter(emp =>
    !activeTestedEmployeeIds.has(emp.id) && !activeTestedEmployeeNames.has(emp.name.trim()) &&
    !leaveEmployeeIds.has(emp.id) && !leaveEmployeeNames.has(emp.name.trim())
  );

  const totalRegisteredCount = employees.length;
  const testedCount = employeesActiveTested.length;
  const leaveCount = employeesOnLeave.length;
  const notTestedCount = employeesNotTested.length;
  const coveragePercent = totalRegisteredCount > 0 
    ? Math.round(((testedCount + leaveCount) / totalRegisteredCount) * 100) 
    : 0;

  // 10.2 Match employee typing for autocomplete suggestions helper
  const matchingEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(employeeName.toLowerCase()) ||
    emp.id.toLowerCase().includes(employeeName.toLowerCase())
  );

  // 11. Applied Search and Filters
  const filteredLogs = logs.filter(log => {
    // Search filter
    const matchesSearch = 
      log.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.employeeId && log.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.department && log.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.id.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus = 
      statusFilter === "ALL" || 
      (statusFilter === "PASS" && log.isPassed && !log.isLeave) || 
      (statusFilter === "FAIL" && !log.isPassed && !log.isLeave) ||
      (statusFilter === "LEAVE" && log.isLeave);

    // Department Filter
    const matchesDept =
      deptFilter === "ALL" ||
      (log.department === deptFilter);

    // Filter by date (keeps lists aligned)
    const matchesDate = checkLogMatchesCalendar(log.timestamp);

    return matchesSearch && matchesStatus && matchesDept && matchesDate;
  });

  // Find if current employee has a failed test as their last result
  const lastFailedLog = (() => {
    if (!employeeName.trim()) return null;
    const empLogs = logs.filter(log => log.employeeName.trim().toLowerCase() === employeeName.trim().toLowerCase());
    if (empLogs.length === 0) return null;
    const lastLog = empLogs[0];
    if (!lastLog.isPassed) {
      return lastLog;
    }
    return null;
  })();

  // Calculate retest timer details
  const retestTimerInfo = (() => {
    if (!lastFailedLog) return null;
    const failTime = new Date(lastFailedLog.timestamp).getTime();
    const currentTime = Date.now();
    const gracePeriodMs = (settings.retestGracePeriodMinutes || 15) * 60 * 1000;
    const timeLimit = failTime + gracePeriodMs;
    const timeLeftMs = timeLimit - currentTime;
    const isExpired = timeLeftMs <= 0;

    const absTimeLeft = Math.abs(timeLeftMs);
    const minutes = Math.floor(absTimeLeft / 60000);
    const seconds = Math.floor((absTimeLeft % 60000) / 1000);

    return {
      failTimeStr: new Date(lastFailedLog.timestamp).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }),
      isExpired,
      timeLeftStr: `${minutes} นาที ${seconds} วินาที`,
      rawTimeLeftMs: timeLeftMs,
      limitMinutes: settings.retestGracePeriodMinutes || 15,
    };
  })();

  // Active Retest waiting list with countdown timers
  const retestWaitingList = (() => {
    // Group logs by employeeName to find the latest log for each employee
    const uniqueEmployees = Array.from(new Set(logs.map(log => log.employeeName.trim())));
    
    const list = [];
    for (const nameVal of uniqueEmployees) {
      const name = nameVal as string;
      if (!name) continue;
      // Filter and sort logs chronologically desc (latest first)
      const empLogs = logs
        .filter(l => l.employeeName.trim().toLowerCase() === name.toLowerCase())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      if (empLogs.length > 0) {
        const latestLog = empLogs[0];
        // If their latest test is a fail, they must be in the waiting list!
        if (!latestLog.isPassed) {
          // If they were already marked as exceeded time ("เกินกำหนดเวลา"), they are no longer waiting
          const notesStr = latestLog.notes || "";
          const isFinalExceeded = notesStr.includes("เกินกำหนดเวลา") || 
                                  (latestLog.symptoms && latestLog.symptoms.includes("ไม่ได้เข้ารับการตรวจแก้ตัวตามกำหนด"));
          
          if (!isFinalExceeded) {
            const failTime = new Date(latestLog.timestamp).getTime();
            const gracePeriodMs = (settings.retestGracePeriodMinutes || 15) * 60 * 1000;
            const timeLimit = failTime + gracePeriodMs;
            const timeLeftMs = timeLimit - Date.now();
            
            // Apply department filter
            const matchesDept = deptFilter === "ALL" || latestLog.department === deptFilter;
            
            // Apply search query filter
            const matchesSearch = !searchQuery.trim() || 
              latestLog.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (latestLog.employeeId && latestLog.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) ||
              (latestLog.department && latestLog.department.toLowerCase().includes(searchQuery.toLowerCase()));

            if (matchesDept && matchesSearch) {
              list.push({
                employeeName: latestLog.employeeName,
                employeeId: latestLog.employeeId,
                department: latestLog.department,
                latestAlcoholLevel: latestLog.alcoholLevel,
                latestTimestamp: latestLog.timestamp,
                latestLogId: latestLog.id,
                timeLeftMs,
                isExpired: timeLeftMs <= 0,
              });
            }
          }
        }
      }
    }
    
    // Sort so those closest to running out of time (or already expired) are listed first
    return list.sort((a, b) => a.timeLeftMs - b.timeLeftMs);
  })();

  const formatCountdownStr = (timeLeftMs: number) => {
    if (timeLeftMs <= 0) {
      const absVal = Math.abs(timeLeftMs);
      const minOver = Math.floor(absVal / 60000);
      const secOver = Math.floor((absVal % 60000) / 1000);
      return {
        expired: true,
        text: `เกินเวลา ${minOver} นาที ${secOver} วินาที`,
      };
    } else {
      const min = Math.floor(timeLeftMs / 60000);
      const sec = Math.floor((timeLeftMs % 60000) / 1000);
      return {
        expired: false,
        text: `เหลือเวลา ${min} นาที ${sec} วินาที`,
      };
    }
  };

  const handleStartRetest = (empName: string, empId?: string, deptName?: string) => {
    // Populate form fields!
    setEmployeeName(empName);
    if (empId && empId !== "PERSONAL") {
      setIsTestModePersonal(false);
      setEmployeeId(empId);
    } else {
      setIsTestModePersonal(true);
      setEmployeeId("");
    }
    if (deptName) {
      setDepartment(deptName);
    }
    
    showNotification(`ดึงข้อมูลคุณ ${empName} เข้าระบบและกรอกฟอร์มอัตโนมัติแล้ว กรุณาดำเนินการตรวจเป่าแก้ตัว`, "info", "ดึงข้อมูลสำเร็จ");
    
    // Smooth scroll to the form
    const formElement = document.getElementById("alcohol-log-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        const inputEl = document.getElementById("employee-name-input") as HTMLInputElement;
        if (inputEl) {
          inputEl.focus();
        }
      }, 500);
    }
  };

  const handleRecordExceededTime = (empName: string, empId?: string, deptName?: string) => {
    const testId = `LOG-${Date.now().toString().slice(-6)}`;
    const newLog: AlcoholTestLog = {
      id: testId,
      timestamp: new Date().toISOString(),
      employeeName: empName.trim(),
      employeeId: empId === "PERSONAL" ? "PERSONAL" : (empId?.trim() || undefined),
      department: empId === "PERSONAL" ? "ตรวจวัดส่วนบุคคล" : deptName,
      alcoholLevel: 0,
      passLimit: getPassLimit(),
      isPassed: false, // Remains fail/unpassed since they missed their retest window
      symptoms: ["ไม่ได้เข้ารับการตรวจแก้ตัวตามกำหนด"],
      photo: svgToBase64(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 100 100'><rect width='100' height='100' fill='#7f1d1d'/><circle cx='50' cy='35' r='20' fill='#a8a29e'/><path d='M20 80c0-15 15-20 30-20s30 5 30 20' fill='#a8a29e'/><text x='50' y='90' fill='#f43f5e' font-size='8' font-family='sans-serif' text-anchor='middle'>EXCEEDED TIME</text></svg>`),
      notes: "เกินกำหนดเวลา",
      witness: settings.testerName,
    };

    const updatedLogs = [newLog, ...logs];
    saveLogs(updatedLogs);
    showNotification(`บันทึกหมายเหตุ เกินกำหนดเวลา สำหรับ ${empName} เรียบร้อยแล้ว`, "success", "บันทึกสำเร็จ");
  };

  if (isDbLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-xl max-w-sm w-full text-center space-y-5">
          <div className="flex justify-center">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl relative">
              <RefreshCw size={36} className="animate-spin text-indigo-600" />
            </div>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-slate-800 font-sans">กำลังเชื่อมต่อฐานข้อมูลร่วม (Cloud DB)</h2>
            <p className="text-xs text-slate-400 leading-normal font-sans font-medium">
              ประสานข้อมูลรายชื่อพนักงานและประวัติเป่าแอลกอฮอล์ทั้งหมด<br />
              ให้แสดงผลเหมือนกันทุกเบราว์เซอร์อัตโนมัติ
            </p>
          </div>
          <div className="text-[10px] bg-slate-50 border border-slate-100 text-slate-500 font-mono py-1.5 px-3 rounded-lg inline-block">
            Project ID: gen-lang-client-0500124353
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="main-applet-root" className="min-h-screen bg-slate-50 text-slate-930 flex flex-col p-3 md:p-6 select-none selection:bg-indigo-500/20 antialiased font-sans">
      
      {/* 12. App Top Header Banner */}
      <header id="app-header-banner" className="max-w-7xl w-full mx-auto mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 w-64 h-24 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-0 left-1/3 w-64 h-24 bg-rose-500/5 blur-3xl rounded-full pointer-events-none" />

        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-md ring-4 ring-indigo-500/10">
            <Shield size={26} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800 font-sans uppercase">
                บันทึกการเป่าแอลกอฮอล์รายวัน
              </h1>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono uppercase font-semibold tracking-wider self-center">
                Live SECURE
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium font-sans mt-0.5">
              {settings.companyName}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                dbStatus === "connected" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                dbStatus === "connecting" ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse" :
                dbStatus === "offline" ? "bg-sky-50 text-sky-700 border border-sky-200 animate-pulse" :
                "bg-rose-50 text-rose-700 border border-rose-200"
              }`} title={dbErrorMessage || undefined}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  dbStatus === "connected" ? "bg-emerald-500 animate-pulse" :
                  dbStatus === "connecting" ? "bg-amber-500" :
                  dbStatus === "offline" ? "bg-sky-500 animate-pulse" :
                  "bg-rose-500"
                }`} />
                {dbStatus === "connected" ? "ซิงค์คลาวด์เรียบร้อย (Cloud Synced)" :
                 dbStatus === "connecting" ? "กำลังเชื่อมคลาวด์..." :
                 dbStatus === "offline" ? "ระบบออนไลน์เรียลไทม์ (Smart Sync / Safe Cache)" :
                 "เชื่อมต่อคลาวด์ผิดพลาด"}
              </span>
              {dbErrorMessage && (
                <span className={`text-[10px] px-2 py-0.5 rounded font-sans max-w-xs truncate border ${
                  dbStatus === "offline" ? "text-sky-700 bg-sky-50 border-sky-100" : "text-rose-600 bg-rose-50 border-rose-100"
                }`} title={dbErrorMessage}>
                  รายละเอียด: {dbErrorMessage}
                </span>
              )}
              {dbStatus !== "connected" && (
                <button
                  type="button"
                  onClick={() => {
                    setDbRetryCount(prev => prev + 1);
                    showNotification("กำลังเริ่มเชื่อมต่อฐานข้อมูลใหม่อีกครั้ง...", "info", "เชื่อมต่อคลาวด์");
                  }}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold transition hover:underline cursor-pointer"
                  title="ลองกดเชื่อมต่อฐานข้อมูลใหม่อีกครั้ง"
                >
                  (ลองเชื่อมต่อใหม่)
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm("คุณต้องการล้างแคชเครื่องและบังคับดึงข้อมูลใหม่จากฐานข้อมูล Cloud ใช่หรือไม่?")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium transition hover:underline cursor-pointer"
                title="ล้างข้อมูลแคชสำรองในเครื่องและโหลดทุกอย่างใหม่จากคลาวด์ทันที"
              >
                (บังคับดึงข้อมูลใหม่)
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Clock Timer & Settings Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-slate-600 font-mono text-xs w-full sm:w-auto shadow-inner">
            <Clock size={14} className="text-indigo-600 shrink-0" />
            <span>{time || "กำลังโหลดเวลา..."}</span>
          </div>

          <button
            id="toggle-settings-btn"
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-center gap-1.5 text-xs font-sans font-medium bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 py-2.5 px-3.5 rounded-xl transition cursor-pointer shadow-sm text-slate-700"
          >
            <Settings size={14} className="text-slate-550" />
            ตั้งค่าเกณฑ์คัดกรอง
          </button>
        </div>
      </header>

      {/* 13. Settings overlay panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl w-full mx-auto mb-6 bg-white border border-slate-200 p-5 rounded-2xl shadow-xl relative z-20"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <Settings size={16} className="text-indigo-600" />
                ตั้งค่าระบบและเกณฑ์ตัดสิน (System Guidelines & Settings)
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              <div>
                <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                  ชื่อบริษัท / หน่วยงานสถานประกอบการ
                </label>
                <input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                  เกณฑ์คัดกรองไม่ผ่าน (Alcohol Pass Limit)
                </label>
                <div className="flex gap-2">
                  <select
                    value={settings.defaultPassLimit}
                    onChange={(e) => setSettings({ ...settings, defaultPassLimit: Number(e.target.value) })}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition cursor-pointer"
                  >
                    <option value={50}>50 mg% (กฎหมายจำกัดทั่วไปคนขับรถหลัก)</option>
                    <option value={20}>20 mg% (ผู้ขับขี่อายุน้อยกว่า 20 ปี / ใบขับขี่ชั่วคราว)</option>
                    <option value={0}>0 mg% (บริษัทนโยบายเป็นศูนย์ - Zero Tolerance)</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  * หากระดับแอลกอฮอล์เกินค่านี้จะถูกประเมินเป็น <span className="text-red-500 font-bold">"ไม่ผ่าน (FAILED)"</span> ทันที
                </p>
              </div>

              <div>
                <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                  ชื่อผู้บันทึกผลเริ่มต้น (Default Recorder)
                </label>
                <input
                  type="text"
                  value={settings.testerName}
                  onChange={(e) => setSettings({ ...settings, testerName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                  เวลาเป่าแก้ตัวใหม่หากไม่ผ่าน (นาที)
                </label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={settings.retestGracePeriodMinutes}
                  onChange={(e) => setSettings({ ...settings, retestGracePeriodMinutes: Math.max(1, Number(e.target.value)) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  * กำหนดระยะเวลาเป่าซ้ำภายในที่กำหนด (ค่าเริ่มต้น 15 นาที)
                </p>
              </div>

              <div>
                <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase flex items-center gap-1">
                  <Shield size={12} className="text-indigo-600" /> รหัสผ่านผู้ดูแลระบบ (Admin PIN)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={settings.adminPasscode}
                  onChange={(e) => setSettings({ ...settings, adminPasscode: e.target.value.trim() })}
                  placeholder="เช่น 1234"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans font-bold outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  * รหัสผ่านสำหรับอนุมัติการ เพิ่มรายชื่อ/ลบข้อมูลผู้บันทึก แผนก พนักงาน และประวัติการเป่า (ค่าเริ่มต้น 1234)
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-5 mt-4 pt-4 border-t border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.requireSignature}
                  onChange={(e) => setSettings({ ...settings, requireSignature: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer accent-indigo-600"
                />
                <span className="text-xs font-sans text-slate-600 font-medium">บังคับเซ็นลายเซ็นอิเล็กทรอนิกส์ยืนยันสถานะ</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.requirePhoto}
                  onChange={(e) => setSettings({ ...settings, requirePhoto: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer accent-indigo-600"
                />
                <span className="text-xs font-sans text-slate-600 font-medium">ต้องการรูปภาพอย่างเป็นทางการ (แนะนำ)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.autoBackupToDrive || false}
                  onChange={(e) => setSettings({ ...settings, autoBackupToDrive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer accent-indigo-600"
                />
                <span className="text-xs font-sans text-indigo-700 font-bold flex items-center gap-1">☁️ สำรองข้อมูลขึ้น Google Drive อัตโนมัติ (Auto Backup)</span>
              </label>
            </div>

            {/* Advanced Cloud Sync Manager Section */}
            <div className="mt-5 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 font-sans flex items-center gap-1.5 uppercase">
                ☁️ เครื่องมือจัดการซิงค์คลาวด์ขั้นสูง (Advanced Cloud Sync Tools)
              </h3>
              <p className="text-[10px] text-slate-500 font-sans mt-1">
                หากท่านเปิดใช้งานแอปนี้จากคอมพิวเตอร์เครื่องอื่นหรือโทรศัพท์มือถือแล้วข้อมูลไม่ขึ้น หรือต้องการให้ข้อมูลเรียลไทม์ตรงกันทันที 
                ท่านสามารถเลือกใช้ปุ่มบังคับซิงค์ข้อมูลด้านล่างนี้ได้โดยตรง:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {/* Force Upload Card */}
                <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[11px] font-bold text-amber-800 font-sans flex items-center gap-1">
                      <Upload size={13} /> บังคับอัปโหลดข้อมูลจากเครื่องนี้ขึ้นคลาวด์
                    </h4>
                    <p className="text-[9.5px] text-slate-500 font-sans mt-1">
                      ใช้ข้อมูลในโทรศัพท์หรือคอมพิวเตอร์เครื่องนี้ <strong>เขียนทับฐานข้อมูลบนระบบคลาวด์หลัก</strong> เพื่อให้เครื่องอื่นเห็นข้อมูลตามเครื่องนี้ทั้งหมด
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={handleForceUploadToCloud}
                    className="mt-3.5 w-full flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-bold py-1.5 px-3 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-sm font-sans"
                  >
                    {isSyncing ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Upload size={12} />
                    )}
                    ส่งข้อมูลเครื่องนี้ขึ้นระบบคลาวด์
                  </button>
                </div>

                {/* Force Download Card */}
                <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-3 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[11px] font-bold text-indigo-800 font-sans flex items-center gap-1">
                      <Download size={13} /> บังคับดาวน์โหลดข้อมูลคลาวด์ลงมาเครื่องนี้
                    </h4>
                    <p className="text-[9.5px] text-slate-500 font-sans mt-1">
                      ดึงข้อมูลล่าสุดจากคลาวด์หลัก <strong>มาเขียนทับเครื่องนี้ทันที</strong> เพื่ออัปเดตรายชื่อและประวัติเป่าให้เรียลไทม์ตรงกับเครื่องอื่นล่าสุด
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={handleForceDownloadFromCloud}
                    className="mt-3.5 w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-bold py-1.5 px-3 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-sm font-sans"
                  >
                    {isSyncing ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    ดึงข้อมูลจากระบบคลาวด์ล่าสุด
                  </button>
                </div>
              </div>

              {/* Memory Data Statistics Badge */}
              <div className="mt-3.5 bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                  สถิติตัวเลขข้อมูลบนเครื่องนี้:
                </span>
                <div className="flex flex-wrap gap-2 text-[10px] font-sans">
                  <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                    ประวัติเป่า: {logs.length} รายการ
                  </span>
                  <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                    พนักงาน: {employees.length} คน
                  </span>
                  <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                    ผู้ตรวจ: {supervisors.length} คน
                  </span>
                  <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                    แผนก: {departments.length} แผนก
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setSettings({
                    defaultPassLimit: 50,
                    companyName: "บริษัท ขนส่งและโลจิสติกส์ไทย จำกัด",
                    testerName: "พ.ต.ต. ณรงค์ พลเดช",
                    requireSignature: true,
                    requirePhoto: false,
                    retestGracePeriodMinutes: 15,
                    adminPasscode: "1234",
                    autoBackupToDrive: false,
                  });
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-sans font-bold rounded-lg transition"
              >
                คืนค่าตั้งต้น
              </button>
              <button
                type="button"
                onClick={() => handleSaveSettings(settings)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-sans font-bold rounded-lg transition"
              >
                บันทึกการตั้งค่า
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* ================= LEFT COLUMN: FORM ENTRY ================= */}
        <section id="form-entry-column" className="lg:col-span-5 flex flex-col gap-6">

          {/* Form container */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-lg flex flex-col">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 mb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Plus size={18} className="text-indigo-600" />
                กรอกผลตรวจวัดแอลกอฮอล์ใหม่
              </h2>

              {/* Mode Switcher: Supervisor / Private test */}
              <div className="bg-slate-50 p-1 rounded-lg border border-slate-200 flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsTestModePersonal(false);
                    setDepartment(departments[0] || "");
                  }}
                  className={`px-2 py-1 text-[10px] font-sans font-bold rounded transition-all ${
                    !isTestModePersonal 
                      ? "bg-indigo-600 text-white shadow" 
                      : "text-slate-500 hover:text-slate-800 font-medium"
                  }`}
                >
                  พนักงานบริษัท
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsTestModePersonal(true);
                    setEmployeeId("");
                  }}
                  className={`px-2 py-1 text-[10px] font-sans font-bold rounded transition-all ${
                    isTestModePersonal 
                      ? "bg-indigo-600 text-white shadow" 
                      : "text-slate-500 hover:text-slate-800 font-medium"
                  }`}
                >
                  คนนอก/ส่วนบุคคล
                </button>
              </div>
            </div>

            <form id="alcohol-log-form" onSubmit={handleSubmit} className="space-y-4">
              
              {/* Personal Details */}
              <div className="grid grid-cols-1 gap-3.5">
                <div>
                  <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 flex justify-between uppercase">
                    <span>ชื่อ-นามสกุล ผู้ได้รับการตรวจ *</span>
                    <span className="text-indigo-600 font-normal normal-case">ระบุจริงจังป้องกันความปลอดภัย</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <User size={14} />
                    </span>
                    <input
                      id="employee-name-input"
                      type="text"
                      required
                      placeholder={isTestModePersonal ? "ระบุชื่อผู้รับการตรวจ..." : "พิมพ์ชื่อ หรือรหัสพนักงานคอยค้นหาฐานข้อมูล..."}
                      value={employeeName}
                      onFocus={() => {
                        if (!isTestModePersonal) setShowEmployeeSuggestions(true);
                      }}
                      onChange={(e) => {
                        setEmployeeName(e.target.value);
                        if (!isTestModePersonal) {
                          setShowEmployeeSuggestions(true);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition shadow-inner"
                    />

                    {/* Autocomplete Suggestions Box */}
                    {showEmployeeSuggestions && !isTestModePersonal && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-40">
                        <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50 text-[10px] text-slate-400 font-sans font-bold uppercase sticky top-0">
                          <span>พนักงานตามคำค้นหา ({matchingEmployees.length})</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowEmployeeSuggestions(false);
                            }}
                            className="text-indigo-650 hover:text-indigo-850 text-[10px] font-sans font-bold"
                          >
                            ปิด [X]
                          </button>
                        </div>
                        {matchingEmployees.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400 font-sans">
                            ไม่พบชื่อพนักงาน | กรอกอิสระต่อได้เลย
                          </div>
                        ) : (
                          matchingEmployees.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                setEmployeeName(emp.name);
                                setEmployeeId(emp.id);
                                setDepartment(emp.department);
                                setShowEmployeeSuggestions(false);
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-indigo-50 text-xs font-sans flex items-center justify-between border-b border-slate-50 transition cursor-pointer"
                            >
                              <div className="flex items-center gap-2 truncate">
                                {emp.photo && (
                                  <img 
                                    src={emp.photo} 
                                    alt={emp.name} 
                                    className="w-7 h-7 rounded-md object-cover border border-slate-200 shadow-sm flex-shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div className="truncate">
                                  <span className="font-bold text-slate-800 block truncate">{emp.name}</span>
                                  <span className="text-[10px] text-slate-400 block truncate">{emp.role || "พนักงานทั่วไป"}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0 font-sans ml-2">
                                <span className="font-mono text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded block">{emp.id}</span>
                                <span className="text-[9px] text-slate-500 block mt-0.5">{emp.department}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {retestTimerInfo && (
                  <div className={`p-3.5 rounded-xl border flex flex-col gap-1.5 shadow-sm transition-all duration-300 ${
                    retestTimerInfo.isExpired 
                      ? "bg-amber-50 border-amber-300 text-amber-900" 
                      : "bg-rose-50 border-rose-200 text-rose-900 animate-pulse"
                  }`}>
                    <div className="flex items-center gap-2 font-bold font-sans text-xs">
                      {retestTimerInfo.isExpired ? "⚠️" : "⏱️"}
                      <span>
                        {retestTimerInfo.isExpired 
                          ? `เกินกำหนดเวลาเป่าแก้ตัวสำหรับ ${employeeName} แล้ว!` 
                          : `สิทธิ์เป่าแก้ตัวใหม่ของพนักงานที่สอบไม่ผ่านล่าสุด (ภายใน ${retestTimerInfo.limitMinutes} นาที)`}
                      </span>
                    </div>
                    <div className="text-xs font-sans leading-relaxed">
                      <p>
                        ผลตรวจรอบก่อนหน้า: <strong className="text-rose-600 font-extrabold">ไม่ผ่านเกณฑ์</strong> เมื่อเวลา <strong>{retestTimerInfo.failTimeStr} น.</strong>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs">
                        <span className="font-medium">
                          {retestTimerInfo.isExpired ? "ระยะเวลาที่เกินมา:" : "ต้องกลับมาเป่าแก้ไขให้ผ่านภายใน:"}
                        </span>
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                          retestTimerInfo.isExpired ? "bg-amber-200 text-amber-950" : "bg-rose-600 text-white"
                        }`}>
                          {retestTimerInfo.timeLeftStr}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {!isTestModePersonal && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                        รหัสพนักงาน (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น EMP-2023"
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition shadow-inner"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                        แผนก / สังกัดสาขา
                      </label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition cursor-pointer"
                      >
                        {departments.map((dept) => (
                           <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* INTERACTIVE ALCOHOL MEASURE ENGINE */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 shadow-inner flex flex-col items-center">
                <span className="text-xs text-slate-500 font-sans font-bold uppercase tracking-wider mb-2">
                  ค่าระดับแอลกอฮอล์ที่เป่าปืนตรวจวัด (Alcohol Level)
                </span>

                <div className="flex items-baseline gap-2 mb-2 relative">
                  {/* Glowing warning effects behind level display */}
                  <div className={`absolute -inset-4 blur-2xl opacity-10 rounded-full transition-all duration-500 ${isPassedResult ? "bg-emerald-500" : "bg-red-500"}`} />
                  
                  <span className={`text-6xl font-mono font-bold tracking-tight select-all transition-colors duration-300 relative z-10 ${isPassedResult ? "text-emerald-600" : "text-rose-600"}`}>
                    {alcoholLevel}
                  </span>
                  <span className="text-sm font-sans text-slate-500 font-bold relative z-10">mg%</span>
                </div>

                {/* Live Badge Result indicator */}
                <div className={`w-full text-center py-2 px-3 rounded-xl border font-sans text-xs font-bold transition-all duration-300 flex items-center justify-center gap-1.5 ${
                  isPassedResult 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-50/10" 
                    : "bg-red-50 border-red-200 text-red-700 animate-pulse shadow-sm shadow-red-50/10"
                }`}>
                  {isPassedResult ? (
                    <>
                      <Check size={14} strokeWidth={3} />
                      ผ่านเกณฑ์รับรอง (ต่ำกว่า {getPassLimit()} mg%)
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={14} strokeWidth={2.5} />
                      ไม่ผ่านเกณฑ์มาตรฐานสูงสุด! เกินกำหนด {getPassLimit()} mg%
                    </>
                  )}
                </div>

                {/* Custom Slider */}
                <div className="w-full mt-4">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1.5">
                    <span>0 (บริสุทธิ์)</span>
                    <span>150 mg% (สูงสุด)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="150"
                    value={alcoholLevel}
                    onChange={(e) => setAlcoholLevel(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                {/* Simulation Click Dials */}
                <div className="w-full mt-3 flex flex-wrap gap-1.5 justify-center">
                  <span className="text-[10px] text-slate-400 font-sans font-bold w-full text-center mb-1 uppercase">
                    คลิกเพื่อตั้งค่าจำลองด่วน (Simulator Buttons):
                  </span>
                  {[0, 15, 30, 48, 55, 75, 110].map((level) => {
                    const isOver = level > getPassLimit();
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleQuickLevelSet(level)}
                        className={`text-xs font-mono px-2 py-1 rounded transition whitespace-nowrap border ${
                          alcoholLevel === level
                            ? isOver ? "bg-red-600 border-red-600 text-white font-bold" : "bg-emerald-600 border-emerald-600 text-white font-bold"
                            : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"
                        }`}
                      >
                        {level === 0 ? "0 mg%" : `${level} mg%`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Physical Symptoms Checklist */}
              <div>
                <label className="block text-xs font-sans font-bold text-slate-500 mb-2 uppercase">
                  ประเมินอาการทางกายภาพเบื้องต้น (Symptom Assessment)
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {SYMPTOMS_LIST.map((symptom) => {
                    const isChecked = symptoms.includes(symptom);
                    return (
                      <label 
                        key={symptom} 
                        className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer select-none transition ${
                          isChecked 
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium" 
                            : "border-transparent hover:bg-slate-100 text-slate-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSymptomToggle(symptom)}
                          className="w-3.5 h-3.5 rounded border-slate-300 bg-slate-50 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer accent-indigo-600"
                        />
                        <span className="font-sans text-[11px] truncate">{symptom}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Camera Capture Module */}
              <div className="space-y-2">
                <label className="block text-xs font-sans font-bold text-slate-500 uppercase">
                  ถ่ายรูปผู้ทดสอบ {settings.requirePhoto && <span className="text-red-500 font-medium">* จำเป็น</span>}
                </label>
                <CameraCapture 
                  onCapture={(img) => setCapturedPhoto(img)} 
                  savedImage={capturedPhoto || undefined} 
                />


              </div>

              {/* Interactive Signature Pad */}
              <div className="pt-1">
                <SignaturePad 
                  onSave={(sig) => setCapturedSignature(sig)} 
                  savedSignature={capturedSignature}
                />
              </div>

              {/* Audit Details */}
              <div className="grid grid-cols-1 gap-3.5 pt-1">
                <div>
                  <label className="block text-xs font-sans font-bold text-slate-500 mb-1.5 uppercase">
                    หมายเหตุ / ความเห็นเพิ่มเติมผู้ตรวจวัด
                  </label>
                  <textarea
                    rows={2}
                    placeholder="ใส่ข้อมูลความพร้อมทางร่างกาย, เหตุผลการตรวจเพิ่มเติม (ถ้ามี)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition resize-none shadow-inner"
                  />
                </div>

                {/* ผู้บันทึกผล (Recorder/Operator Field) */}
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-sans font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                      <UserCheck size={14} className="text-indigo-600" /> ชื่อผู้บันทึกผลการคัดกรอง *
                    </span>
                    <span className="text-[9px] bg-indigo-50 text-indigo-700 font-sans font-bold px-2 py-0.5 rounded border border-indigo-100">
                      มีในระบบ {supervisors.length} คน
                    </span>
                  </div>

                  {/* Dropdown Quick Select */}
                  <div className="grid grid-cols-1 gap-2">
                    <select
                      value={supervisors.includes(witness) ? witness : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setWitness(e.target.value);
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition cursor-pointer"
                    >
                      <option value="">-- แตะเลือกรายชื่อจากฐานข้อมูลคลัง --</option>
                      {supervisors.map((name, idx) => (
                        <option key={idx} value={name}>{name}</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      required
                      placeholder="พิมพ์ชื่อ-นามสกุล หรือตำแหน่งผู้บันทึก..."
                      value={witness}
                      onChange={(e) => setWitness(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-sans outline-none focus:border-indigo-500 transition shadow-sm font-semibold"
                    />
                  </div>

                  {/* Quick Register New Recorder Input */}
                  <div className="pt-2 border-t border-slate-200/60 space-y-2">
                    <span className="text-[10px] text-slate-400 font-sans font-bold uppercase block">ลงทะเบียนเพิ่มชื่อผู้บันทึกผลใหม่:</span>
                    <div className="flex gap-1.5 items-center bg-white p-1 rounded-xl border border-slate-200">
                      <input
                        type="text"
                        placeholder="พิมพ์ชื่อเพื่อบันทึกลงตัวเลือกด่วน..."
                        value={newSupervisorInput}
                        onChange={(e) => setNewSupervisorInput(e.target.value)}
                        className="flex-1 bg-transparent px-2 py-1 text-slate-800 text-xs font-sans outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newSupervisorInput.trim();
                          if (!trimmed) {
                            showNotification("กรุณาระบุชื่อผู้บันทึกคนใหม่เพื่อบันทึก", "warning", "ไม่มีข้อมูล");
                            return;
                          }
                          if (supervisors.includes(trimmed)) {
                            showNotification("ผู้บันทึกท่านนี้มีในฐานข้อมูลอยู่แล้ว", "error", "รายชื่อซ้ำซ้อน");
                            return;
                          }
                          requestPermission(`ลงทะเบียนเพิ่มผู้บันทึกผลใหม่: ${trimmed}`, () => {
                            const updated = [...supervisors, trimmed];
                            saveSupervisors(updated);
                            setWitness(trimmed); // Set as selected immediately
                            setNewSupervisorInput("");
                            showNotification(`บันทึกคุณ "${trimmed}" เข้าสู่ระบบผู้บันทึกผลสำเร็จ`, "success", "ลงทะเบียนสำเร็จ");
                          });
                        }}
                        className="bg-indigo-600 hover:bg-indigo-750 text-white text-[10px] font-sans font-bold px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0"
                      >
                        + เพิ่มตัวเลือก
                      </button>
                    </div>
                  </div>

                  {/* Chips for selection/deletion */}
                  {supervisors.length > 0 && (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                      {supervisors.map((name, idx) => (
                        <div 
                          key={idx} 
                          className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border transition cursor-pointer ${
                            witness === name 
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <span 
                            onClick={() => setWitness(name)}
                            className="flex-1"
                          >
                            {name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestPermission(`ลบรายชื่อผู้บันทึกผลคุณ ${name}`, () => {
                                triggerConfirmation(
                                  "ลบรายชื่อผู้บันทึกผล",
                                  `คุณต้องการลบชื่อ "${name}" ออกจากระบบรายชื่อด่วนใช่หรือไม่?`,
                                  async () => {
                                    try {
                                      const updated = supervisors.filter(s => s !== name);
                                      if (witness === name) {
                                        setWitness(updated[0] || "");
                                      }
                                      await saveSupervisors(updated, true);
                                      showNotification(`ลบชื่อผู้บันทึก "${name}" สำเร็จ`, "info", "ลบสำเร็จ");
                                    } catch (e) {
                                      console.error("Error deleting supervisor:", e);
                                      showNotification("เกิดข้อผิดพลาดในการลบข้อมูล", "error", "ลบล้มเหลว");
                                    }
                                  }
                                );
                              });
                            }}
                            className="text-slate-400 hover:text-rose-600 font-bold text-[11px] leading-none select-none pl-1"
                            title="ลบรายชื่อนี้"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              <button
                id="btn-submit-test"
                type="submit"
                className={`w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-white font-sans font-bold text-sm tracking-wide shadow-md hover:shadow-lg transform transition-all duration-300 relative overflow-hidden ${
                  isPassedResult 
                    ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100/10 hover:shadow-indigo-200/20 active:scale-98 cursor-pointer" 
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-100/10 hover:shadow-rose-200/20 active:scale-98 cursor-pointer"
                }`}
              >
                บันทึกผลแกนแอลกอฮอล์
              </button>
            </form>
          </div>
        </section>

        {/* ================= RIGHT COLUMN: DASHBOARD & HISTORY ================= */}
        <section id="dashboard-history-column" className="lg:col-span-7 flex flex-col gap-6">
          
          {/* 14. Responsive Info Success Alert Banner */}
          <AnimatePresence>
            {showSuccessBanner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-xs font-bold font-sans text-emerald-900">บันทึกผลการเป่าแอลกอฮอล์เสร็จสมบูรณ์</h4>
                    <p className="text-[11px] text-emerald-700 font-mono">ID: {recentSavedId} | บันทึกระดับแอลกอฮอล์เรียบร้อยและระบบอัปเดตสถิติทันที</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSuccessBanner(false)}
                  className="text-emerald-500 hover:text-emerald-800 p-1 hover:bg-emerald-100 rounded-md transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dashboard Section Header with Date Filter */}
          {(() => {
            const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
            const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

            const viewYear = calendarViewMonth.getFullYear();
            const viewMonth = calendarViewMonth.getMonth();
            const daysInCurrentMonth = getDaysInMonth(viewYear, viewMonth);
            const firstDayIndex = getFirstDayOfMonth(viewYear, viewMonth); // 0 (Sun) to 6 (Sat)
            
            const calendarCells: { date: Date; isCurrentMonth: boolean }[] = [];
            
            // Padding from previous month
            const prevMonthVal = viewMonth === 0 ? 11 : viewMonth - 1;
            const prevYearVal = viewMonth === 0 ? viewYear - 1 : viewYear;
            const daysInPrevMonth = getDaysInMonth(prevYearVal, prevMonthVal);
            for (let i = firstDayIndex - 1; i >= 0; i--) {
              calendarCells.push({
                date: new Date(prevYearVal, prevMonthVal, daysInPrevMonth - i),
                isCurrentMonth: false
              });
            }
            
            // Current month days
            for (let i = 1; i <= daysInCurrentMonth; i++) {
              calendarCells.push({
                date: new Date(viewYear, viewMonth, i),
                isCurrentMonth: true
              });
            }
            
            // Padding for next month
            const nextMonthVal = viewMonth === 11 ? 0 : viewMonth + 1;
            const nextYearVal = viewMonth === 11 ? viewYear + 1 : viewYear;
            let nextMonthDay = 1;
            while (calendarCells.length < 42) {
              calendarCells.push({
                date: new Date(nextYearVal, nextMonthVal, nextMonthDay++),
                isCurrentMonth: false
              });
            }

            const isDateSelected = (date: Date) => {
              if (calendarMode === "ALL") return false;
              
              if (calendarMode === "SINGLE") {
                return (
                  date.getDate() === selectedCalendarDate.getDate() &&
                  date.getMonth() === selectedCalendarDate.getMonth() &&
                  date.getFullYear() === selectedCalendarDate.getFullYear()
                );
              }
              
              if (calendarMode === "RANGE") {
                const dTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
                const start = new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), selectedCalendarDate.getDate());
                const startTime = start.getTime();
                const end = selectedCalendarEndDate 
                  ? new Date(selectedCalendarEndDate.getFullYear(), selectedCalendarEndDate.getMonth(), selectedCalendarEndDate.getDate())
                  : start;
                const endTime = end.getTime();
                
                return dTime >= startTime && dTime <= endTime;
              }
              
              return false;
            };

            const isDateToday = (date: Date) => {
              const parts1 = getBangkokDateParts(date);
              const parts2 = getBangkokDateParts(new Date());
              return (
                parts1.day === parts2.day &&
                parts1.month === parts2.month &&
                parts1.year === parts2.year
              );
            };

            const handleDayClick = (date: Date) => {
              if (calendarMode === "ALL") {
                setCalendarMode("SINGLE");
                setSelectedCalendarDate(date);
                setSelectedCalendarEndDate(null);
              } else if (calendarMode === "SINGLE") {
                setSelectedCalendarDate(date);
                setSelectedCalendarEndDate(null);
              } else if (calendarMode === "RANGE") {
                if (!selectedCalendarEndDate) {
                  if (date < selectedCalendarDate) {
                    setSelectedCalendarDate(date);
                  } else {
                    setSelectedCalendarEndDate(date);
                  }
                } else {
                  setSelectedCalendarDate(date);
                  setSelectedCalendarEndDate(null);
                }
              }
            };

            const handlePrevMonth = () => {
              setCalendarViewMonth(new Date(viewYear, viewMonth - 1, 1));
            };

            const handleNextMonth = () => {
              setCalendarViewMonth(new Date(viewYear, viewMonth + 1, 1));
            };

            const handlePresetSelect = (preset: "ALL" | "TODAY" | "YESTERDAY" | "LAST_7" | "LAST_30") => {
              const today = new Date();
              if (preset === "ALL") {
                setCalendarMode("ALL");
              } else if (preset === "TODAY") {
                setCalendarMode("SINGLE");
                setSelectedCalendarDate(today);
                setSelectedCalendarEndDate(null);
                setCalendarViewMonth(today);
              } else if (preset === "YESTERDAY") {
                setCalendarMode("SINGLE");
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                setSelectedCalendarDate(yesterday);
                setSelectedCalendarEndDate(null);
                setCalendarViewMonth(yesterday);
              } else if (preset === "LAST_7") {
                setCalendarMode("RANGE");
                const start = new Date();
                start.setDate(start.getDate() - 6);
                setSelectedCalendarDate(start);
                setSelectedCalendarEndDate(today);
                setCalendarViewMonth(today);
              } else if (preset === "LAST_30") {
                setCalendarMode("RANGE");
                const start = new Date();
                start.setDate(start.getDate() - 29);
                setSelectedCalendarDate(start);
                setSelectedCalendarEndDate(today);
                setCalendarViewMonth(today);
              }
            };

            const startTxt = selectedCalendarDate.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
            const endTxt = selectedCalendarEndDate 
              ? selectedCalendarEndDate.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })
              : "";

            let activeFilterLabel = "";
            if (calendarMode === "ALL") {
              activeFilterLabel = "แสดงผลแอลกอฮอล์สะสมทั้งหมด";
            } else if (calendarMode === "SINGLE") {
              activeFilterLabel = isDateToday(selectedCalendarDate) ? `วันนี้ (${startTxt})` : `วันที่ ${startTxt}`;
            } else if (calendarMode === "RANGE") {
              activeFilterLabel = `ช่วงวันที่: ${startTxt} ${endTxt ? " ถึง " + endTxt : ""}`;
            }

            return (
              <div id="dashboard-date-filter" className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                      <Calendar size={16} className="text-indigo-600" />
                      ระบบควบคุมปฏิทินกรองระดับแอลกอฮอล์และสถิติ (Calendar Filters)
                    </h3>
                    <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-bold uppercase tracking-wide">
                      Interactive Visual Calendar & Statistical Control Panel
                    </p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-700 font-sans font-bold text-[11px] px-3 py-1 bg-indigo-50/70 border border-indigo-100 rounded-lg flex items-center gap-1.5 ml-0 md:ml-auto">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    ตัวเลือกปัจจุบัน: <span className="text-indigo-900">{activeFilterLabel}</span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-start">
                  
                  {/* LEFT: Mini Calendar View */}
                  <div className="w-full md:w-[260px] shrink-0 bg-slate-50 border border-slate-150 p-2 text-slate-800 rounded-xl flex flex-col gap-2">
                    {/* Month Picker / Navigator */}
                    <div className="flex items-center justify-between px-0.5">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 px-1.5 hover:bg-slate-200 text-slate-600 rounded-md border border-slate-200 bg-white transition cursor-pointer text-[10px] font-bold font-sans flex items-center justify-center"
                        title="เดือนก่อนหน้า"
                      >
                        <ChevronLeft size={11} />
                      </button>
                      
                      <span className="text-[11px] font-bold text-slate-700 font-sans">
                        {THAI_MONTHS[viewMonth]} {viewYear + 543}
                      </span>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 px-1.5 hover:bg-slate-200 text-slate-600 rounded-md border border-slate-200 bg-white transition cursor-pointer text-[10px] font-bold font-sans flex items-center justify-center"
                        title="เดือนถัดไป"
                      >
                        <ChevronRight size={11} />
                      </button>
                    </div>

                    {/* Week Header */}
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-slate-400 font-sans uppercase">
                      <span className="text-red-500">อา.</span>
                      <span>จ.</span>
                      <span>อ.</span>
                      <span>พ.</span>
                      <span>พฤ.</span>
                      <span>ศ.</span>
                      <span className="text-indigo-500">ส.</span>
                    </div>

                    {/* Day Grid Cells */}
                    <div className="grid grid-cols-7 gap-0.5">
                      {calendarCells.map((cell, idx) => {
                        const isSel = isDateSelected(cell.date);
                        const isToday = isDateToday(cell.date);
                        
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleDayClick(cell.date)}
                            className={`aspect-square relative rounded-md text-center text-[10px] font-sans font-bold flex items-center justify-center transition-all cursor-pointer ${
                              isSel 
                                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-150 z-10" 
                                : cell.isCurrentMonth
                                  ? isToday 
                                    ? "bg-amber-50 border border-amber-300 text-amber-900 font-extrabold" 
                                    : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-150"
                                  : "text-slate-300 bg-slate-50/50 hover:bg-slate-100"
                            }`}
                          >
                            <span>{cell.date.getDate()}</span>
                            {isToday && !isSel && (
                              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* RIGHT: Selector Mode & Quick Presets */}
                  <div className="flex-1 w-full flex flex-col justify-between gap-3">
                    <div className="space-y-3">
                      {/* Interactive Selection Mode */}
                      <div>
                        <label className="block text-[9px] font-sans font-bold text-slate-400 uppercase mb-1 tracking-wider">โหมดการเลือกข้อมูลปฏิทิน (Selection Mode)</label>
                        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-50 border border-slate-200 rounded-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setCalendarMode("SINGLE");
                              setSelectedCalendarEndDate(null);
                            }}
                            className={`py-1 px-2 text-[10px] font-bold font-sans rounded-md transition-all ${
                              calendarMode === "SINGLE"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-600 hover:text-slate-800"
                            }`}
                          >
                            วันเดียว
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalendarMode("RANGE")}
                            className={`py-1 px-2 text-[10px] font-bold font-sans rounded-md transition-all ${
                              calendarMode === "RANGE"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-600 hover:text-slate-800"
                            }`}
                          >
                            ช่วงสองวันที่
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalendarMode("ALL")}
                            className={`py-1 px-2 text-[10px] font-bold font-sans rounded-md transition-all ${
                              calendarMode === "ALL"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-600 hover:text-slate-800"
                            }`}
                          >
                            แสดงทั้งหมด
                          </button>
                        </div>
                      </div>

                      {/* Speed Presets */}
                      <div>
                        <label className="block text-[9px] font-sans font-bold text-slate-400 uppercase mb-1.5 tracking-wider">ปุ่มด่วนลัดการคัดกรอง (Quick Filters)</label>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { key: "TODAY", label: "คัดกรองวันนี้ [Default]" },
                            { key: "YESTERDAY", label: "ข้อมูลเมื่อวาน" },
                            { key: "LAST_7", label: "7 วันล่าสุด" },
                            { key: "LAST_30", label: "30 วันล่าสุด" },
                            { key: "ALL", label: "ประวัติสะสมทั้งหมด" }
                          ].map((b) => {
                            let isActive = false;
                            if (b.key === "ALL") isActive = calendarMode === "ALL";
                            else if (b.key === "TODAY") isActive = calendarMode === "SINGLE" && isDateToday(selectedCalendarDate);
                            else if (b.key === "YESTERDAY") {
                              const yesterday = new Date();
                              yesterday.setDate(yesterday.getDate() - 1);
                              const parts1 = getBangkokDateParts(selectedCalendarDate);
                              const parts2 = getBangkokDateParts(yesterday);
                              isActive = calendarMode === "SINGLE" && 
                                         parts1.day === parts2.day &&
                                         parts1.month === parts2.month &&
                                         parts1.year === parts2.year;
                            } else if (b.key === "LAST_7") {
                              isActive = calendarMode === "RANGE" && 
                                         Math.abs(Date.now() - selectedCalendarDate.getTime()) < 8 * 86450000; // approximation
                            } else if (b.key === "LAST_30") {
                              isActive = calendarMode === "RANGE" && 
                                         Math.abs(Date.now() - selectedCalendarDate.getTime()) > 15 * 86450000; // approximation
                            }

                            return (
                              <button
                                key={b.key}
                                type="button"
                                onClick={() => handlePresetSelect(b.key as any)}
                                className={`px-2 py-1 text-[10px] font-sans font-bold rounded-lg border transition ${
                                  isActive
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {b.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Display guide based on current mode selection */}
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-150 text-[10px] font-sans text-slate-500 leading-normal space-y-0.5">
                      {calendarMode === "SINGLE" && (
                        <>
                          <div className="font-bold text-slate-700 uppercase mb-0.5 text-[9px]">คำแนะนำการกรองวันเดียว:</div>
                          <div>คลิกเลือกวันใดก็ได้บนตารางปฏิทินเพื่อเรียกดูทันที ระบบได้ตั้งค่าเริ่มต้นเป็น <span className="text-indigo-600 font-bold">วันปัจจุบัน</span> โดยอัตโนมัติ</div>
                        </>
                      )}
                      {calendarMode === "RANGE" && (
                        <>
                          <div className="font-bold text-slate-700 uppercase mb-0.5 text-[9px]">คำแนะนำการกรองช่วงวัน:</div>
                          <div>คลิกครั้งที่ 1 เพื่อกำหนด <span className="font-bold">วันเริ่มต้น</span> และคลิกครั้งที่ 2 เพื่อเลือก <span className="font-bold">วันสิ้นสุด</span> ซึ่งช่วงแถบสีของวันที่เลือกจะเปลี่ยนเป็นสีน้ำเงินทั้งหมด</div>
                        </>
                      )}
                      {calendarMode === "ALL" && (
                        <>
                          <div className="font-bold text-slate-700 uppercase mb-0.5 text-[9px]">คำแนะนำแสดงทั้งหมด:</div>
                          <div>ระบบกำลังเรียกขึ้นข้อมูลและประวัติการตรวจในฐานข้อมูลทั้งหมดโดยไม่พิจารณาวันที่บันทึก</div>
                        </>
                      )}
                    </div>

                  </div>

                </div>
              </div>
            );
          })()}

          {/* 15. Real-Time Bento Stats Dashboard */}
          {(() => {
            const getSelectedRangeLabel = () => {
              if (calendarMode === "ALL") {
                return { title: "การทดสอบสะสมทั้งหมด", subtitle: "ข้อมูลสะสมตลอดชีพ" };
              }
              const startTxt = selectedCalendarDate.toLocaleDateString("th-TH", { day: "numeric", month: "long" });
              if (calendarMode === "SINGLE") {
                const isToday = selectedCalendarDate.toDateString() === new Date().toDateString();
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const isYesterday = selectedCalendarDate.toDateString() === yesterday.toDateString();
                
                const dayLabel = isToday ? "วันนี้" : isYesterday ? "เมื่อวาน" : `วันที่ ${startTxt}`;
                return {
                  title: `จำนวนทดสอบ${dayLabel}`,
                  subtitle: `ประจำวันที่ ${selectedCalendarDate.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`
                };
              }
              if (calendarMode === "RANGE") {
                const endTxt = selectedCalendarEndDate 
                  ? selectedCalendarEndDate.toLocaleDateString("th-TH", { day: "numeric", month: "long" })
                  : "";
                return {
                  title: "ผลการคัดกรองตามช่วงเวลา",
                  subtitle: `ช่วงวัน: ${startTxt} ${endTxt ? " ถึง " + endTxt : ""}`
                };
              }
              return { title: "จำนวนทดสอบวันนี้", subtitle: "เทียบกะเดินรถวันปัจจุบัน" };
            };

            const statsLabelInfo = getSelectedRangeLabel();

            const exceededLogs = dbFilteredLogs
              .filter(log => !log.isLeave && !log.isPassed)
              .map(log => {
                const dateObj = new Date(log.timestamp);
                const dateStr = dateObj.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
                const timeStr = dateObj.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
                return {
                  id: log.id,
                  name: `${log.employeeName} (${dateStr} ${timeStr})`,
                  shortName: log.employeeName,
                  dateText: `${dateStr} ${timeStr}`,
                  level: log.alcoholLevel,
                  limit: log.passLimit,
                  dept: log.department || "ไม่ระบุ"
                };
              });

            return (
              <div id="stats-dashboard" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                
                {/* Left Column: Core Stats Stack (2x2 on tablets, vertical on desktop) */}
                <div className="lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-col gap-4">
                  
                  {/* CARD 1: Total */}
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm relative group overflow-hidden flex flex-col justify-between flex-1 min-h-[100px]">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-slate-100/50 blur-xl group-hover:scale-150 transition-all rounded-full" />
                    <div>
                      <span className="text-[10px] uppercase font-sans font-bold tracking-wider text-slate-500">
                        {statsLabelInfo.title}
                      </span>
                      <p className="text-3xl font-mono font-bold text-slate-800 mt-1">{statsTotal}</p>
                    </div>
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-sans font-medium">
                      <span>{statsLabelInfo.subtitle}</span>
                      <span className="text-indigo-600">อัปเดตสด</span>
                    </div>
                  </div>

                  {/* CARD 2: Passed */}
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm relative group overflow-hidden flex flex-col justify-between flex-1 min-h-[100px]">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/10 blur-xl group-hover:scale-150 transition-all rounded-full" />
                    <div>
                      <span className="text-[10px] uppercase font-sans font-bold tracking-wider text-emerald-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> ผ่านเกณฑ์
                      </span>
                      <p className="text-3xl font-mono font-bold text-emerald-600 mt-1">{statsPassed}</p>
                    </div>
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-sans font-medium">
                      <span>ระดับปลอดภัยต่อหน้าที่</span>
                      <span className="text-emerald-600 font-bold">{statsPassRate}% ผ่าน</span>
                    </div>
                  </div>

                  {/* CARD 3: Failed */}
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm relative group overflow-hidden flex flex-col justify-between flex-1 min-h-[100px]">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-rose-500/10 blur-xl group-hover:scale-150 transition-all rounded-full" />
                    <div>
                      <span className="text-[10px] uppercase font-sans font-bold tracking-wider text-red-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /> เกินค่ากำหนด
                      </span>
                      <p className="text-3xl font-mono font-bold text-red-600 mt-1">{statsFailed}</p>
                    </div>
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-sans font-medium">
                      <span>ระงับการขับและทำงาน</span>
                      <span className="text-red-500 font-bold">
                        {statsTotal > 0 ? Math.round((statsFailed / statsTotal) * 100) : 0}% เสี่ยง
                      </span>
                    </div>
                  </div>

                  {/* CARD 4: Leave / No Test */}
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm relative group overflow-hidden flex flex-col justify-between flex-1 min-h-[100px]">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-amber-500/10 blur-xl group-hover:scale-150 transition-all rounded-full" />
                    <div>
                      <span className="text-[10px] uppercase font-sans font-bold tracking-wider text-amber-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> ลา / ไม่ได้เป่าตรวจ
                      </span>
                      <p className="text-3xl font-mono font-bold text-amber-600 mt-1">{statsLeave}</p>
                    </div>
                    <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-sans font-medium">
                      <span>ลากิจ / ลาป่วย / ไม่ได้ตรวจ</span>
                      <span className="text-amber-600 font-bold">
                        {statsTotal > 0 ? Math.round((statsLeave / statsTotal) * 100) : 0}% ของทั้งหมด
                      </span>
                    </div>
                  </div>

                </div>

                {/* Right Column: Bar Chart instead of Average */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                        <AlertTriangle size={16} className="text-red-500 animate-pulse" />
                        กราฟสถิติผู้ตรวจพบระดับแอลกอฮอล์เกินมาตรฐานจำแนกรายครั้ง (mg%)
                      </h3>
                      <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                        แสดงรายการทดสอบที่มีผลการเป่าแอลกอฮอล์เกินเกณฑ์มาตรฐานในเวลาการกรองปัจจุบัน
                      </p>
                    </div>
                    <div className="bg-red-50 text-red-700 text-[10px] font-sans font-bold px-2 py-0.5 rounded-lg border border-red-100 uppercase">
                      พบทั้งหมด {exceededLogs.length} รายการ
                    </div>
                  </div>

                  {exceededLogs.length === 0 ? (
                    <div className="py-10 text-center flex flex-col items-center justify-center space-y-2 flex-1">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-150 flex items-center justify-center text-emerald-600">
                        <Check size={24} className="animate-bounce" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-emerald-700 font-sans">
                          ปลอดภัย 100%: ไม่พบสถิติแอลกอฮอล์เกินมาตรฐาน
                        </p>
                        <p className="text-[10px] text-slate-400 font-sans max-w-xs mx-auto">
                          พนักงานทุกคนที่ได้รับการคัดกรองมีผลตรวจอยู่ในระดับปลอดภัยทั้งหมดในช่วงเวลาการกรองที่เลือก
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div className="h-[210px] w-full font-sans text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={exceededLogs}
                            margin={{ top: 15, right: 10, left: -25, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="name"
                              tick={false}
                              tickLine={false}
                              axisLine={{ stroke: "#e2e8f0" }}
                              height={10}
                            />
                            <YAxis
                              tickLine={false}
                              axisLine={{ stroke: "#e2e8f0" }}
                              tick={{ fill: "#64748b", fontSize: 9 }}
                              domain={[0, (dataMax: number) => Math.max(dataMax + 20, 100)]}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-white p-3 border border-slate-150 rounded-xl shadow-lg space-y-1.5 text-xs font-sans">
                                      <div className="font-bold text-slate-800">{data.shortName}</div>
                                      <div className="text-[10.5px] text-slate-500">
                                        สังกัด: <span className="font-bold text-slate-700">{data.dept}</span>
                                      </div>
                                      <div className="text-[10.5px] text-slate-500">
                                        เวลาตรวจ: <span className="font-mono font-bold text-slate-700">{data.dateText}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 mt-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                        <div className="text-xs text-red-600 font-bold">
                                          ระดับที่เป่าได้: {data.level} mg%
                                        </div>
                                      </div>
                                      <div className="text-[9.5px] text-slate-400 font-sans">
                                        เกณฑ์สูงสุดที่อนุญาต: {data.limit} mg%
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <ReferenceLine
                              y={settings.defaultPassLimit}
                              stroke="#ef4444"
                              strokeDasharray="4 4"
                              label={{
                                value: `เกณฑ์สูงสุด (${settings.defaultPassLimit} mg%)`,
                                position: "top",
                                fill: "#ef4444",
                                fontSize: 8,
                                fontWeight: "bold",
                                fontFamily: "Inter, sans-serif"
                              }}
                            />
                            <Bar
                              dataKey="level"
                              fill="#ef4444"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            >
                              {exceededLogs.map((entry, index) => {
                                let barColor = "#f97316";
                                if (entry.level >= 100) {
                                  barColor = "#b91c1c";
                                } else if (entry.level >= 50) {
                                  barColor = "#dc2626";
                                }
                                return (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={barColor}
                                  />
                                );
                              })}
                              <LabelList
                                dataKey="level"
                                position="top"
                                fill="#475569"
                                fontSize={9.5}
                                fontWeight="bold"
                                formatter={(val: number) => `${val} mg%`}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[9px] font-sans font-semibold text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-150">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-sm bg-[#f97316]" />
                          <span>ระดับค่อนข้างสูง (เตือน)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-sm bg-[#dc2626]" />
                          <span>สูงเกินเกณฑ์กฎหมาย (&gt;= 50 mg%)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-sm bg-[#b91c1c]" />
                          <span>มึนเมาวิกฤต (&gt;= 100 mg%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })()}

          {/* Roster Coverage Dashboard & Database Manager */}
          <div id="roster-coverage-portal" className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                  <Award size={16} className="text-indigo-600" />
                  สรุปความครบถ้วนการคัดกรองพนักงานประจำวัน (Daily Coverage Checklist)
                </h3>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-bold uppercase tracking-wide">
                  Daily Attendance & Breathalyzer Checklist Coverage
                </p>
              </div>

              {/* Status Indicator */}
              <div className="shrink-0">
                {notTestedCount === 0 && totalRegisteredCount > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-sans font-bold rounded-xl border border-emerald-200 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> เป่าครบถ้วนทุกคนแล้ววันนี้
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-sans font-bold rounded-xl border border-amber-200 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> ยังขาดอีก {notTestedCount} คนที่ต้องตรวจ
                  </span>
                )}
              </div>
            </div>

            {/* Coverage Stats layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Left Column: Visual Ring / Coverage percentage */}
              <div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-slate-50 border border-slate-100 rounded-xl relative overflow-hidden">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  {/* SVG circular progress */}
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-200"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={notTestedCount === 0 ? "text-emerald-500" : "text-indigo-600"}
                      strokeDasharray={`${coveragePercent}, 100`}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-xl font-mono font-black text-slate-800">{coveragePercent}%</span>
                    <span className="block text-[8px] text-slate-400 font-sans tracking-tight font-bold">อัตราตรวจคัดกรอง</span>
                  </div>
                </div>
                 <p className="text-[11px] text-slate-600 font-sans font-bold mt-2 text-center">
                  เป่าตรวจ {testedCount} | ลางาน {leaveCount} | ค้างตรวจ {notTestedCount} (รวม {totalRegisteredCount} คน)
                </p>
              </div>

              {/* Right Column: Breakdown Lists & Call-to-actions */}
              <div className="md:col-span-8 space-y-3">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-sans font-black text-rose-600 flex items-center gap-1">
                      <AlertCircle size={12} /> พนักงานที่ยังไม่ได้เป่าคัดกรอง ({employeesNotTested.length})
                    </span>
                    <span className="text-[9px] text-slate-400 font-sans font-bold">คลิก "ส่งตรวจ" เพื่อกรอกข้อมูลพนักงานด่วน</span>
                  </div>

                  {employeesNotTested.length === 0 ? (
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg text-center text-xs text-emerald-800 font-sans font-semibold">
                      🎉 ยอดเยี่ยม! พนักงานในฐานข้อมูลทุกคนทำแบบทดสอบแอลกอฮอล์ครบถ้วนแล้ว
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                      {employeesNotTested.map((emp) => (
                        <div
                          key={emp.id}
                          className="p-2 border border-rose-100 hover:border-indigo-200 bg-white rounded-lg flex items-center justify-between gap-2 group transition-all"
                        >
                          <div className="truncate">
                            <span className="text-[11px] font-bold text-slate-800 block truncate leading-tight">{emp.name}</span>
                            <span className="text-[9px] text-slate-400 font-sans block truncate mt-0.5">{emp.department}</span>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEmployeeName(emp.name);
                                setEmployeeId(emp.id);
                                setDepartment(emp.department);
                                setIsTestModePersonal(false);
                                // Smooth scroll to form column if possible
                                const formCol = document.getElementById("form-entry-column");
                                if (formCol) {
                                  formCol.scrollIntoView({ behavior: "smooth" });
                                }
                              }}
                              className="bg-rose-50 text-rose-700 hover:bg-indigo-600 hover:text-white px-2 py-1 text-[9px] font-sans font-bold rounded-md transition cursor-pointer"
                            >
                              ส่งตรวจ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRecordEmployeeLeave(emp)}
                              className="bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white px-2 py-1 text-[9px] font-sans font-bold rounded-md transition cursor-pointer"
                              title="บันทึกสถานะ ลาหยุดงาน ของพนักงานคนนี้"
                            >
                              บันทึกการลา
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Already tested list summary */}
                <div className="space-y-2">
                  {employeesActiveTested.length > 0 && (
                    <div className="bg-slate-50/50 rounded-xl p-2.5 max-h-24 overflow-y-auto">
                      <p className="text-[10px] text-slate-400 font-sans font-bold mb-1.5 uppercase tracking-wide flex items-center gap-1">
                        <Check size={11} className="text-emerald-500" />
                        <span>พนักงานคัดกรองผ่านการตรวจแล้ว ({employeesActiveTested.length} คน):</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {employeesActiveTested.map(emp => (
                          <span key={emp.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded text-[10px] text-emerald-800 font-sans">
                            <Check size={9} className="text-emerald-600" />
                            {emp.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {employeesOnLeave.length > 0 && (
                    <div className="bg-slate-50/50 rounded-xl p-2.5 max-h-24 overflow-y-auto">
                      <p className="text-[10px] text-slate-400 font-sans font-bold mb-1.5 uppercase tracking-wide flex items-center gap-1">
                        <Calendar size={11} className="text-amber-500" />
                        <span>พนักงานแจ้งลางาน / ไม่ได้เป่าตรวจ ({employeesOnLeave.length} คน):</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {employeesOnLeave.map(emp => {
                          const log = leaveLogs.find(l => l.employeeId === emp.id || l.employeeName.trim() === emp.name.trim());
                          const reason = log?.symptoms[0] || "ลางาน";
                          return (
                            <span key={emp.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-100 rounded text-[10px] text-amber-800 font-sans">
                              <Calendar size={9} className="text-amber-500" />
                              {emp.name} <span className="text-[9px] text-amber-600 font-bold">({reason})</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Collapsible Employee Database Management Form & Directory Roster */}
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowManageDb(!showManageDb)}
                className="w-full flex items-center justify-between text-xs text-slate-600 hover:text-indigo-600 font-sans font-bold bg-slate-50 p-2.5 rounded-xl border border-slate-200 transition"
              >
                <span className="flex items-center gap-1.5">
                  <Settings size={14} className="text-slate-500" />
                  จัดการฐานข้อมูลและสตรีมรายชื่อพนักงานทั้งหมด ({employees.length} คน)
                </span>
                <span className="bg-white border border-slate-200 px-2.5 py-0.5 rounded text-[10px] text-indigo-600 shadow-sm">
                  {showManageDb ? "ซ่อนเมนูจัดการ [ ▲ ]" : "ขยายฐานข้อมูลรายชื่อ [ ▼ ]"}
                </span>
              </button>

              <AnimatePresence>
                {showManageDb && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-slate-50/70 border-x border-b border-indigo-150 rounded-b-xl space-y-4">
                      {/* Grid: Left - Register Form & Department management, Right - Directory list */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        
                        {/* LEFT COLUMN: REGISTER & DEPT MANAGEMENT */}
                        <div className="lg:col-span-1 flex flex-col space-y-4">
                          {/* REGISTER FORM */}
                          <form id="employee-register-form" onSubmit={handleAddEmployee} className="bg-white p-3 border border-slate-200 rounded-xl space-y-3">
                          <h4 className={`text-xs font-bold flex items-center gap-1 border-b border-slate-100 pb-1 font-sans ${editingEmployeeId ? "text-amber-700" : "text-indigo-700"}`}>
                            {editingEmployeeId ? <Pencil size={12} /> : <Plus size={12} />} {editingEmployeeId ? "แก้ไขข้อมูลพนักงานในระบบ" : "ลงทะเบียนพนักงานใหม่เข้าระบบ"}
                          </h4>
                          {editingEmployeeId && (
                            <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl flex items-center justify-between text-[10px] text-amber-800 font-sans">
                              <span>กำลังแก้ไขพนักงานรหัส: <strong>{editingEmployeeId}</strong></span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmployeeId(null);
                                  setNewEmpId("");
                                  setNewEmpName("");
                                  setNewEmpRole("");
                                  setNewEmpPhoto("");
                                }}
                                className="text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                              >
                                ยกเลิกแก้ไข
                              </button>
                            </div>
                          )}
                          <div>
                            <label className="block text-[10px] font-sans font-bold text-slate-500 mb-1 uppercase">ชื่อ-นามสกุลจริง *</label>
                            <input
                              type="text"
                              required
                              placeholder="เช่น นายปัญญา สมาธิมั่น"
                              value={newEmpName}
                              onChange={(e) => setNewEmpName(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 transition"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-sans font-bold text-slate-500 mb-1 uppercase">รหัสพนักงาน (ถ้าต้องการ)</label>
                              <input
                                type="text"
                                placeholder="สุ่มให้อัตโนมัติ"
                                value={newEmpId}
                                onChange={(e) => setNewEmpId(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 text-xs font-sans placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 transition"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-sans font-bold text-slate-500 mb-1 uppercase">ตำแหน่ง/หน้าที่</label>
                              <input
                                type="text"
                                placeholder="เช่น พนักงานขับยก"
                                value={newEmpRole}
                                onChange={(e) => setNewEmpRole(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 text-xs font-sans placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-500 transition"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase">เลือกแผนกประจำ</label>
                              <button
                                type="button"
                                onClick={() => {
                                  const deptInput = document.getElementById("new-dept-input");
                                  if (deptInput) {
                                    deptInput.scrollIntoView({ behavior: "smooth", block: "center" });
                                    deptInput.focus();
                                  }
                                  showNotification("เลื่อนหน้าจอมาที่แถบด้านล่างเพื่อเพิ่มแผนกใหม่", "info", "จัดการแผนก");
                                }}
                                className="text-[10px] text-indigo-650 hover:text-indigo-800 font-sans font-bold flex items-center gap-0.5 cursor-pointer hover:underline"
                              >
                                ➕ เพิ่มแผนกใหม่
                              </button>
                            </div>
                            <select
                              value={newEmpDept}
                              onChange={(e) => setNewEmpDept(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 text-xs font-sans cursor-pointer focus:bg-white focus:border-indigo-500 transition"
                            >
                              {departments.filter(d => d !== "อื่นๆ (บุคคลภายนอก/แขกผู้มาติดต่อ)").map((dept) => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          </div>

                          {/* REGISTER PROFILE PHOTO COMPONENT */}
                          <div className="bg-slate-50/50 p-2.5 border border-slate-150 rounded-lg space-y-2">
                            <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase leading-none">
                              ภาพถ่ายใบหน้าจริงพนักงาน (Profile Face Photo)
                            </label>

                            {/* Camera View Area */}
                            {isRegCameraActive ? (
                              <div className="space-y-2">
                                <div className="relative w-full aspect-square max-w-[150px] mx-auto bg-black rounded-lg overflow-hidden border border-slate-300 shadow-inner">
                                  <video
                                    ref={regVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-3/4 h-3/4 rounded-full border border-dashed border-sky-400/50" />
                                  </div>
                                </div>
                                <div className="flex gap-1.5 justify-center">
                                  <button
                                    type="button"
                                    onClick={captureRegPhoto}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-[10px] font-bold px-3 py-1 rounded cursor-pointer transition flex items-center gap-1 shadow-sm"
                                  >
                                    <Camera size={11} /> บันทึกรูปภาพ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={stopRegCamera}
                                    className="bg-slate-400 hover:bg-slate-500 text-white font-sans text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer transition shadow-sm"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                                {regCameraError && (
                                  <div className="text-[9px] text-red-650 text-center font-sans font-semibold">
                                    {regCameraError}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {newEmpPhoto ? (
                                  <div className="relative w-14 h-14 rounded bg-slate-100 flex-shrink-0 border border-slate-200 overflow-hidden shadow-sm">
                                    <img 
                                      src={newEmpPhoto} 
                                      alt="employee profile preview" 
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setNewEmpPhoto("")}
                                      className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:bg-red-700 leading-none cursor-pointer"
                                      title="ลบรูป"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ) : (
                                  <div className="w-14 h-14 rounded bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[8px] font-sans text-center leading-normal flex-shrink-0">
                                    ภาพถ่ายพนักงาน<br/>(สุ่มให้อัตโนมัติ)
                                  </div>
                                )}
                                <div className="flex-1 space-y-1">
                                  <button
                                    type="button"
                                    onClick={startRegCamera}
                                    className="w-full text-center py-1.5 bg-indigo-50 border border-indigo-150 text-indigo-750 hover:bg-indigo-100 rounded text-[9px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                                  >
                                    <Camera size={11} /> 📸 เปิดกล้องถ่ายจริงทันที...
                                  </button>
                                  <label className="inline-flex justify-center items-center px-1.5 py-1 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer w-full text-center shadow-sm">
                                    <span>📁 หรืออัปโหลดไฟล์รูปแทน...</span>
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="hidden" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onload = () => {
                                            if (typeof reader.result === "string") {
                                              setNewEmpPhoto(reader.result);
                                              showNotification("อัปโหลดรูปภาพประจำตัวพนักงานเรียบร้อย", "info", "อัปโหลดภาพ");
                                            }
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            )}

                            {/* Hidden canvas for snapshot capturing */}
                            <canvas ref={regCanvasRef} className="hidden" />
                          </div>

                          {editingEmployeeId ? (
                            <div className="space-y-2">
                              <button
                                type="submit"
                                className="w-full text-white bg-amber-600 hover:bg-amber-700 shadow-amber-100 shadow-md font-sans font-bold py-2 rounded-lg text-xs transition uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                💾 บันทึกการแก้ไขข้อมูลพนักงานเดิม
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveAsNewEmployee}
                                className="w-full text-white bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100 shadow-md font-sans font-bold py-2 rounded-lg text-xs transition uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                ➕ บันทึกข้อมูลคัดลอกเป็นคนใหม่
                              </button>
                            </div>
                          ) : (
                            <button
                              type="submit"
                              className="w-full text-white bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 shadow-md font-sans font-bold py-2 rounded-lg text-xs transition uppercase tracking-wide cursor-pointer"
                            >
                              ตกลงลงทะเบียนชื่อเข้าฐานข้อมูล
                            </button>
                          )}
                        </form>

                        {/* EXCEL/CSV IMPORT CARD */}
                        <div className="bg-white p-3.5 border border-slate-200 rounded-xl flex flex-col space-y-3 shadow-sm">
                          <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 font-sans flex items-center gap-1.5">
                                <FileSpreadsheet size={14} className="text-emerald-600 animate-pulse" />
                                <span>นำเข้าพนักงานผ่าน Excel / CSV</span>
                              </h4>
                              <p className="text-[9px] text-slate-400 font-sans mt-0.5">
                                นำเข้ารายชื่อครั้งละหลายคนได้อย่างรวดเร็ว
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleDownloadExcelTemplate}
                              className="text-[9.5px] text-emerald-700 hover:text-emerald-900 font-bold font-sans bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition hover:bg-emerald-100/50"
                              title="ดาวน์โหลดแบบฟอร์มไฟล์ Excel"
                            >
                              <Download size={11} />
                              <span>แบบฟอร์ม</span>
                            </button>
                          </div>

                          {/* File input area */}
                          <div className="space-y-2">
                            <label className="block border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-xl p-3.5 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all group">
                              <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleExcelImport}
                                className="hidden"
                              />
                              <Upload size={18} className="mx-auto text-slate-400 group-hover:text-emerald-600 transition mb-1" />
                              <span className="text-[10px] font-sans font-bold text-slate-600 block group-hover:text-emerald-700 transition">
                                คลิกเพื่อเลือกไฟล์พนักงาน
                              </span>
                              <span className="text-[8.5px] font-sans text-slate-400 block mt-0.5">
                                รองรับไฟล์ .xlsx, .xls, .csv
                              </span>
                            </label>

                            {excelFileError && (
                              <div className="bg-red-50 border border-red-150 p-2 rounded-lg text-[9.5px] text-red-700 font-sans flex items-start gap-1.5 leading-snug">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <span>{excelFileError}</span>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* DIRECTORY LIST & DEPT MANAGEMENT COLUMN (lg:col-span-2) */}
                      <div className="lg:col-span-2 flex flex-col space-y-4">
                        {/* DIRECTORY LIST */}
                        <div className="bg-white p-3.5 border border-slate-200 rounded-xl flex flex-col space-y-3 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 font-sans flex items-center gap-1.5">
                                <span className="w-1.5 h-3 bg-indigo-600 rounded-full"></span>
                                รายชื่อพนักงานในฐานข้อมูลทั้งหมด ({employees.length} คน)
                              </h4>
                              <p className="text-[10px] text-slate-450 font-sans">
                                ค้นหารายชื่อ ตรวจสอบสถานะ แก้ไขข้อมูลพนักงาน หรือทำการลบพนักงาน
                              </p>
                            </div>
                            {/* Stats & Delete all */}
                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                              <span className="text-[10px] font-sans font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100/50">
                                ทั้งหมด {employees.length} คน
                              </span>
                              {employees.length > 0 && (
                                <button
                                  type="button"
                                  onClick={handleDeleteAllEmployees}
                                  className="text-[10px] font-sans font-bold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-2.5 py-0.5 rounded-lg border border-red-200 hover:border-red-600 transition flex items-center gap-1 cursor-pointer"
                                  title="ลบรายชื่อพนักงานทั้งหมดออกจากระบบ"
                                >
                                  <Trash2 size={11} />
                                  ลบรายชื่อทั้งหมด
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Search and Filters inside directory */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* Search Name/ID */}
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                                <Search size={12} />
                              </span>
                              <input
                                type="text"
                                placeholder="ค้นหาชื่อ, รหัส, ตำแหน่ง..."
                                value={empSearchQuery}
                                onChange={(e) => setEmpSearchQuery(e.target.value)}
                                className="w-full pl-7.5 pr-6 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 transition"
                              />
                              {empSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setEmpSearchQuery("")}
                                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600 text-[10px] font-bold cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            {/* Department filter select */}
                            <div>
                              <select
                                value={empFilterDept}
                                onChange={(e) => setEmpFilterDept(e.target.value)}
                                className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans text-slate-700 focus:bg-white focus:outline-none focus:border-indigo-500 transition"
                              >
                                <option value="ALL">🔍 ทุกแผนก / สังกัด</option>
                                {departments.map((dept) => (
                                  <option key={dept} value={dept}>
                                    {dept.replace(" (จำนวนคัดกรอง)", "")}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Found counts */}
                          {(empSearchQuery || empFilterDept !== "ALL") && (
                            <div className="flex items-center justify-between text-[10px] bg-indigo-50/50 border border-indigo-100 p-1.5 px-2.5 rounded-lg text-indigo-800 font-sans">
                              <span>พบผลลัพธ์การค้นหา: <strong>{
                                employees.filter(emp => {
                                  const q = empSearchQuery.trim().toLowerCase();
                                  const matchesSearch = !q || 
                                    emp.name.toLowerCase().includes(q) || 
                                    emp.id.toLowerCase().includes(q) || 
                                    (emp.role || "").toLowerCase().includes(q);
                                  const matchesDept = empFilterDept === "ALL" || emp.department === empFilterDept;
                                  return matchesSearch && matchesDept;
                                }).length
                              }</strong> คน จากทั้งหมด {employees.length} คน</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEmpSearchQuery("");
                                  setEmpFilterDept("ALL");
                                }}
                                className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                              >
                                ล้างตัวกรอง
                              </button>
                            </div>
                          )}

                          {/* Scrollable list with nice details */}
                          <div className="space-y-2 max-h-80 overflow-y-auto mt-2 pr-1 flex-1">
                            {(() => {
                              const filteredList = employees.filter(emp => {
                                const q = empSearchQuery.trim().toLowerCase();
                                const matchesSearch = !q || 
                                  emp.name.toLowerCase().includes(q) || 
                                  emp.id.toLowerCase().includes(q) || 
                                  (emp.role || "").toLowerCase().includes(q);
                                const matchesDept = empFilterDept === "ALL" || emp.department === empFilterDept;
                                return matchesSearch && matchesDept;
                              });

                              if (filteredList.length === 0) {
                                return (
                                  <div className="py-12 text-center text-xs text-slate-400 font-sans bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                    <div className="text-xl mb-1.5">🔍</div>
                                    ไม่พบพนักงานที่ตรงกับการค้นหาหรือเงื่อนไขตัวกรอง
                                  </div>
                                );
                              }

                              return filteredList.map((emp) => (
                                <div
                                  key={emp.id}
                                  className={`border p-2.5 rounded-xl flex items-center justify-between gap-3 text-xs transition ${
                                    editingEmployeeId === emp.id 
                                      ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-200/50" 
                                      : "bg-slate-50/85 hover:bg-slate-100/70 border-slate-200/60"
                                  }`}
                                >
                                  <div className="flex items-center gap-3 truncate">
                                    {emp.photo && (
                                      <div className="relative shrink-0">
                                        <img 
                                          src={emp.photo} 
                                          alt={emp.name} 
                                          className="w-9 h-9 rounded-lg object-cover border border-slate-300 shadow-sm"
                                          referrerPolicy="no-referrer"
                                        />
                                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[8px] text-slate-500 font-bold">
                                          ID
                                        </span>
                                      </div>
                                    )}
                                    <div className="truncate leading-normal">
                                      <span className="font-bold text-slate-800 text-xs block truncate">{emp.name}</span>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className="text-[9px] text-indigo-700 font-mono font-bold bg-indigo-50/80 px-1.5 py-0.5 rounded-md leading-none border border-indigo-100">
                                          {emp.id}
                                        </span>
                                        <span className="text-[9px] text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded-md leading-none truncate max-w-[120px]" title={emp.role || "พนักงานทั่วไป"}>
                                          {emp.role || "พนักงานทั่วไป"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right flex items-center gap-1.5 shrink-0">
                                    <div className="hidden sm:flex flex-col items-end mr-1 leading-normal">
                                      <span className="text-[10px] font-bold text-slate-700 max-w-[120px] truncate">
                                        {emp.department.replace(" (จำนวนคัดกรอง)", "").replace("รักษาความปลอดภัย (รปภ.)", "รปภ.")}
                                      </span>
                                      <span className="text-[8px] text-slate-400">แผนก/สังกัด</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-1">
                                      {/* Mobile-visible department badge */}
                                      <span className="sm:hidden text-[8px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-bold max-w-[60px] truncate mr-1">
                                        {emp.department.replace(" (จำนวนคัดกรอง)", "").replace("รักษาความปลอดภัย (รปภ.)", "รปภ.")}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingEmployeeId(emp.id);
                                          setNewEmpId(emp.id);
                                          setNewEmpName(emp.name);
                                          setNewEmpRole(emp.role || "");
                                          setNewEmpDept(emp.department);
                                          setNewEmpPhoto(emp.photo || "");
                                          // Scroll to register form
                                          const registerForm = document.getElementById("employee-register-form");
                                          if (registerForm) {
                                            registerForm.scrollIntoView({ behavior: "smooth" });
                                          }
                                          showNotification(`เลือกพนักงาน "${emp.name}" เพื่อแก้ไขข้อมูลแล้ว`, "info", "แก้ไขพนักงาน");
                                        }}
                                        className={`p-1.5 rounded-lg transition cursor-pointer border ${
                                          editingEmployeeId === emp.id 
                                            ? "bg-amber-100 border-amber-300 text-amber-800" 
                                            : "bg-white hover:bg-amber-50 border-slate-200 hover:border-amber-200 text-amber-600 hover:text-amber-800"
                                        }`}
                                        title="แก้ไขข้อมูลพนักงานคนนี้"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                        className="p-1.5 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-red-500 hover:text-red-700 rounded-lg transition cursor-pointer"
                                        title="ลบรหัสพนักงานออกจากระบบ"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>

                        {/* DEPARTMENT MANAGEMENT PLAN */}
                        <div id="dept-management-panel" className="bg-white p-4 border border-slate-200 rounded-2xl flex flex-col space-y-4 shadow-sm">
                          <div className="border-b border-slate-100 pb-2">
                            <h4 className="text-xs font-bold text-slate-800 font-sans flex items-center justify-between">
                              <span className="text-indigo-900 flex items-center gap-1.5 font-sans font-bold">
                                <span className="p-1 bg-indigo-50 text-indigo-600 rounded-lg">
                                  <FolderHeart size={14} />
                                </span>
                                จัดการรายชื่อแผนก/สังกัด
                              </span>
                              <span className="text-[10px] text-indigo-600 font-mono font-bold bg-indigo-50 px-2 py-0.5 rounded-full">
                                ทั้งหมด {departments.length} แผนก
                              </span>
                            </h4>
                            <p className="text-[10px] text-slate-400 font-sans mt-1">
                              เพิ่มหรือลบแผนกประจำสังกัดสำหรับบันทึกคัดกรองพนักงาน
                            </p>
                          </div>
                          
                          {/* Add Department input block */}
                          <div className="bg-indigo-50/40 p-3 rounded-xl border border-indigo-100/50 space-y-2.5">
                            <label className="block text-[9.5px] font-sans font-bold text-indigo-750 uppercase tracking-wide">➕ ลงทะเบียนแผนกใหม่</label>
                            <div className="flex gap-2">
                              <input
                                id="new-dept-input"
                                type="text"
                                placeholder="เช่น แผนกบัญชี, จัดซื้อ, คลังสินค้า..."
                                value={newDeptInput}
                                onChange={(e) => setNewDeptInput(e.target.value)}
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition placeholder-slate-400 shadow-sm"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const trimmed = newDeptInput.trim();
                                  if (!trimmed) {
                                    showNotification("กรุณาระบุชื่อแผนกใหม่ที่ประสงค์ลงทะเบียน", "warning", "ไม่มีข้อมูล");
                                    return;
                                  }
                                  if (departments.some(d => d.toLowerCase() === trimmed.toLowerCase())) {
                                    showNotification("ชื่อแผนก/สังกัดนี้มีอยู่ในฐานข้อมูลอยู่แล้ว", "error", "ข้อมูลซ้ำซ้อน");
                                    return;
                                  }
                                  requestPermission(`ลงทะเบียนเพิ่มแผนกใหม่: ${trimmed}`, () => {
                                    const updated = [...departments, trimmed];
                                    saveDepartments(updated);
                                    setNewDeptInput("");
                                    showNotification(`เพิ่มสังกัดแผนก "${trimmed}" เข้าระบบคัดกรองส่วนกลางสำเร็จ`, "success", "เพิ่มสำเร็จ");
                                  });
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-sans font-bold px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer shadow-sm flex items-center gap-1.5 hover:shadow-md"
                              >
                                <Plus size={13} />
                                <span>เพิ่มแผนก</span>
                              </button>
                            </div>
                          </div>

                          {/* Search bar inside Department Manager */}
                          {departments.length > 3 && (
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                                <Search size={11} />
                              </span>
                              <input
                                type="text"
                                placeholder="🔍 ค้นหาแผนก/สังกัด..."
                                value={deptSearchQuery}
                                onChange={(e) => setDeptSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200/60 rounded-lg pl-8 pr-2.5 py-1 text-[11px] font-sans outline-none focus:bg-white focus:border-indigo-500 transition placeholder-slate-400"
                              />
                              {deptSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setDeptSearchQuery("")}
                                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                                >
                                  <X size={11} />
                                </button>
                              )}
                            </div>
                          )}
 
                          {/* Departments list with Delete click option */}
                          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 flex-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                            {departments
                              .filter(dept => !deptSearchQuery || dept.toLowerCase().includes(deptSearchQuery.toLowerCase()))
                              .map((dept, idx) => {
                                const isUnremovable = dept === "อื่นๆ (บุคคลภายนอก/แขกผู้มาติดต่อ)";
                                const deptEmployeeCount = employees.filter(emp => emp.department === dept).length;
                                return (
                                  <div
                                    key={idx}
                                    className={`border p-2 rounded-xl flex items-center justify-between gap-3 text-xs transition-all duration-150 hover:shadow-xs ${
                                      isUnremovable 
                                        ? "bg-amber-50/30 border-amber-100 text-slate-600" 
                                        : "bg-slate-50/60 border-slate-150 hover:border-slate-300 text-slate-700 hover:bg-white"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className={`p-1.5 rounded-lg shrink-0 ${isUnremovable ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <Briefcase size={12} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <span className="font-bold text-slate-800 block truncate leading-tight">{dept}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          {deptEmployeeCount > 0 ? (
                                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[8.5px] font-sans font-bold border border-emerald-100/50">
                                              👥 พนักงาน {deptEmployeeCount} คน
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-slate-100 text-slate-400 text-[8.5px] font-sans font-medium">
                                              ไม่มีพนักงานสังกัด
                                            </span>
                                          )}
                                          {isUnremovable && (
                                            <span className="text-[8.5px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-150 font-sans font-bold">ระบบ</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {!isUnremovable && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          requestPermission(`ลบแผนกประจำสังกัด: ${dept}`, () => {
                                            triggerConfirmation(
                                              "ยืนยันการลบแผนกประจำสังกัด",
                                              `คุณแน่ใจหรือไม่ว่าต้องการลบแผนก "${dept}" ออกจากรายการแผนกสำหรับการคัดกรอง? (พนักงานที่สังกัดนี้จะไม่ถูกลบ)`,
                                              async () => {
                                                try {
                                                  const updated = departments.filter(d => d !== dept);
                                                  await saveDepartments(updated, true);
                                                  showNotification(`ลบแแผนก "${dept}" ออกจากฐานข้อมูลเรียบร้อย`, "success", "ลบสำเร็จ");
                                                } catch (e) {
                                                  console.error("Error deleting department:", e);
                                                  showNotification("เกิดข้อผิดพลาดในการลบแผนก", "error", "ลบล้มเหลว");
                                                }
                                              }
                                            );
                                          });
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer border border-transparent hover:border-red-100"
                                        title="ลบแผนก"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            {departments.filter(dept => !deptSearchQuery || dept.toLowerCase().includes(deptSearchQuery.toLowerCase())).length === 0 && (
                              <div className="text-center py-6 text-slate-400 text-xs font-sans">
                                🔍 ไม่พบแผนกที่ตรงกับตัวกรองค้นหา
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      </div>

                      {/* Google Drive Integration Panel */}
                      <div className="border-t border-slate-200/60 pt-4">
                        <div className="bg-gradient-to-r from-indigo-50/50 to-sky-50/50 border border-slate-200 rounded-2xl p-3.5 space-y-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 font-sans flex items-center gap-1.5">
                                <span className="p-1 bg-white border border-slate-200 text-indigo-650 rounded-lg shadow-sm flex items-center justify-center">
                                  <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z" />
                                  </svg>
                                </span>
                                ☁️ ระบบเชื่อมโยงคลาวด์สำรองข้อมูล Google Drive
                              </h4>
                              <p className="text-[10px] text-slate-500 font-sans mt-1">
                                ลงชื่อเข้าใช้ด้วยบัญชี Google เพื่อสำรองข้อมูลรายชื่อพนักงานและประวัติการตรวจทั้งหมดขึ้นไปเก็บรักษาอย่างปลอดภัย และเรียกคืนคืนระบบได้ตลอดเวลา
                              </p>
                            </div>
                            
                            {/* Google Auth Status / Actions */}
                            <div className="flex items-center gap-2">
                              {googleUser ? (
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                                  {googleUser.photoURL ? (
                                    <img 
                                      src={googleUser.photoURL} 
                                      alt="Google user avatar" 
                                      className="w-6 h-6 rounded-full object-cover border border-slate-100 shadow-sm"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-sans font-bold">
                                      {googleUser.displayName?.charAt(0) || "G"}
                                    </div>
                                  )}
                                  <div className="text-left leading-none pr-1">
                                    <span className="text-[9px] font-sans font-bold text-slate-700 block max-w-[120px] truncate">{googleUser.displayName}</span>
                                    <span className="text-[8px] font-sans text-slate-400 block max-w-[120px] truncate">{googleUser.email}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleGoogleLogout}
                                    className="px-2 py-1 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg text-[9px] font-bold font-sans transition cursor-pointer"
                                  >
                                    ลงชื่อออก
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleGoogleLogin}
                                  className="text-[10px] bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-sans font-bold py-1.5 px-3 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                    <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.94 5.94 0 0 1 8 12.571a5.94 5.94 0 0 1 5.991-5.943c1.616 0 3.081.638 4.17 1.676l3.19-3.19C19.343 3.143 16.786 2 13.991 2 8.483 2 4 6.483 4 11.99s4.483 9.99 9.991 9.99c5.629 0 10.205-4.576 10.205-10.205 0-.58-.048-1.16-.145-1.724H12.24z"></path>
                                  </svg>
                                  เชื่อมบัญชี Google Drive
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Drive Operations (Visible only when logged in) */}
                          {googleUser && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                              {/* Create Backup */}
                              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-sans font-bold text-indigo-700 uppercase tracking-wider block">💾 การสำรองข้อมูล (Backup)</span>
                                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                                    บันทึกประวัติการตรวจปัจจุบัน สังกัดรายชื่อพนักงาน และรายชื่อแผนกทั้งหมดขึ้นสู่ Google Drive ของผู้ควบคุมในฟอร์แมตไฟล์นิรภัย เพื่อป้องกันข้อมูลสูญหาย
                                  </p>
                                </div>
                                <div className="mt-3 space-y-2">
                                  <button
                                    type="button"
                                    onClick={handleBackupToDrive}
                                    disabled={isDriveLoading}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold py-2 px-3 rounded-lg text-[10px] transition cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-indigo-100 disabled:opacity-50"
                                  >
                                    {isDriveLoading ? "⏳ กำลังเชื่อมต่อคลาวด์..." : "⚡ เริ่มอัปโหลดสำรองข้อมูลใหม่ทันที"}
                                  </button>
                                  <label className="flex items-center gap-1.5 justify-center py-1 bg-indigo-50/50 border border-indigo-100 rounded-lg cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={settings.autoBackupToDrive || false}
                                      onChange={(e) => {
                                        const updatedSettings = { ...settings, autoBackupToDrive: e.target.checked };
                                        saveSettings(updatedSettings);
                                        if (e.target.checked) {
                                          showNotification("เปิดระบบสำรองข้อมูลอัตโนมัติขึ้น Google Drive เรียบร้อยแล้ว", "success", "เปิดระบบ Auto-Backup");
                                          triggerAutoBackup(undefined, undefined, undefined, undefined);
                                        } else {
                                          showNotification("ปิดระบบสำรองข้อมูลอัตโนมัติแล้ว", "info", "ปิด Auto-Backup");
                                        }
                                      }}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer accent-indigo-600"
                                    />
                                    <span className="text-[9.5px] font-sans font-bold text-indigo-700">🔄 สำรองข้อมูลอัตโนมัติหลังทำรายการ (Auto-Backup)</span>
                                  </label>
                                </div>
                              </div>

                              {/* Restore List */}
                              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col">
                                <span className="text-[10px] font-sans font-bold text-slate-700 uppercase tracking-wider block border-b border-slate-100 pb-1.5">
                                  📂 ไฟล์สำรองบน Google Drive ล่าสุด ({driveBackups.length} รายการ)
                                </span>
                                
                                {isDriveLoading && driveBackups.length === 0 ? (
                                  <div className="flex-1 flex items-center justify-center py-6 text-[10px] text-slate-400 font-sans">
                                    <span className="animate-spin mr-1.5">⏳</span> กำลังโหลดข้อมูลสำรองจาก Google Drive...
                                  </div>
                                ) : driveBackups.length === 0 ? (
                                  <div className="flex-1 flex items-center justify-center py-6 text-[10px] text-slate-400 font-sans italic text-center leading-normal">
                                    ยังไม่พบข้อมูลสำรองของคุณบน Google Drive<br/>กดเริ่มอัปโหลดด้านซ้ายเพื่อสำรองไฟล์แรก!
                                  </div>
                                ) : (
                                  <div className="space-y-1.5 max-h-36 overflow-y-auto mt-2 pr-1 flex-1">
                                    {driveBackups.map((file) => (
                                      <div
                                        key={file.id}
                                        className="bg-slate-50 hover:bg-slate-100/70 border border-slate-100 p-2 rounded-lg flex items-center justify-between gap-3 text-xs transition"
                                      >
                                        <div className="truncate flex-1">
                                          <span className="font-bold text-slate-700 block truncate text-[10px] leading-tight" title={file.name}>
                                            {file.name}
                                          </span>
                                          <span className="text-[8px] text-slate-400 font-mono block mt-0.5">
                                            {file.createdTime ? new Date(file.createdTime).toLocaleString("th-TH") : "ไม่พบวันที่"}
                                            {file.size && ` • ${(parseInt(file.size) / 1024).toFixed(1)} KB`}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => handleRestoreFromDrive(file.id, file.name)}
                                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-850 rounded text-[9px] font-bold font-sans transition cursor-pointer border border-indigo-150"
                                            title="เรียกคืนข้อมูลนี้มาทับระบบปัจจุบัน"
                                          >
                                            คืนค่า
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteBackupFromDrive(file.id, file.name)}
                                            className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded transition cursor-pointer"
                                            title="ลบไฟล์สำรองนี้"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Active Retest Countdown & Waiting List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg">
                  <Clock size={16} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-sans">
                    รายชื่อผู้ไม่ผ่านเกณฑ์ & กำลังรอเป่าแก้ตัวใหม่
                    {retestWaitingList.length > 0 && (
                      <span className="bg-rose-600 text-white text-[10px] font-sans font-extrabold px-2 py-0.5 rounded-full animate-bounce">
                        {retestWaitingList.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-medium">
                    รายชื่อพนักงานที่ผลตรวจล่าสุดไม่ผ่าน และต้องตรวจแก้ตัวใหม่ภายในกำหนดเวลา {settings.retestGracePeriodMinutes || 15} นาที
                  </p>
                </div>
              </div>
            </div>

            {retestWaitingList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 bg-emerald-50/40 rounded-xl border border-dashed border-emerald-200 text-center">
                <span className="text-2xl mb-1.5">🟢</span>
                <p className="font-sans text-xs font-bold text-emerald-800">ไม่มีรายชื่อผู้รอเป่าแก้ตัวในขณะนี้</p>
                <p className="font-sans text-[10px] text-emerald-600/80 mt-0.5">พนักงานทั้งหมดที่ทดสอบล่าสุดมีสถานะผ่านเกณฑ์การประเมิน 100%</p>
              </div>
            ) : (
              <>
                {/* Desktop view: Table */}
                <div className="hidden md:block overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold">
                        <th className="p-3">ชื่อพนักงาน</th>
                        <th className="p-3">สังกัด / แผนก</th>
                        <th className="p-3">ผลตรวจล่าสุด</th>
                        <th className="p-3">เวลาเป่าที่ตก</th>
                        <th className="p-3">เวลาถอยหลังแก้ตัว</th>
                        <th className="p-3 text-right">ดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {retestWaitingList.map((item) => {
                        const countdown = formatCountdownStr(item.timeLeftMs);
                        return (
                          <tr key={item.latestLogId} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="p-3">
                              <div className="font-bold text-slate-800">{item.employeeName}</div>
                              {item.employeeId && item.employeeId !== "PERSONAL" && (
                                <span className="font-mono text-[9px] bg-slate-100 px-1 py-0.5 rounded text-slate-500 font-bold">
                                  ID: {item.employeeId}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600">{item.department || "ทั่วไป"}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-rose-600 font-bold font-mono">{item.latestAlcoholLevel} mg%</span>
                                <span className="text-[9px] bg-red-50 border border-red-200 text-rose-700 px-1.5 py-0.5 rounded font-bold font-sans">
                                  ไม่ผ่านเกณฑ์
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-slate-500">
                              {new Date(item.latestTimestamp).toLocaleTimeString("th-TH", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit"
                              })} น.
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded font-bold font-mono text-[10px] ${
                                countdown.expired 
                                  ? "bg-amber-100 text-amber-900 border border-amber-300" 
                                  : "bg-rose-600 text-white border border-rose-700 animate-pulse"
                              }`}>
                                {countdown.expired ? "⚠️" : "⏱️"} {countdown.text}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartRetest(item.employeeName, item.employeeId, item.department)}
                                  className={`inline-flex items-center gap-1 text-[10px] font-sans font-bold px-2.5 py-1.5 rounded-lg transition cursor-pointer shadow-sm ${
                                    countdown.expired 
                                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                  }`}
                                >
                                  <RefreshCw size={11} /> เป่าแก้ตัวใหม่
                                </button>
                                {countdown.expired && (
                                  <button
                                    type="button"
                                    onClick={() => handleRecordExceededTime(item.employeeName, item.employeeId, item.department)}
                                    className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-sans font-bold px-2.5 py-1.5 rounded-lg transition cursor-pointer shadow-sm"
                                    title="บันทึกหมายเหตุ เกินกำหนดเวลา"
                                  >
                                    <AlertTriangle size={11} /> บันทึกเกินเวลา
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view: Cards list */}
                <div className="md:hidden flex flex-col gap-2.5">
                  {retestWaitingList.map((item) => {
                    const countdown = formatCountdownStr(item.timeLeftMs);
                    return (
                      <div key={item.latestLogId} className="p-3 bg-rose-50/10 border border-rose-100 rounded-xl flex flex-col gap-2">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-bold text-slate-800 text-xs">{item.employeeName}</div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {item.employeeId && item.employeeId !== "PERSONAL" && (
                                <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                                  ID: {item.employeeId}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500">{item.department || "ทั่วไป"}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-rose-600 font-extrabold font-mono text-xs">{item.latestAlcoholLevel} mg%</div>
                            <div className="text-[9px] text-slate-400">
                              ตรวจเมื่อ {new Date(item.latestTimestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-rose-100/50">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold font-mono text-[9px] ${
                            countdown.expired 
                              ? "bg-amber-100 text-amber-900 border border-amber-200" 
                              : "bg-rose-600 text-white animate-pulse"
                          }`}>
                            {countdown.expired ? "⚠️" : "⏱️"} {countdown.text}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartRetest(item.employeeName, item.employeeId, item.department)}
                              className={`inline-flex items-center gap-1 text-[9px] font-sans font-bold px-2 py-1 rounded-md transition cursor-pointer ${
                                countdown.expired
                                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
                              }`}
                            >
                              <RefreshCw size={9} /> เป่าแก้ตัว
                            </button>
                            {countdown.expired && (
                              <button
                                type="button"
                                onClick={() => handleRecordExceededTime(item.employeeName, item.employeeId, item.department)}
                                className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-sans font-bold px-2 py-1 rounded-md transition cursor-pointer shadow-sm"
                              >
                                <AlertTriangle size={9} /> บันทึกเกินเวลา
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 16. Filter Engine & Table Log Layout */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-lg flex flex-col flex-1">
            
            {/* Table title with action buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                  <FileText size={16} className="text-indigo-600" />
                  ประวัติผลบันทึกการเป่าแอลกอฮอล์
                </h3>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-medium">
                  แสดงรายงานเรียงลำดับจากล่าสุดไปหาอดีตที่ตรวจ
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPrintReport(true)}
                    className="flex items-center gap-1.5 justify-center bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-sans font-bold px-3.5 py-2 rounded-xl transition-all duration-150 cursor-pointer shadow-sm hover:shadow"
                    title="เปิดหน้าต่างพิมพ์รายงานพร้อมแสดงรูปถ่ายและลายเซ็นทุกรายการแบบสมบูรณ์ 100%"
                  >
                    <Printer size={14} /> พิมพ์รายงาน PDF (แนะนำ มีรูปถ่าย)
                  </button>

                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 justify-center bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-sans font-bold px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer shadow-sm hover:shadow-md"
                    title="ดาวน์โหลดรายงานในรูปแบบ Excel พร้อมรูปถ่ายหลักฐานประกอบ"
                  >
                    <FileSpreadsheet size={14} /> EXPORT EXCEL
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-sans font-bold px-3 py-2 rounded-xl transition cursor-pointer"
                  >
                    <Download size={14} /> EXPORT CSV
                  </button>

                  {logs.length === 0 ? (
                    <button
                      type="button"
                      onClick={handleLoadMockLogs}
                      className="flex items-center gap-1 justify-center bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-sans font-medium px-3 py-2 rounded-xl transition cursor-pointer"
                    >
                      โหลดข้อมูลจำลอง
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResetAllLogs}
                      className="flex items-center gap-1 justify-center bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-sans font-medium px-3 py-2 rounded-xl transition cursor-pointer"
                    >
                      ลบทั้งหมด
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-slate-500 font-sans italic">
                  💡 คำแนะนำ: บราวเซอร์/Excel บางรุ่นอาจบล็อกรูปภาพเพื่อความปลอดภัย หากรูปในไฟล์ Excel ไม่สามารถแสดงได้ แนะนำใช้ปุ่ม <strong>"พิมพ์รายงาน PDF"</strong> หรือใช้การคัดลอก (Copy) ตารางจากหน้าเว็บไปวางใน Excel โดยตรง
                </p>
              </div>
            </div>

            {/* Sub Filter Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
              
              {/* Search Text input */}
              <div className="md:col-span-5 relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="ค้นหา ชื่อ, รหัสพนักงาน หรือผล..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status Outcome selection filter */}
              <div className="md:col-span-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 text-xs font-sans outline-none cursor-pointer focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                >
                  <option value="ALL">ผลลัพธ์: ทั้งหมด</option>
                  <option value="PASS">เฉพาะ: ผ่านเกณฑ์ ✅</option>
                  <option value="FAIL">เฉพาะ: เกินเกณฑ์ ❌</option>
                  <option value="LEAVE">เฉพาะ: ลา/ไม่ได้ตรวจ 📅</option>
                </select>
              </div>

              {/* Department selections filter */}
              <div className="md:col-span-4">
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 text-xs font-sans outline-none cursor-pointer focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                >
                  <option value="ALL">สังกัด: ทุกแผนก</option>
                  <option value="ตรวจวัดส่วนบุคคล">เฉพาะ: ตรวจส่วนบุคคล</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* List Table Container */}
            <div id="logs-table-wrapper" className="flex-1 overflow-y-auto max-h-[500px] border border-slate-200 rounded-xl bg-slate-50/20 shadow-inner">
              
              {filteredLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                  <FileText size={42} className="text-slate-300 mb-2 stroke-1" />
                  <p className="font-sans text-sm text-slate-500 font-bold mb-1">ไม่พบประวัติผลการคัดกรอง</p>
                  <p className="font-sans text-xs text-slate-400 max-w-xs leading-normal">
                    ไม่พบชื่อหรือแถวที่ค้นหาตามเงื่อนไข ลองแก้ไขคีย์เวิร์ด หรือกด "โหลดข้อมูลจำลอง" เพื่อแสดงข้อมูลเบื้องต้น
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 bg-white">
                  <AnimatePresence initial={false}>
                    {filteredLogs.map((log) => {
                      const displayDate = new Date(log.timestamp).toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit"
                      });
                      const displayTime = new Date(log.timestamp).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit"
                      }) + " น.";

                      // Detect if this log is a retest of an older failed test within grace period
                      const isRetestLog = (() => {
                        const empLogs = logs.filter(l => l.employeeName.trim().toLowerCase() === log.employeeName.trim().toLowerCase());
                        const thisTime = new Date(log.timestamp).getTime();
                        const olderFailed = empLogs.find(l => {
                          const lTime = new Date(l.timestamp).getTime();
                          if (lTime >= thisTime) return false;
                          if (l.isPassed) return false;
                          const gracePeriodMs = (settings.retestGracePeriodMinutes || 15) * 60 * 1000;
                          return (thisTime - lTime) <= gracePeriodMs;
                        });
                        return !!olderFailed;
                      })();

                      return (
                        <motion.div
                          key={log.id}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`p-3 md:p-4 hover:bg-slate-50/80 transition flex items-center justify-between gap-3 relative ${log.isLeave ? "bg-amber-50/10 hover:bg-amber-50/30" : !log.isPassed ? "bg-red-50/20 hover:bg-red-50/40" : ""}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            
                            {/* Avatar/Photo thumbnail preview */}
                            <div className="w-12 h-12 rounded-xl border border-slate-200 overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center shadow-sm select-none">
                              {log.photo ? (
                                <img
                                  src={log.photo}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <User className="text-slate-400" size={20} />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-sans text-xs font-bold text-slate-800 truncate max-w-[120px] sm:max-w-none">
                                  {log.employeeName}
                                </span>
                                {log.employeeId && log.employeeId !== "PERSONAL" && (
                                  <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold shrink-0">
                                    {log.employeeId}
                                  </span>
                                )}
                                {log.isLeave ? (
                                  <span className="font-sans text-[8px] px-1.5 py-0.5 rounded font-bold shrink-0 border bg-amber-50 text-amber-700 border-amber-200">
                                    ไม่ได้เป่าคัดกรอง (ลา)
                                  </span>
                                ) : (() => {
                                  const attemptInfo = getLogAttemptInfo(log.id);
                                  return (
                                    <span className={`font-sans text-[8px] px-1.5 py-0.5 rounded font-bold shrink-0 border ${
                                      attemptInfo.attempt === 1 
                                        ? "bg-slate-100 text-slate-600 border-slate-200" 
                                        : "bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse"
                                    }`}>
                                      ครั้งที่ {attemptInfo.attempt} {attemptInfo.attempt > 1 && "(เป่าแก้ตัว)"}
                                    </span>
                                  );
                                })()}
                              </div>
                              
                              <p className="font-sans text-[10px] text-slate-500 mt-0.5 truncate flex items-center gap-1 font-medium">
                                <Briefcase size={10} className="shrink-0" />
                                {log.department || "ตรวจทั่วไป"}
                              </p>

                              <p className="font-mono text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-medium">
                                <Clock size={10} className="shrink-0 text-slate-300" />
                                {displayDate} • {displayTime}
                              </p>

                              <p className="font-sans text-[9.5px] text-slate-400/90 mt-0.5 flex items-center gap-1 font-medium">
                                <UserCheck size={10} className="shrink-0 text-slate-300" />
                                บันทึกโดย: {log.witness || "ไม่ระบุ"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            
                            {/* Alcohol Level value and dynamic badge */}
                            <div className="text-right flex flex-col justify-center">
                              {log.isLeave ? (
                                <span className="font-sans text-xs font-bold text-amber-600 block leading-tight">
                                  ลากิจ / ลาป่วย
                                </span>
                              ) : (
                                <span className={`font-mono text-base font-bold tracking-tight block ${log.isPassed ? "text-emerald-600" : "text-rose-600 font-bold"}`}>
                                  {log.alcoholLevel} mg%
                                </span>
                              )}
                              
                              <span className={`text-[9px] font-sans font-bold px-1.5 py-0.5 rounded inline-block self-end mt-0.5 ${
                                log.isLeave
                                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                                  : log.isPassed 
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                    : "bg-red-50 text-red-700 border border-red-100 animate-pulse"
                              }`}>
                                {log.isLeave ? "ลากิจ/ไม่ได้ตรวจ" : log.isPassed ? "ผ่านเกณฑ์" : "ไม่ผ่าน"}
                              </span>
                            </div>

                            {/* View Detail button */}
                            <div className="flex gap-1 items-center">
                              <button
                                type="button"
                                title="ดูรายละเอียดสลิปและหลักฐาน"
                                onClick={() => setSelectedLog(log)}
                                className="p-2 bg-white hover:bg-slate-50 rounded-lg text-slate-600 hover:text-slate-800 border border-slate-200 transition cursor-pointer"
                              >
                                <Eye size={14} />
                              </button>

                              <button
                                type="button"
                                title="ลบประวัตินี้"
                                onClick={() => handleDeleteLog(log.id)}
                                className="p-2 bg-white hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 border border-slate-200 hover:border-red-200 transition cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                          </div>

                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

            </div>

            {/* Total rows count summary */}
            <div className="mt-3 flex justify-between text-[11px] text-slate-400 font-sans font-bold px-1">
              <span>แสดงทั้งหมด {filteredLogs.length} จาก {logs.length} รายการบันทึก</span>
              <span>เกณฑ์มาตรฐานสากล: น้อยกว่า {getPassLimit()} mg%</span>
            </div>

          </div>

        </section>
      </main>

      {/* ================= LIGHTBOX detail modal ================= */}
      <AnimatePresence>
        {selectedLog && (
          <div id="detail-lightbox-modal" className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 max-w-lg w-full rounded-3xl overflow-hidden shadow-2xl relative"
            >
              
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 relative">
                <div>
                  <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full font-mono font-bold tracking-wider mb-1 inline-block">
                    {selectedLog.id}
                  </span>
                  {(() => {
                    const info = getLogAttemptInfo(selectedLog.id);
                    return (
                      <span className={`text-[10px] border px-2 py-0.5 rounded-full font-sans font-bold mb-1 ml-1.5 inline-block ${
                        info.attempt === 1 
                          ? "bg-slate-100 border-slate-200 text-slate-700" 
                          : "bg-indigo-50 border-indigo-200 text-indigo-700"
                      }`}>
                        เป่าครั้งที่ {info.attempt} {info.attempt > 1 && "(รอบแก้ตัว)"}
                      </span>
                    );
                  })()}
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    รายละเอียดบันทึกตรวจเป่าแอลกอฮอล์
                  </h3>
                </div>
                
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 text-slate-800">
                
                {/* Visual Status card */}
                {selectedLog.isLeave ? (
                  <div className="p-4 rounded-2xl border text-center relative bg-amber-50/70 border-amber-200 text-amber-800">
                    <div className="absolute top-1.5 right-3 text-[9px] opacity-60 font-mono font-bold uppercase tracking-wider">STATUS</div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl font-sans font-bold text-amber-700">ลากิจ / ลาป่วย / ไม่ได้เข้าตรวจ</span>
                      <span className="text-xs font-sans font-medium text-amber-600 mt-1.5 flex items-center gap-1.5">
                        📅 สถานะลางานเพื่อประเมินความครอบคลุมรายวัน
                      </span>
                      <p className="text-[10px] font-sans mt-2 max-w-sm leading-normal text-amber-700/90">
                        * พนักงานมีสถานะลาหยุด และไม่จำเป็นต้องส่งตรวจวัดระดับแอลกอฮอล์ในรอบคัดกรองประจำวันวันนี้
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-2xl border text-center relative ${
                    selectedLog.isPassed 
                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-800" 
                      : "bg-red-50/70 border-red-200 text-red-800"
                  }`}>
                    <div className="absolute top-1.5 right-3 text-[9px] opacity-60 font-mono font-bold uppercase tracking-wider">Verdict</div>
                    
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-mono font-bold">{selectedLog.alcoholLevel} mg%</span>
                      
                      <span className="text-xs font-sans font-bold flex items-center gap-1.5 mt-1.5">
                        {selectedLog.isPassed ? (
                          <>
                            <Award size={14} className="text-emerald-600" /> ผ่านเกณฑ์การประเมิน
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} className="animate-bounce text-red-600" /> มีความเสี่ยงสูง / ไม่ผ่านเกณฑ์มาตรฐาน
                          </>
                        )}
                      </span>
                      
                      {/* Legal Thai caution context */}
                      <p className={`text-[10px] font-sans mt-2 max-w-sm leading-normal ${selectedLog.isPassed ? "text-emerald-700" : "text-red-700 font-medium"}`}>
                        {selectedLog.isPassed 
                          ? "* ปริมาณสารอยู่ภายใต้พิกัดที่กำหนด สามารถขับขี่ปฏิบัติงานสัมผัสเคมีภัณฑ์หรือเครื่องจักรกลได้อย่างปลอดภัย" 
                          : "⚠️ แถบระดับเกินจำกัดสูงสุดที่กฎหมายบัญญัติ ต้องระงับการขับถอยรถขนสินค้า เดินเรือยกขึ้นที่สูง หรือเข้ากะปฏิบัติวิชาชีพอย่างน้อย 8-12 ชั่วโมง"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Person details */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans font-bold block uppercase">ชื่อ-นามสกุล ผู้ได้รับการตรวจ:</span>
                    <span className="text-xs font-bold text-slate-800 font-sans mt-0.5 block">{selectedLog.employeeName}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-sans font-bold block uppercase">รหัสพนักงาน/ผู้ตรวจสอบ:</span>
                    <span className="text-xs font-bold text-slate-800 font-mono mt-0.5 block">
                      {selectedLog.employeeId === "PERSONAL" ? "ภายนอก / ส่วนบุคคล" : (selectedLog.employeeId || "ไม่ระบุ")}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-sans font-bold block uppercase">แผนกสังกัด:</span>
                    <span className="text-xs text-slate-700 font-sans mt-0.5 block">{selectedLog.department || "ตรวจสารเสพติดทั่วไป"}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-sans font-bold block uppercase">วันที่และเวลาคัดกรอง:</span>
                    <span className="text-xs text-slate-700 font-mono mt-0.5 block">
                      {new Date(selectedLog.timestamp).toLocaleString("th-TH")}
                    </span>
                  </div>
                </div>

                {/* Captured Evidence: Image + Signature */}
                <div className="grid grid-cols-2 gap-4">
                  
                  {/* Photo captured */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 mb-1.5 font-sans font-bold uppercase">รูปภาพใบหน้าผู้ได้รับการตรวจ:</span>
                    <div className="aspect-video w-full rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center relative">
                      {selectedLog.photo ? (
                        <img
                          src={selectedLog.photo}
                          alt="Face capture"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-sans">ไม่มีประวัติรูปภาพ</span>
                      )}
                      <div className="absolute bottom-1 right-1 bg-slate-200/80 px-1 py-0.5 rounded font-mono text-[8px] text-slate-600 font-bold">
                        CAM REC
                      </div>
                    </div>
                  </div>

                  {/* Signature captured */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 mb-1.5 font-sans font-bold uppercase">ลายเซ็นยืนยันดิจิทัล:</span>
                    <div className="aspect-video w-full rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center relative p-2">
                      {selectedLog.signature ? (
                        <img
                          src={selectedLog.signature}
                          alt="Signature"
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-sans">ไม่ได้เซ็นข้อมูลล่วงหน้า</span>
                      )}
                      <div className="absolute bottom-1 right-1 bg-slate-200/80 px-1 py-0.5 rounded font-mono text-[8px] text-slate-600 font-bold">
                        SECURE SIGN
                      </div>
                    </div>
                  </div>

                </div>

                {/* Additional parameters */}
                <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans font-bold block uppercase">อาการคัดกรองเบื้องต้น:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedLog.symptoms.map((symp) => (
                        <span key={symp} className="bg-white border border-slate-200 px-2.5 py-0.5 rounded text-[10px] text-slate-700 font-sans font-semibold">
                          {symp}
                        </span>
                      ))}
                    </div>
                  </div>

                  {selectedLog.notes && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans font-bold block uppercase">หมายเหตุเพิ่มเติม:</span>
                      <p className="text-[11px] text-slate-700 font-sans mt-0.5">{selectedLog.notes}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 font-medium flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <span className="text-slate-400 block font-bold uppercase">เกณฑ์ควบคุมที่ใช้ตัดสินเกราะ:</span>
                      <span className="font-mono">{selectedLog.passLimit} mg%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block font-bold uppercase">ผู้บันทึกผล:</span>
                      <span className="font-semibold text-slate-700">{selectedLog.witness || "ไม่ระบุ"}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Close controls */}
              <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-sans rounded-xl transition cursor-pointer font-bold"
                >
                  พิมพ์หน้าบันทึก (Print)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-sans font-bold rounded-xl transition cursor-pointer"
                >
                  ปิดหน้าจอ
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= CUSTOM ACTION ALERTS (Toast Notification) ================= */}
      <AnimatePresence>
        {appNotification.show && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-5 right-5 left-5 md:left-auto md:w-96 z-55 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xl flex items-start gap-3"
            style={{ zIndex: 110 }}
          >
            <div className={`p-2 rounded-xl shrink-0 ${
              appNotification.type === "success" ? "bg-emerald-50 text-emerald-600" :
              appNotification.type === "error" ? "bg-red-50 text-red-650" :
              appNotification.type === "warning" ? "bg-amber-50 text-amber-600" :
              "bg-indigo-50 text-indigo-600"
            }`}>
              {appNotification.type === "success" && <Check size={18} />}
              {appNotification.type === "error" && <AlertTriangle size={18} />}
              {appNotification.type === "warning" && <AlertCircle size={18} />}
              {appNotification.type === "info" && <Shield size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              {appNotification.title && (
                <h4 className="text-xs font-black text-slate-800 font-sans">
                  {appNotification.title}
                </h4>
              )}
              <p className="text-xs text-slate-650 font-sans mt-0.5 leading-relaxed font-bold">
                {appNotification.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAppNotification(prev => ({ ...prev, show: false }))}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= CUSTOM CONFIRMATION DIALOG MODAL ================= */}
      <AnimatePresence>
        {appConfirmation.show && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" style={{ zIndex: 120 }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 max-w-sm w-full rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 font-sans">
                    {appConfirmation.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-sans mt-1 leading-relaxed font-bold">
                    {appConfirmation.message}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  onClick={() => setAppConfirmation(prev => ({ ...prev, show: false }))}
                  className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-sans font-bold rounded-xl transition cursor-pointer"
                >
                  {appConfirmation.cancelText || "ยกเลิก"}
                </button>
                <button
                  type="button"
                  onClick={appConfirmation.onConfirm}
                  className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white text-xs font-sans font-bold rounded-xl transition cursor-pointer shadow-sm shadow-red-100"
                >
                  {appConfirmation.confirmText || "ยืนยันผล"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= CUSTOM PERMISSION AUTHORIZATION DIALOG MODAL ================= */}
      <AnimatePresence>
        {permissionModal.show && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fade-in" style={{ zIndex: 130 }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-indigo-100 max-w-sm w-full rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                  <Lock size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-800 font-sans flex items-center gap-1.5">
                    ตรวจสอบสิทธิ์ผู้ดูแลระบบ
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans mt-1 leading-relaxed">
                    ระบบเปิดใช้งานการป้องกันข้อมูล เพื่อป้องกันการแก้ไขโดยไม่ได้รับอนุญาต กรุณาป้อนรหัสผ่านผู้ดูแลระบบเพื่อยืนยันการทำรายการ:
                  </p>
                  <div className="text-xs text-indigo-600 font-bold font-sans mt-2 bg-indigo-50/50 px-2.5 py-1.5 rounded-lg border border-indigo-100/50 truncate">
                    ⚙️ รายการ: <span className="text-slate-700 font-semibold">{permissionModal.actionName}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                  รหัสผ่านผู้ดูแลระบบ (Admin PIN)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    autoFocus
                    placeholder="ป้อนรหัสผ่าน (เริ่มต้น 1234)"
                    value={permissionModal.inputValue}
                    onChange={(e) => setPermissionModal({ ...permissionModal, inputValue: e.target.value, errorMsg: "" })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const isCorrect = permissionModal.inputValue.trim() === settings.adminPasscode.trim();
                        if (isCorrect) {
                          setPermissionModal(prev => ({ ...prev, show: false }));
                          permissionModal.onSuccess();
                        } else {
                          setPermissionModal(prev => ({ ...prev, errorMsg: "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง" }));
                        }
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-10 py-2.5 text-slate-800 text-xs font-sans tracking-widest font-bold outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                    <Unlock size={14} />
                  </div>
                </div>

                {permissionModal.errorMsg ? (
                  <p className="text-[10px] text-rose-600 font-bold font-sans flex items-center gap-1 mt-1">
                    <AlertTriangle size={12} className="shrink-0 animate-bounce" /> {permissionModal.errorMsg}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 font-sans mt-1">
                    * สามารถแก้ไขหรือตั้งค่ารหัสผ่านใหม่ได้ที่เมนู "ตั้งค่าระบบ" (เริ่มต้น 1234)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  onClick={() => setPermissionModal(prev => ({ ...prev, show: false }))}
                  className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-sans font-bold rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isCorrect = permissionModal.inputValue.trim() === settings.adminPasscode.trim();
                    if (isCorrect) {
                      setPermissionModal(prev => ({ ...prev, show: false }));
                      permissionModal.onSuccess();
                    } else {
                      setPermissionModal(prev => ({ ...prev, errorMsg: "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง" }));
                    }
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-sans font-bold rounded-xl transition cursor-pointer shadow-sm shadow-indigo-100 flex items-center justify-center gap-1"
                >
                  <Unlock size={12} /> ยืนยันสิทธิ์
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= CUSTOM EMPLOYEE LEAVE DIALOG MODAL ================= */}
      <AnimatePresence>
        {leaveModal.show && leaveModal.employee && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-55 animate-fade-in" style={{ zIndex: 120 }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-indigo-100 max-w-md w-full rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 text-slate-800"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <Calendar size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-800 font-sans flex items-center gap-1.5">
                    บันทึกสถานะลางาน / ไม่เข้าตรวจ
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans mt-1 leading-relaxed">
                    บันทึกสถานะละเว้นการตรวจคัดกรองสำหรับพนักงานที่ลากิจ ลาป่วย หรือไม่ได้เข้าเวรในวันนี้ เพื่อให้รายงานความครอบคลุมประจำวัน (Daily Coverage) ครบถ้วนถูกต้อง
                  </p>
                </div>
              </div>

              {/* Employee Quick Info Card */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-600 text-xs shrink-0">
                  {leaveModal.employee.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 truncate">{leaveModal.employee.name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-semibold">รหัส: {leaveModal.employee.id}</span>
                    <span className="text-[10px] text-slate-300">•</span>
                    <span className="text-[10px] text-indigo-600 font-bold truncate bg-indigo-50 px-1.5 py-0.5 rounded">
                      {leaveModal.employee.department}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Choice Reason Templates */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                  เลือกสาเหตุลางานด่วน (Quick Templates)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "ลากิจ", text: "ลากิจ (มีธุระส่วนตัว)" },
                    { label: "ลาป่วย", text: "ลาป่วย (ไม่สบาย)" },
                    { label: "หยุดงาน/ไม่เข้ากะ", text: "ไม่ได้เข้ากะปฏิบัติหน้าที่ / หยุดประจำสัปดาห์" },
                    { label: "งานนอกสถานที่", text: "ไปปฏิบัติงานนอกสถานที่ (Site Visit)" },
                    { label: "ขาดงาน", text: "ขาดงาน / ขาดการติดต่อ" }
                  ].map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setLeaveModal(prev => ({ ...prev, reason: tpl.label, notes: tpl.text }))}
                      className={`text-[10px] font-sans font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                        leaveModal.reason === tpl.label
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason / Notes Input Field */}
              <div className="space-y-2">
                <label className="block text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                  ระบุสาเหตุ / รายละเอียดเพิ่มเติม (Custom Reason)
                </label>
                <textarea
                  rows={3}
                  placeholder="พิมพ์รายละเอียดสาเหตุการลาที่นี่..."
                  value={leaveModal.notes}
                  onChange={(e) => setLeaveModal(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-xs font-sans outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 transition"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  onClick={() => setLeaveModal({ show: false, employee: null, reason: "ลากิจ", notes: "" })}
                  className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-sans font-bold rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!leaveModal.notes.trim()) {
                      showNotification("กรุณาระบุรายละเอียดหรือสาเหตุการลาก่อนบันทึก", "warning", "ข้อมูลไม่ครบถ้วน");
                      return;
                    }
                    handleConfirmSaveLeave(
                      leaveModal.employee!,
                      leaveModal.reason,
                      leaveModal.notes
                    );
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-sans font-bold rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-1"
                >
                  <CalendarCheck size={12} /> บันทึกการลา
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showExcelPreview && parsedEmployees.length > 0 && (
          <div key="excel-import-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-150 max-w-lg w-full p-4 md:p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                    <FileSpreadsheet size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 font-sans">ตรวจสอบและยืนยันการนำเข้าข้อมูล</h3>
                    <p className="text-[10px] text-slate-450 font-sans">
                      พบข้อมูลพนักงานทั้งหมด <strong className="text-emerald-700">{parsedEmployees.length}</strong> คนในไฟล์
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParsedEmployees([]);
                    setShowExcelPreview(false);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Duplicate behavior options */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 space-y-2">
                <span className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider">
                  กรณีมีรหัสพนักงานซ้ำกับที่มีอยู่เดิมในระบบ
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setImportOption("OVERWRITE")}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                      importOption === "OVERWRITE"
                        ? "bg-white border-emerald-500 ring-2 ring-emerald-500/10"
                        : "bg-white/50 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <span className="block text-xs font-bold text-slate-700 font-sans">
                      ✏️ อัปเดตทับข้อมูลเดิม
                    </span>
                    <span className="block text-[9px] text-slate-400 font-sans mt-0.5">
                      เขียนทับรายชื่อ แผนก และตำแหน่งเดิม
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportOption("SKIP")}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                      importOption === "SKIP"
                        ? "bg-white border-slate-400 ring-2 ring-slate-400/10"
                        : "bg-white/50 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <span className="block text-xs font-bold text-slate-700 font-sans">
                      🚫 ข้ามพนักงานเดิม
                    </span>
                    <span className="block text-[9px] text-slate-400 font-sans mt-0.5">
                      ละเว้นรหัสพนักงานที่ซ้ำ และเพิ่มเฉพาะคนใหม่
                    </span>
                  </button>
                </div>
              </div>

              {/* Preview table of first 5 items */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">
                  <span>ตัวอย่างข้อมูล (แสดง 5 คนแรก)</span>
                  <span>รวม {parsedEmployees.length} คน</span>
                </div>
                <div className="border border-slate-150 rounded-xl overflow-hidden bg-white max-h-[160px] overflow-y-auto">
                  <table className="w-full text-xs text-left border-collapse font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-[9.5px] font-bold text-slate-500 font-sans uppercase">
                        <th className="px-3 py-1.5 w-10">รูป</th>
                        <th className="px-3 py-1.5">รหัสพนักงาน</th>
                        <th className="px-3 py-1.5">ชื่อ-นามสกุล</th>
                        <th className="px-3 py-1.5">แผนก/สังกัด</th>
                        <th className="px-3 py-1.5">ตำแหน่ง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedEmployees.slice(0, 5).map((emp, index) => (
                        <tr key={index} className="hover:bg-slate-50 text-[11px] text-slate-700 font-sans">
                          <td className="px-3 py-1.5">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-100 border border-slate-200">
                              <img src={emp.photo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          </td>
                          <td className="px-3 py-1.5 font-mono font-medium">{emp.id}</td>
                          <td className="px-3 py-1.5 font-bold text-slate-800">{emp.name}</td>
                          <td className="px-3 py-1.5 truncate max-w-[120px]">{emp.department}</td>
                          <td className="px-3 py-1.5 text-slate-500">{emp.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedEmployees.length > 5 && (
                  <p className="text-[10px] text-slate-450 font-sans text-center">
                    ... และพนักงานอีก <strong>{parsedEmployees.length - 5}</strong> คนด้านล่าง ...
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setParsedEmployees([]);
                    setShowExcelPreview(false);
                  }}
                  className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-sans font-bold rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExcelImport}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-sans font-bold rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-1 hover:shadow"
                >
                  <FileCheck size={12} /> ยืนยันการนำเข้าข้อมูล
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= PRINT REPORT PREVIEW OVERLAY MODAL ================= */}
      <AnimatePresence>
        {showPrintReport && (
          <div className="print-modal-backdrop fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[200] print:absolute print:inset-0 print:bg-white print:p-0" style={{ zIndex: 99999 }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="print-modal-content bg-white border border-slate-200 max-w-5xl w-full h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col print:h-auto print:w-full print:border-none print:shadow-none print:rounded-none"
            >
              {/* Header with Print and Close controls - hidden on actual print */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0 print:hidden">
                <div className="flex items-center gap-2">
                  <Printer className="text-indigo-600" size={20} />
                  <div>
                    <h3 className="text-sm font-black text-slate-800 font-sans">
                      ตัวอย่างก่อนพิมพ์ (Print Preview)
                    </h3>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                      สามารถสั่งพิมพ์ออกทางเครื่องพิมพ์ หรือบันทึกเป็นไฟล์ PDF เพื่อเก็บประวัติพร้อมรูปถ่ายหลักฐาน
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDirectPrint}
                    className="flex items-center gap-1.5 justify-center bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-sans font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm hover:shadow"
                    title="พิมพ์รายงานโดยตรงหรือเปิดแท็บพิมพ์แบบความเข้ากันได้สูงที่ข้ามข้อจำกัดของ iFrame สะดวกทั้งมือถือและคอมพิวเตอร์"
                  >
                    <Printer size={14} /> พิมพ์รายงานด่วน / บันทึก PDF (แนะนำ)
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReportWindow}
                    className="flex items-center gap-1.5 justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-sans font-bold px-3 py-2 rounded-xl transition cursor-pointer print:hidden"
                    title="เปิดแท็บหน้าต่างใหม่เพื่อพิมพ์ (ไม่แนะนำสำหรับมือถือเนื่องจากระบบอาจบล็อกป๊อปอัป)"
                  >
                    เปิดพิมพ์หน้าต่างใหม่ (คอมพิวเตอร์)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintReport(false)}
                    className="flex items-center gap-1 justify-center bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 text-xs font-sans font-bold px-3 py-2 rounded-xl transition cursor-pointer"
                  >
                    <X size={14} /> ปิดหน้าต่าง
                  </button>
                </div>
              </div>

              {/* Instructional Guide for Printing / Saving PDF */}
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 text-[11px] text-amber-800 font-sans flex items-center justify-between gap-4 print:hidden shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold flex items-center gap-1"><Printer size={12} /> คำแนะนำในการบันทึก PDF / พิมพ์รายงาน:</span>
                  <span>
                    <strong>บนมือถือ/แท็บเล็ต:</strong> แนะนำให้ใช้ปุ่มสีน้ำเงิน <strong>"พิมพ์รายงานด่วน (แนะนำ)"</strong> จากนั้นเลือกปลายทางเป็น <strong>"บันทึกเป็น PDF (Save as PDF)"</strong> หรือแชร์ไฟล์ | 
                    <strong>บนคอมพิวเตอร์:</strong> สามารถเลือกปุ่มสีน้ำเงินหรือปุ่มพิมพ์หน้าต่างใหม่ได้ตามสะดวก
                  </span>
                </div>
              </div>

              {/* Scrollable Printable Container */}
              <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible bg-slate-100 print:bg-white">
                <div id="print-area" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:rounded-none">
                  {/* Business Header */}
                  <div className="text-center pb-6 border-b border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
                      รายงานผลคัดกรองการวัดปริมาณแอลกอฮอล์รายวัน
                    </h2>
                    <p className="text-xs text-slate-500 font-sans mt-1">
                      {calendarMode === "SINGLE" 
                        ? `ประจำวันที่ ${selectedCalendarDate.getDate()} ${THAI_MONTHS[selectedCalendarDate.getMonth()]} พ.ศ. ${selectedCalendarDate.getFullYear() + 543}`
                        : calendarMode === "RANGE"
                        ? `ระหว่างวันที่ ${selectedCalendarDate.getDate()} ${THAI_MONTHS[selectedCalendarDate.getMonth()]} พ.ศ. ${selectedCalendarDate.getFullYear() + 543} ถึงวันที่ ${(selectedCalendarEndDate || selectedCalendarDate).getDate()} ${THAI_MONTHS[(selectedCalendarEndDate || selectedCalendarDate).getMonth()]} พ.ศ. ${(selectedCalendarEndDate || selectedCalendarDate).getFullYear() + 543}`
                        : "บันทึกประวัติทั้งหมด"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                      ออกเอกสาร ณ วันที่ {new Date().toLocaleString("th-TH")}
                    </p>
                  </div>

                  {/* Table with images */}
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold text-slate-700 font-sans text-center">
                          <th className="border border-slate-300 p-2 w-12">ลำดับ</th>
                          <th className="border border-slate-300 p-2 w-28">วันและเวลา</th>
                          <th className="border border-slate-300 p-2 text-left">ชื่อ-นามสกุลพนักงาน</th>
                          <th className="border border-slate-300 p-2 w-20">รหัส/สังกัด</th>
                          <th className="border border-slate-300 p-2 w-14">แอลกอฮอล์</th>
                          <th className="border border-slate-300 p-2 w-16">ผลตรวจ</th>
                          <th className="border border-slate-300 p-2 text-left">อาการ / หมายเหตุ</th>
                          <th className="border border-slate-300 p-2 w-24">รูปหลักฐาน</th>
                          <th className="border border-slate-300 p-2 w-24">ลายเซ็น</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbFilteredLogs.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="border border-slate-300 p-8 text-center text-slate-400 font-sans">
                              ไม่มีบันทึกข้อมูลตามประวัติและตัวกรองที่เลือก
                            </td>
                          </tr>
                        ) : (
                          dbFilteredLogs.map((log, index) => {
                            const dateStr = new Date(log.timestamp).toLocaleString("th-TH").replace(/,/g, "");
                            const statusStr = log.isLeave ? "ลา/ไม่ได้ตรวจ" : (log.isPassed ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์");
                            const statusColor = log.isLeave ? "text-amber-700 bg-amber-50" : (log.isPassed ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50");
                            const attemptInfo = getLogAttemptInfo(log.id);
                            const attemptStr = log.isLeave ? "" : `(ครั้งที่ ${attemptInfo.attempt})`;
                            const symptomsStr = log.isLeave ? "ไม่ได้ตรวจคัดกรองเนื่องจากลางาน" : log.symptoms.join("; ");
                            const notesText = log.notes ? `[หมายเหตุ: ${log.notes}]` : "";

                            return (
                              <tr key={log.id} className="hover:bg-slate-50/50 text-slate-800 font-sans border-b border-slate-300">
                                <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                                <td className="border border-slate-300 p-2 text-center font-mono text-[10px] leading-snug">
                                  {dateStr}
                                </td>
                                <td className="border border-slate-300 p-2 font-bold leading-tight">
                                  <div>{log.employeeName}</div>
                                  <div className="text-[9px] text-slate-500 font-normal mt-0.5">{attemptStr}</div>
                                </td>
                                <td className="border border-slate-300 p-2 text-center text-[10px] leading-snug">
                                  <div className="font-mono font-medium">{log.employeeId || "ทั่วไป"}</div>
                                  <div className="text-slate-500 text-[9px] mt-0.5 truncate">{log.department || ""}</div>
                                </td>
                                <td className="border border-slate-300 p-2 text-center font-mono font-bold text-slate-900">
                                  {log.isLeave ? "-" : `${log.alcoholLevel} mg%`}
                                </td>
                                <td className={`border border-slate-300 p-2 text-center font-bold text-[10px] ${statusColor}`}>
                                  {statusStr}
                                </td>
                                <td className="border border-slate-300 p-2 leading-relaxed">
                                  <div className="text-[10px]">{symptomsStr}</div>
                                  {notesText && <div className="text-[9px] text-slate-500 mt-0.5 italic">{notesText}</div>}
                                </td>
                                <td className="border border-slate-300 p-1.5 text-center vertical-middle">
                                  {log.photo ? (
                                    <div className="flex justify-center">
                                      <img
                                        src={log.photo}
                                        alt=""
                                        className="w-16 h-12 object-cover rounded border border-slate-300"
                                        referrerPolicy="no-referrer"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400">ไม่มีรูปภาพ</span>
                                  )}
                                </td>
                                <td className="border border-slate-300 p-1.5 text-center vertical-middle">
                                  {log.signature ? (
                                    <div className="flex justify-center">
                                      <img
                                        src={log.signature}
                                        alt=""
                                        className="max-w-16 max-h-10 object-contain"
                                        referrerPolicy="no-referrer"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-slate-400">ไม่ได้เซ็น</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Verification Footer Signatures */}
                  <div className="mt-12 grid grid-cols-2 gap-8 text-center font-sans">
                    <div className="flex flex-col items-center">
                      <div className="w-48 border-b border-slate-400 h-10"></div>
                      <p className="text-xs font-bold text-slate-700 mt-2">ลงชื่อผู้บันทึก/ผู้รับผิดชอบการคัดกรอง</p>
                      <p className="text-[10px] text-slate-500 mt-1">( {witness || "ผู้ตรวจการคัดกรอง"} )</p>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-48 border-b border-slate-400 h-10"></div>
                      <p className="text-xs font-bold text-slate-700 mt-2">ลงชื่อผู้ตรวจสอบ/พนักงานเจ้าหน้าที่หลัก</p>
                      <p className="text-[10px] text-slate-500 mt-1">( ............................................................ )</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer System Credits (Slight clean styling, strictly conform to no-slop regulations) */}
      <footer id="applet-guideline-footer" className="max-w-7xl w-full mx-auto mt-6 text-center text-[11px] text-slate-400 font-sans font-medium border-t border-slate-200 pt-4 pb-2">
        <p>© 2026 ระบบบันทึกการเป่าแอลกอฮอล์สำหรับสถานประกอบการเชิงความปลอดภัย (Daily Alcohol Test Log)</p>
        <p className="mt-1 text-slate-400">เกณฑ์คัดกรองเบื้องต้นอิงมาตรการกรมขนส่งและกระทรวงสาธารณสุขไทย</p>
      </footer>

    </div>
  );
}
