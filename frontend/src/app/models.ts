export interface Equipment {
  id: number;
  barcode: string;
  name: string;
  category: string;
  subcategory?: string;
  description: string;
  image_url: string;
  rental_price_per_day?: number;
  overdue_price_per_day?: number;
  is_loaned: number;
  borrower_name?: string;
  borrower_phone?: string;
  expected_return?: string;
  loan_date?: string;
  track?: string;
  location?: string;
  loan_id?: number;
  notes?: string;
  is_reserved: number;
}

export interface Loan {
  id: number;
  equipment_id: number;
  equipment_name?: string;
  barcode?: string;
  category?: string;
  borrower_name: string;
  borrower_phone: string;
  borrower_id_number?: string;
  loan_date: string;
  expected_return: string;
  actual_return?: string;
  notes?: string;
  is_future?: number;
  loan_type?: 'loan' | 'rental';
  price_per_day?: number;
  card_last4?: string;
  card_expiry?: string;
  card_holder?: string;
  payment_status?: string;
  track?: string;
  location?: string;
  deposit_check?: boolean;
  deposit_scan_url?: string;
  hebrew_year?: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  parent_id?: number | null;
  parent_name?: string | null;
}

export interface Student {
  id: number;
  id_number: string;
  name: string;
  phone?: string;
  phone_code?: string;
  track?: string;
  year?: string;
  parallel?: string;
  birth_date?: string;
  address?: string;
  photo_url?: string;
  extra_data?: Record<string, string>;
  loans?: Loan[];
}

export interface Teacher {
  id: number;
  name: string;
  subject?: string;
  active: number;
  created_at?: string;
}

export interface ScheduleSlot {
  id: number;
  teacher_id: number;
  teacher_name?: string;
  teacher_subject?: string;
  class_year: string;
  class_parallel: string;
  day_of_week: number;
  start_time: string;
  end_time?: string;
  subject?: string;
  week_start: string;
}

export interface AttendanceSession {
  id: number;
  slot_id?: number;
  teacher_id: number;
  teacher_name?: string;
  class_year: string;
  class_parallel: string;
  lesson_date: string;
  subject?: string;
  start_time?: string;
  locked: number;
}

export interface AttendanceRecord {
  id_number: string;
  name?: string;
  status: 'present' | 'absent' | 'late';
  recorded_at?: string;
}

export interface WeeklySheet {
  teacher_id: number;
  teacher_name: string;
  class_year: string;
  class_parallel: string;
  class_name: string;
  week_start: string;
  days: {
    slot_id: number;
    day_of_week: number;
    day_name: string;
    lesson_date: string;
    start_time: string;
    end_time?: string;
    subject?: string;
    barcode: string;
  }[];
  students: {
    id_number: string;
    name: string;
    barcode: string;
  }[];
}

export interface AttendanceStat {
  subject: string;
  teacher_name: string;
  total: number;
  absent: number;
  late: number;
}
