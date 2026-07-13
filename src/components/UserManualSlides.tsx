import React, { useState } from "react";
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Shield, 
  Camera, 
  UserCheck, 
  RefreshCw, 
  Printer, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle,
  Lock,
  Calendar,
  Layers,
  Sparkles,
  Smartphone,
  Laptop,
  Check,
  Search,
  FileSpreadsheet,
  AlertCircle,
  Eye
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface UserManualSlidesProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
}

interface SlideItem {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  bgGradient: string;
  colorTheme: string;
  badge: string;
  content: React.ReactNode;
  mockup: React.ReactNode;
}

export default function UserManualSlides({ isOpen, onClose, companyName = "สถานประกอบการ" }: UserManualSlidesProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isOpen) return null;

  const slides: SlideItem[] = [
    {
      id: 0,
      title: "บทนำและการทำงานระบบ",
      subtitle: "Daily Alcohol Test Log ระบบบันทึกการเป่าแอลกอฮอล์ระดับพนักงานเชิงรุก",
      badge: "ภาพรวมระบบ (OVERVIEW)",
      icon: <Shield size={32} className="text-white" />,
      bgGradient: "from-indigo-600 via-indigo-700 to-slate-900",
      colorTheme: "indigo",
      content: (
        <div className="space-y-4 font-sans text-slate-700">
          <p className="text-sm leading-relaxed">
            ระบบบันทึกการเป่าแอลกอฮอล์รายวันออกแบบมาเพื่อยกระดับความปลอดภัยขั้นสูงสุดในสถานประกอบการ งานขนส่ง หรือคลังสินค้า โดยการเก็บบันทึกประวัติพนักงานอย่างถูกต้อง โปร่งใส มีความเที่ยงตรงด้วยฐานข้อมูลคลาวด์แบบเรียลไทม์ และระบบกล้องยืนยันตัวตน
          </p>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">โหมดการปฏิบัติงานหลัก</h4>
            <div className="p-3 bg-indigo-50/75 border border-indigo-100 rounded-xl flex items-start gap-2.5">
              <span className="p-1 px-2 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold font-mono">1</span>
              <div>
                <h5 className="text-xs font-bold text-indigo-900">โหมดผู้ควบคุมการเป่า (Supervisor/Admin Mode)</h5>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">เหมาะสำหรับการใช้งานผ่านแท็บเล็ตส่วนกลางหรือเครื่องคอมพิวเตอร์ประจำจุดตรวจ บันทึกประวัติได้รวดเร็ว ดึงข้อมูลทะเบียนพนักงานได้ทันที และควบคุมความปลอดภัยด้วยรหัสผ่านแอดมิน</p>
              </div>
            </div>
            <div className="p-3 bg-emerald-50/75 border border-emerald-100 rounded-xl flex items-start gap-2.5">
              <span className="p-1 px-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold font-mono">2</span>
              <div>
                <h5 className="text-xs font-bold text-emerald-900">โหมดพนักงานสแกนหน้างาน (Mobile Self-Entry)</h5>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">พนักงานสามารถสแกนคิวอาร์โค้ดบนหน้าจอหลักเพื่อเปิดแอปพลิเคชันบนสมาร์ทโฟนของตนเอง กรอกผลเป่า ถ่ายภาพ และเซ็นชื่อเพื่ออัปเดตสถานะแบบเรียลไทม์</p>
              </div>
            </div>
          </div>
        </div>
      ),
      mockup: (
        <div className="w-full h-full bg-slate-900 rounded-xl border border-slate-700/80 p-3 shadow-inner flex flex-col font-sans text-slate-200">
          {/* Simulated Browser Bar */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block"></span>
              <span className="text-[10px] text-slate-500 font-mono ml-1">daily-alcohol-test-log.app</span>
            </div>
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected (Firestore Live)
            </span>
          </div>

          {/* Simulated App Screen */}
          <div className="flex-1 overflow-hidden flex flex-col pt-3 space-y-3">
            <div className="flex justify-between items-center bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <div>
                <span className="text-[10px] text-slate-400">สถานประกอบการ</span>
                <span className="block text-xs font-bold text-white">Daily Safe Guard Ltd.</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] text-emerald-400 font-mono">12 กรกฎาคม 2026</span>
                <span className="block text-[10px] font-bold text-slate-300 font-mono">14:35:22 น. (Bangkok)</span>
              </div>
            </div>

            {/* Simulated Tabs */}
            <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-bold">
              <div className="bg-indigo-600 text-white py-1.5 rounded-md shadow-sm border border-indigo-500">
                📝 หน้าจอบันทึกการเป่า
              </div>
              <div className="bg-slate-800 text-slate-300 py-1.5 rounded-md border border-slate-700">
                📊 สถิติและสรุปประจำวัน
              </div>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-800/40 border border-slate-700/65 p-2 rounded-lg text-center">
                <span className="text-[9px] text-slate-400 block">ตรวจแล้ว</span>
                <span className="text-sm font-bold text-emerald-400 block font-mono">42 ราย</span>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/65 p-2 rounded-lg text-center">
                <span className="text-[9px] text-slate-400 block">ไม่ผ่าน</span>
                <span className="text-sm font-bold text-rose-400 block font-mono">1 ราย</span>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/65 p-2 rounded-lg text-center">
                <span className="text-[9px] text-slate-400 block">ลางาน/ไม่เป่า</span>
                <span className="text-sm font-bold text-amber-400 block font-mono">3 ราย</span>
              </div>
            </div>

            {/* Interactive hint */}
            <div className="mt-auto bg-slate-800/50 border border-slate-700/50 p-2.5 rounded-lg flex items-center gap-2">
              <Sparkles className="text-indigo-400 animate-pulse shrink-0" size={14} />
              <span className="text-[9px] text-slate-300 leading-normal">
                คู่มือการเป่าประกอบภาพจำลองส่วนประสานงานจริง เพื่อความสะดวกและเข้าใจง่ายใน 6 หมวดหลัก
              </span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 1,
      title: "ขั้นตอนการบันทึกข้อมูลการเป่า",
      subtitle: "ขั้นตอนลงทะเบียนบันทึกระดับแอลกอฮอล์พร้อมระบบตรวจสอบความถูกต้อง",
      badge: "ขั้นตอนการทำงาน (WORKFLOW STEPS)",
      icon: <Camera size={32} className="text-white" />,
      bgGradient: "from-sky-600 via-blue-700 to-indigo-950",
      colorTheme: "sky",
      content: (
        <div className="space-y-3.5 font-sans text-slate-700">
          <p className="text-sm leading-relaxed">
            ผู้ควบคุมการตรวจสามารถนำประวัติพนักงานเข้าระบบง่ายๆ ใน 3 ขั้นตอน เพื่อความสะดวกและรัดกุมในการบันทึก:
          </p>

          <div className="space-y-3">
            <div className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">เลือกพนักงานหรือค้นหาข้อมูลด่วน</span>
                <p className="text-[11px] text-slate-500">พิมพ์ชื่อ รหัสพนักงาน หรือเลือกพนักงานจากกล่องรายชื่อพนักงานด่วน ระบบจะดึงรหัสพนักงานและแผนกต้นสังกัดโดยอัตโนมัติ</p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">กรอกปริมาณระดับแอลกอฮอล์ (mg%)</span>
                <p className="text-[11px] text-slate-500">ป้อนค่าจากเครื่องตรวจวัด หากเป็น <strong className="text-slate-800">0 mg%</strong> จะบันทึกสถานะผ่าน หากมีปริมาณแอลกอฮอล์เกินกฎเกณฑ์ที่องค์กรตั้งค่าไว้ (เช่น &gt;0 หรือ &gt;50 mg%) ระบบจะแจ้งเตือนและเปลี่ยนเป็นไม่ผ่านทันที</p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">ถ่ายภาพกล้องตรวจ และเซ็นชื่อสด</span>
                <p className="text-[11px] text-slate-500">ระบบจะจำลองเปิดกล้องเพื่อถ่ายภาพพนักงานเพื่อป้องกันการแอบอ้างสวมสิทธิ์ และพนักงานจะทำการเซ็นลายมือชื่อสดลงบนกรอบสีขาวก่อนกดตกลง</p>
              </div>
            </div>
          </div>
        </div>
      ),
      mockup: (
        <div className="w-full h-full bg-white rounded-xl border border-slate-200 p-3 shadow-inner flex flex-col font-sans text-slate-800">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="text-[11px] font-black text-indigo-700">📌 ตัวอย่างฟอร์มบันทึกการเป่า</span>
            <span className="text-[10px] font-mono text-slate-400">Step Progress 80%</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 mt-2">
            {/* Form Input fields simulator */}
            <div className="space-y-1.5 text-[10px]">
              <div>
                <label className="block text-slate-500 font-bold mb-0.5">พนักงานขับรถ / พนักงานที่เข้ารับการตรวจ</label>
                <div className="bg-slate-50 border border-slate-200 rounded p-1.5 text-slate-800 flex items-center justify-between">
                  <span>นายสมชาย ใจดี (ID: EMP-009)</span>
                  <span className="text-[9px] bg-indigo-100 text-indigo-700 font-bold px-1 rounded">ฝ่ายขนส่ง</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 font-bold mb-0.5">ระดับแอลกอฮอล์ (mg%)</label>
                  <div className="bg-rose-50 border border-rose-300 rounded p-1 text-rose-700 font-bold text-center relative">
                    55 mg%
                    <span className="absolute right-1 top-0.5 text-[8px] bg-rose-200 px-0.5 rounded text-rose-700">ไม่ผ่าน!</span>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-0.5">อาการร่วม</label>
                  <span className="block text-[9px] text-slate-600 bg-amber-50 border border-amber-200 rounded p-1 text-center">👁️ มีกลิ่นสุรา / ตาแดง</span>
                </div>
              </div>

              {/* Photo & Signature Row Mock */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="block text-slate-400 text-[8px] mb-0.5">📸 ภาพถ่ายยืนยันตัวตน (Camera Snap)</span>
                  <div className="border border-slate-200 rounded h-16 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border border-indigo-300 bg-white flex items-center justify-center text-slate-400">
                      👨‍💼
                    </div>
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] bg-indigo-600 text-white px-1 py-0.2 rounded-full">กล้องตรวจ</span>
                  </div>
                </div>

                <div>
                  <span className="block text-slate-400 text-[8px] mb-0.5">🖋️ ลายมือชื่อพนักงาน (Signature)</span>
                  <div className="border border-slate-200 rounded h-16 bg-slate-50 relative overflow-hidden flex items-center justify-center">
                    {/* Simulated hand drawing */}
                    <svg className="w-16 h-12 text-indigo-700 opacity-80" viewBox="0 0 100 50">
                      <path d="M10,25 Q30,10 50,30 T90,20" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                    <span className="absolute bottom-0.5 right-1 text-[8px] text-slate-300">ล้างชื่อ</span>
                  </div>
                </div>
              </div>
            </div>

            <button type="button" disabled className="w-full bg-indigo-600 text-white text-[11px] font-bold py-1.5 rounded-lg text-center shadow-sm opacity-90">
              💾 บันทึกประวัติการเป่าแอลกอฮอล์
            </button>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "ระบบซิงค์ข้อมูล มือถือ ⇄ คอมพิวเตอร์",
      subtitle: "แก้ไขข้อมูลไม่ตรงกันและวิธีการกู้คืนข้อมูลแบบ Realtime สมบูรณ์",
      badge: "การเชื่อมฐานข้อมูลคลาวด์ (REALTIME CLOUD SYNC)",
      icon: <RefreshCw size={32} className="text-white" />,
      bgGradient: "from-emerald-600 via-emerald-700 to-teal-950",
      colorTheme: "emerald",
      content: (
        <div className="space-y-3.5 font-sans text-slate-700">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={16} />
            <div className="flex-1 min-w-0">
              <span className="block text-xs font-bold text-rose-800">ปัญหาพบบ่อย: ข้อมูลในมือถือกับคอมพิวเตอร์ไม่ตรงกัน?</span>
              <p className="text-[11px] text-rose-700/90 mt-1 leading-relaxed">
                เนื่องจากเบราว์เซอร์บนมือถือบางเครื่องเมื่อล็อกหน้าจอนานๆ จะเข้าสู่โหมดประหยัดพลังงาน (Deep Sleep Mode) และตัดการเชื่อมต่อคลาวด์ แต่อุปกรณ์ยังเก็บแคชของวันก่อนหน้าอยู่
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-800">ระบบคลาวด์เชิงรุก มีวิธีช่วยเหลือเพื่อดึงข้อมูลให้ตรงกันดังนี้:</h4>
            
            <div className="space-y-2">
              <div className="flex gap-2 text-[11px] items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5"></span>
                <p><strong>ตัวตรวจวัดวันข้าม (Rollover Detector):</strong> เมื่อผู้ใช้เปิดแอปบนโทรศัพท์ขึ้นมาใหม่ ระบบจะตรวจสอบเวลาปัจจุบันทันทีและเปลี่ยนวันที่คัดกรองกลับสู่ "วันปัจจุบัน" พร้อมล้างข้อมูลแคชวันเก่าออกทันที</p>
              </div>

              <div className="flex gap-2 text-[11px] items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5"></span>
                <p><strong>ปุ่มซิงค์ด่วนข้ามเครื่อง (Sync):</strong> ผู้ใช้สามารถกดปุ่มสีเขียว "ซิงค์ด่วนข้ามเครื่อง (Sync)" ที่มุมขวาบนของเมนูหลัก เพื่อให้ระบบทำการบังคับดึงข้อมูล (Fetch) และอัปเดตสถานะการบันทึกให้ตรงกันทันที</p>
              </div>

              <div className="flex gap-2 text-[11px] items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5"></span>
                <p><strong>เมนูบังคับดึงข้อมูลใหม่ (Force Reload):</strong> หากยังพบปัญหามือถือนิ่งค้าง ให้คลิกเมนูย่อยสีแดงด้านบน "ดึงข้อมูลใหม่" ระบบจะบังคับเคลียร์แคชภายในเครื่องทิ้งทั้งหมดและดาวน์โหลดข้อมูลใหม่จากฐานข้อมูล Firestore โดยตรง</p>
              </div>
            </div>
          </div>
        </div>
      ),
      mockup: (
        <div className="w-full h-full bg-slate-900 rounded-xl border border-slate-800 p-3 shadow-2xl flex flex-col font-sans text-slate-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Smartphone size={14} className="text-emerald-400" />
              <span className="text-[10px] text-slate-400">Mobile Device Sync Status</span>
            </div>
            <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">Active Focus</span>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center py-4 space-y-3">
            {/* Visual Phone Model with interactive sync */}
            <div className="relative w-44 bg-slate-850 border-2 border-slate-700 rounded-2xl p-2 pb-5 shadow-lg">
              {/* Camera Notch */}
              <div className="w-14 h-3 bg-slate-800 rounded-full mx-auto mb-2"></div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-center text-[10px] space-y-2">
                <span className="text-slate-400 text-[9px] block">สถานะการเป่ารายวัน</span>
                
                {/* Simulated Clickable Sync */}
                <div className="border border-emerald-500/50 bg-emerald-500/5 p-1.5 rounded-md flex items-center justify-center gap-1 text-emerald-400 text-[9px] font-bold">
                  <RefreshCw size={10} className="animate-spin" /> ซิงค์ด่วนคลาวด์เรียบร้อย
                </div>

                <div className="border border-rose-500/30 bg-rose-500/5 p-1.5 rounded-md flex items-center justify-center gap-1 text-rose-400 text-[9px] font-bold">
                  ⚠️ บังคับดึงข้อมูลใหม่
                </div>
              </div>

              {/* Home button bar */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-12 h-1 bg-slate-600 rounded"></div>
            </div>

            <div className="text-center">
              <span className="text-[10px] text-slate-400 leading-normal block">ข้อมูลจะซิงค์หากเชื่อมคลาวด์ตลอดเวลา</span>
              <span className="text-[9px] text-emerald-400 font-mono mt-0.5 block">⚡ Firestore Multi-Device Sync : Ready</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "การจัดการพนักงานและระบบบันทึกสถานะลางาน",
      subtitle: "บริหารจัดการสถิติพนักงานและคัดค้านกรณีผู้ไม่มาทำงานหรือลากิจ ลาป่วย",
      badge: "พนักงานและการลางาน (EMPLOYEES & ABSENCE MANAGEMENT)",
      icon: <Calendar size={32} className="text-white" />,
      bgGradient: "from-amber-500 via-amber-600 to-amber-950",
      colorTheme: "amber",
      content: (
        <div className="space-y-3.5 font-sans text-slate-700">
          <p className="text-sm leading-relaxed">
            เพิ่มความโปร่งใสในสถิติเปอร์เซ็นต์ผู้เข้าตรวจ (Coverage Rate) ในแต่ละวันเพื่อไม่ให้ผู้ที่ไม่ได้มาทำงานวันนั้นๆ ถูกนับเป็นผู้ขาดตรวจเป่าแอลกอฮอล์:
          </p>

          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="p-1.5 bg-amber-50 rounded-lg shrink-0 text-amber-700">
                <UserCheck size={14} />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">การเพิ่ม / แก้ไขพนักงาน (Employee Registry)</span>
                <p className="text-[11px] text-slate-500">สามารถเพิ่มรายชื่อพนักงาน บันทึกรหัสพนักงาน แผนกที่สังกัด (เช่น ขนส่ง, คลังสินค้า, สำนักงาน) เพื่อความสะดวกในการจัดการ และสามารถลบหรือแก้ไขข้อมูลได้ทันที</p>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="p-1.5 bg-indigo-50 rounded-lg shrink-0 text-indigo-700">
                <Calendar size={14} />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">ระบบลาและยกเว้นการตรวจ (Leave Exemption)</span>
                <p className="text-[11px] text-slate-500">หากพนักงาน ลาป่วย, ลากิจ, ลาพักร้อน, ลาคลอด หรือออกหน้างาน ให้คลิกปุ่ม <strong className="text-amber-700">"ลางาน/ไม่เข้าตรวจ"</strong> และระบุประเภทการลา ระบบจะบันทึกสถานะ 'ลางาน' ในวันนั้นๆ และคำนวณอัตราความครอบคลุมได้ถูกต้องแม่นยำ 100%</p>
              </div>
            </div>
          </div>
        </div>
      ),
      mockup: (
        <div className="w-full h-full bg-white rounded-xl border border-slate-200 p-3 shadow-inner flex flex-col font-sans text-slate-800">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="text-[11px] font-black text-amber-700">📋 ตัวอย่างโมดอลลางาน/ไม่เข้าตรวจ</span>
            <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-mono">Leave Exemption</span>
          </div>

          <div className="flex-1 flex flex-col justify-between py-2 space-y-2 text-[10px]">
            <div className="bg-amber-50/50 border border-amber-200 rounded p-2 text-slate-700 space-y-1.5">
              <span className="block font-bold text-amber-900">บันทึกสถานะพนักงาน ลางาน/ไม่เข้าตรวจ</span>
              
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div>
                  <span className="text-slate-400 block">พนักงานเป้าหมาย</span>
                  <span className="font-bold text-slate-800 block">นายพรชัย ทำงานดี</span>
                </div>
                <div>
                  <span className="text-slate-400 block">วันที่ลางาน</span>
                  <span className="font-bold text-slate-800 block">12 กรกฎาคม 2026</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[9px] mb-0.5">ประเภทการลางาน</span>
                <div className="grid grid-cols-5 gap-1">
                  <span className="border border-indigo-300 bg-indigo-50 text-indigo-700 p-1 text-center rounded text-[7px] font-bold">ลาป่วย</span>
                  <span className="border border-slate-200 p-1 text-center rounded text-[7px]">ลากิจ</span>
                  <span className="border border-slate-200 p-1 text-center rounded text-[7px]">ลาพักร้อน</span>
                  <span className="border border-slate-200 p-1 text-center rounded text-[7px]">ลาคลอด</span>
                  <span className="border border-slate-200 p-1 text-center rounded text-[7px]">ขาดงาน</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[9px]">หมายเหตุเพิ่มเติม (Reason for absence)</span>
                <div className="bg-white border border-slate-200 rounded p-1 text-[9px] text-slate-600">
                  ลาป่วยเนื่องจากมีอาการไข้สูง ตรวจพบเชื้อโควิด-19
                </div>
              </div>
            </div>

            <button type="button" className="w-full bg-amber-600 text-white font-bold py-1.5 rounded text-center cursor-default">
              บันทึกสถานะยกเว้นการเป่ารายวัน
            </button>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "การจัดทำรายงานและส่งออกข้อมูล",
      subtitle: "พิมพ์เอกสารใบรับรองผลอย่างเป็นทางการ และดาวน์โหลดไฟล์ประวัติแบบ Excel",
      badge: "รายงานและความโปร่งใส (REPORTS & TRANSPARENCY)",
      icon: <Printer size={32} className="text-white" />,
      bgGradient: "from-purple-600 via-indigo-700 to-purple-950",
      colorTheme: "purple",
      content: (
        <div className="space-y-3.5 font-sans text-slate-700">
          <p className="text-sm leading-relaxed">
            ระบบจัดสรรระบบเอกสารที่พร้อมรองรับงานตรวจสอบด้านกฎหมาย มาตรการอุตสาหกรรม หรือส่งรายงานฝ่ายจัดการบุคคลและบริหารองค์กร:
          </p>

          <div className="space-y-3">
            <div className="flex gap-2.5">
              <div className="p-1.5 bg-indigo-50 rounded-lg shrink-0 text-indigo-700">
                <Printer size={14} />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">ฟอร์มรายงานสำหรับพิมพ์ (A4 Print Layout)</span>
                <p className="text-[11px] text-slate-500">เพียงกดไอคอนพิมพ์รายงานระบบจะส่งหน้าจอปัจจุบันเปลี่ยนสภาพเป็น "หน้าเอกสารรายงานคัดกรองแอลกอฮอล์" ขนาด A4 ที่มีรูปถ่ายพนักงานระดับสเกลมาตรฐาน ลายเซ็นดิจิตอลสด ตราสถานประกอบการ และบรรทัดเพื่อให้พยานพยานพิมพ์เซ็นเป็นทางการ</p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="p-1.5 bg-emerald-50 rounded-lg shrink-0 text-emerald-700">
                <Layers size={14} />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-800">ส่งออกประวัติสู่ไฟล์ Excel (.xlsx)</span>
                <p className="text-[11px] text-slate-500">ผู้ดูแลระบบสามารถคลิกดาวน์โหลดรายงานทั้งหมดออกไปเป็นตาราง Excel ที่กรอกข้อมูลละเอียด ทั้งรหัส ชื่อ พนักงาน แผนก ระดับค่า mg% อาการร่วม ลายเซ็น และวันที่/ชั่วโมงที่บันทึก เพื่อนำไปแนบในการคำนวณเงินเดือนหรือพิจารณาผลงานต่อไป</p>
              </div>
            </div>
          </div>
        </div>
      ),
      mockup: (
        <div className="w-full h-full bg-slate-100 rounded-xl border border-slate-300 p-3 shadow-inner flex flex-col font-sans text-slate-800">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
            <span className="text-[11px] font-black text-indigo-800">📑 ใบรับรองตรวจวัดอย่างเป็นทางการ</span>
            <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded font-mono">A4 Format</span>
          </div>

          <div className="flex-1 bg-white border border-slate-200 p-2 text-[8px] space-y-1.5 shadow-sm overflow-hidden mt-1.5 flex flex-col justify-between">
            {/* Certificate Style Box */}
            <div className="text-center border-b border-slate-100 pb-1">
              <h5 className="font-extrabold text-[9px] text-slate-800">ใบรับรองผลการตรวจวัดสารแอลกอฮอล์รายบุคคล</h5>
              <p className="text-[7px] text-slate-400">Daily Safety Alcohol Clearance Certification</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-700">
              <div>
                <span className="block">ชื่อ-นามสกุล: นายอาสา พานิชย์</span>
                <span className="block">สังกัด: แผนกคลังสินค้าและขนส่ง</span>
                <span className="block">เครื่องตรวจวัดหมายเลข: ALC-04</span>
              </div>
              <div className="border border-slate-200 p-1 rounded bg-slate-50 relative flex items-center justify-between">
                <div>
                  <span className="block text-slate-400 text-[6px]">ผลการวัดสุทธิ</span>
                  <span className="block text-[11px] font-extrabold text-emerald-600">0 mg%</span>
                  <span className="block text-[6px] text-emerald-600 font-bold">✓ ผ่านเกณฑ์ปกติ</span>
                </div>
                <div className="w-6 h-6 bg-slate-200 rounded text-center">📸</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[7px] text-center border-t border-slate-100">
              <div>
                <span className="block border-b border-slate-200 w-16 mx-auto h-3"></span>
                <span className="block text-slate-400 mt-0.5">ลงชื่อพนักงาน (Employee)</span>
              </div>
              <div>
                <span className="block border-b border-slate-200 w-16 mx-auto h-3"></span>
                <span className="block text-slate-400 mt-0.5">ผู้ควบคุมตรวจ (Supervisor)</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "การแก้ปัญหาเบื้องต้น & การตั้งค่าความปลอดภัย",
      subtitle: "วิธีกำหนดค่าระดับแอลกอฮอล์ที่ยอมรับ และระบบความโปร่งใสล็อกพาสโค้ด",
      badge: "ความปลอดภัยขั้นสูง (SECURITY & PARAMETERS)",
      icon: <HelpCircle size={32} className="text-white" />,
      bgGradient: "from-slate-700 via-slate-800 to-slate-950",
      colorTheme: "slate",
      content: (
        <div className="space-y-3.5 font-sans text-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                <Lock size={12} className="text-rose-600" /> ระบบ Admin Passcode Lock
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ป้องกันพนักงานลบข้อมูลทุจริต การลบประวัติ บันทึกวันลาย้อนหลัง หรือแก้ไขรายชื่อพนักงาน ต้องผ่านรหัสผ่าน <strong className="text-slate-800">Admin Passcode</strong> เสมอ (รหัสผ่านเริ่มแรกคือ <strong className="text-indigo-700 font-bold">1234</strong> ผู้ดูแลสามารถแก้ไขรหัสผ่านใหม่ได้ที่หน้าการตั้งค่า)
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                <Camera size={12} className="text-indigo-600" /> ปัญหาการใช้สิทธิ์กล้อง?
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                พนักงานใช้งานผ่านมือถืออาจขึ้นหน้าจอดำเนื่องจากไม่ได้กด 'อนุญาต' (Allow Camera) แนะนำให้ผู้ใช้ปิดแท็บ คัดลอกลิ้งค์ไปเปิดในเว็บเบราว์เซอร์หลัก เช่น Google Chrome หรือ Safari เพื่อขอสิทธิ์การใช้กล้องใหม่อีกครั้ง
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1 mb-1">
              <CheckCircle size={14} className="text-emerald-600" />
              การตั้งค่าเกณฑ์คัดกรองระดับแอลกอฮอล์ (Default Limits Setting)
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              สอดรับกับนโยบายของแต่ละสถานประกอบการ:
              <br />
              • <strong className="text-indigo-700 font-bold">0 mg% (Zero Tolerance):</strong> ตรวจพบปริมาณแอลกอฮอล์แม้แต่น้อยก็ให้ตกทันที เหมาะสำหรับพนักงานขับขี่รถบรรทุกวัตถุอันตรายหรือพนักงานคลังสินค้าขับรถฟอร์คลิฟต์
              <br />
              • <strong className="text-indigo-700 font-bold">50 mg% :</strong> อิงเกณฑ์คัดกรองกฎหมายควบคุมยานพาหนะทั่วไปของไทย
            </p>
          </div>
        </div>
      ),
      mockup: (
        <div className="w-full h-full bg-slate-900 rounded-xl border border-slate-700 p-3 shadow-inner flex flex-col font-sans text-slate-200">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="text-[11px] font-black text-rose-400">🛡️ ตัวควบคุมสิทธิ์ผู้ดูแลระบบ</span>
            <span className="text-[9px] bg-rose-500/15 text-rose-400 px-1.5 py-0.2 rounded font-mono">Security Gate</span>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center py-2 space-y-2">
            <div className="bg-slate-850 border border-slate-700 rounded p-2.5 text-center max-w-xs space-y-2">
              <Lock size={20} className="text-rose-500 mx-auto animate-pulse" />
              <p className="text-[10px] text-slate-300">กรุณาระบุรหัสผ่านเพื่อเข้าสู่ระบบความปลอดภัย</p>
              
              {/* Simulated Pin Keypad */}
              <div className="flex justify-center gap-1.5 my-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-500"></span>
              </div>
              
              <div className="grid grid-cols-3 gap-1 max-w-[120px] mx-auto text-[9px]">
                <span className="bg-slate-800 border border-slate-700 p-1 rounded font-bold">1</span>
                <span className="bg-slate-800 border border-slate-700 p-1 rounded font-bold">2</span>
                <span className="bg-slate-800 border border-slate-700 p-1 rounded font-bold">3</span>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const activeSlide = slides[currentSlide];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" style={{ zIndex: 110 }}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border border-slate-200 max-w-5xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[90vh] md:h-[650px]"
      >
        {/* Left Side: Navigation Quick Links (Desktop only) */}
        <div className="hidden md:flex flex-col w-72 bg-slate-50 border-r border-slate-200 p-5 shrink-0 justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                <BookOpen size={18} />
              </div>
              <div>
                <span className="block text-xs font-black text-slate-800 uppercase tracking-wider font-sans">คู่มือการใช้งานระบบ</span>
                <span className="block text-[10px] text-slate-400 font-medium">Daily Alcohol Test Handbook</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {slides.map((slide, idx) => (
                <button
                  key={slide.id}
                  onClick={() => setCurrentSlide(idx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition ${
                    currentSlide === idx 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-100 font-bold" 
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className={`p-1.5 rounded-md ${
                    currentSlide === idx ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {React.cloneElement(slide.icon as React.ReactElement, { size: 14, className: currentSlide === idx ? "text-white" : "text-slate-600" })}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11.5px] leading-tight truncate">{slide.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 text-center">
            <span className="text-[10px] text-slate-400 font-sans block">{companyName}</span>
            <span className="text-[9px] text-slate-300 font-mono block mt-0.5">Enterprise Safe-Log 2026</span>
          </div>
        </div>

        {/* Right Side: Active Slide Content */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Slide Header Banner with gradient */}
          <div className={`bg-gradient-to-r ${activeSlide.bgGradient} p-5 text-white relative shrink-0 flex items-center justify-between`}>
            <div>
              <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded font-mono">
                {activeSlide.badge}
              </span>
              <h2 className="text-base md:text-lg font-extrabold tracking-tight mt-1.5 font-sans">
                {activeSlide.title}
              </h2>
              <p className="text-[11px] text-white/75 mt-0.5 line-clamp-1 leading-relaxed">
                {activeSlide.subtitle}
              </p>
            </div>

            <button 
              onClick={onClose}
              className="p-1.5 bg-black/10 hover:bg-black/25 text-white/90 hover:text-white rounded-full transition shrink-0 ml-4 cursor-pointer"
              title="ปิดคู่มือการใช้งาน"
            >
              <X size={18} />
            </button>
          </div>

          {/* Slide Content with side-by-side mockup (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-slate-50/40">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-h-full"
              >
                {/* Text Explanation Part */}
                <div className="lg:col-span-7 flex flex-col justify-between">
                  {activeSlide.content}
                </div>

                {/* Live Mockup Part representing "Cap ภาพประกอบ" */}
                <div className="lg:col-span-5 flex flex-col justify-center min-h-[220px] lg:min-h-0 bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 shadow-sm relative">
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-slate-900/10 backdrop-blur px-2 py-0.5 rounded-md">
                    <Eye size={10} className="text-slate-500" />
                    <span className="text-[8.5px] font-bold text-slate-500 font-sans uppercase tracking-wider">ภาพประกอบสไลด์</span>
                  </div>
                  {activeSlide.mockup}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Slide Bottom Action Controls */}
          <div className="border-t border-slate-150 p-4 bg-white flex items-center justify-between shrink-0">
            {/* Slide Index Dot indicator */}
            <div className="flex items-center gap-1.5">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2 rounded-full transition-all ${
                    currentSlide === idx ? "w-6 bg-indigo-600" : "w-2 bg-slate-300 hover:bg-slate-400"
                  }`}
                  title={`ไปยังสไลด์ที่ ${idx + 1}`}
                />
              ))}
              <span className="text-[11px] font-bold text-slate-400 font-mono ml-2">
                {currentSlide + 1} / {slides.length}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentSlide === 0}
                className={`flex items-center gap-1 px-3 py-2 border rounded-xl text-xs font-sans font-bold transition cursor-pointer ${
                  currentSlide === 0 
                    ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed" 
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
                }`}
              >
                <ChevronLeft size={14} /> ก่อนหน้า
              </button>

              {currentSlide === slides.length - 1 ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-1 px-4.5 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-sans font-bold transition cursor-pointer shadow-md shadow-indigo-100"
                >
                  <CheckCircle size={14} /> เข้าใจแล้ว & เริ่มใช้งาน
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-sans font-bold transition cursor-pointer shadow-md shadow-indigo-100"
                >
                  ถัดไป <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
