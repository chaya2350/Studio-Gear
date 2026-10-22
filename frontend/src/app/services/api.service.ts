import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Equipment, Loan, Category, Student } from '../models';

export interface CalendarEvent {
  id: number;
  title: string;
  event_date: string;
  hebrew_year: number;
  category: string;
  source_sheet: string;
}

export interface CalendarImportResult {
  imported: number;
  sheets: number;
  warnings: string[];
}

export interface TrackRequirement {
  id: number;
  track_id: number;
  title: string;
  required: number;
  requires_file: number;
  years: string | null;
}

export interface TrackStats {
  track: string;
  total_students: number;
  requirements: { id: number; title: string; required: number; requires_file: number; years: string | null; applicable_count: number; completed_count: number }[];
  students: { id_number: string; name: string; year: string; applicable: number[]; completed: number[]; missing_required: number }[];
}

export interface Track {
  id: number;
  name: string;
  merged_into: number | null;
  merged_into_name: string | null;
  merged_from: { id: number; name: string }[];
  own_student_count: number;
  student_count: number;
  requirements: TrackRequirement[];
}

export interface TracksOverview {
  tracks: Track[];
  undefined_tracks: { name: string; student_count: number }[];
}

export interface StudentRequirement {
  id: number;
  title: string;
  required: number;
  requires_file: number;
  completed_at: string | null;
  completed_by: string | null;
  file_name: string | null;
}

export interface StudentRequirements {
  track: string | null;
  defined: boolean;
  requirements: StudentRequirement[];
}

export interface DataReportColumn {
  key: string;
  label: string;
}

export interface TrackReport {
  track: string;
  year: string;
  columns: DataReportColumn[];
  rows: Record<string, string | number>[];
}

export interface ClassReport {
  year: string;
  columns: DataReportColumn[];
  rows: Record<string, string | number>[];
  exams: { id: number; name: string; year: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api';

  constructor(private http: HttpClient) {}

  getEquipment() { return this.http.get<Equipment[]>(`${this.base}/equipment`); }
  getEquipmentById(id: number) { return this.http.get<Equipment>(`${this.base}/equipment/${id}`); }
  getEquipmentByBarcode(barcode: string) { return this.http.get<Equipment>(`${this.base}/equipment/barcode/${barcode}`); }
  createEquipment(data: Partial<Equipment>) { return this.http.post<{id: number}>(`${this.base}/equipment`, data); }
  updateEquipment(id: number, data: Partial<Equipment>) { return this.http.put(`${this.base}/equipment/${id}`, data); }
  deleteEquipment(id: number) { return this.http.delete(`${this.base}/equipment/${id}`); }
  getNewBarcode() { return this.http.get<{barcode: string}>(`${this.base}/equipment/new-barcode`); }
  getBarcodeUrl(id: number) { return `${this.base}/equipment/${id}/barcode`; }
  getOrderReceiptBarcodeUrl(id: number) { return `${this.base}/loans/receipt-barcode/${id}`; }
  uploadImage(fd: FormData) { return this.http.post<{url: string}>(`${this.base}/upload`, fd); }

  getLoans() { return this.http.get<Loan[]>(`${this.base}/loans`); }
  getOverdueLoans() { return this.http.get<Loan[]>(`${this.base}/loans/overdue`); }
  getLoansByEquipment(id: number) { return this.http.get<Loan[]>(`${this.base}/loans/equipment/${id}`); }
  createLoan(data: Partial<Loan>) { return this.http.post<{id: number}>(`${this.base}/loans`, data); }
  returnLoan(id: number) { return this.http.put<{success:boolean; chargeAmount:number; isOverdue:boolean}>(`${this.base}/loans/${id}/return`, {}); }
  chargeLoan(id: number, amount: number) { return this.http.put<{success:boolean; message:string}>(`${this.base}/loans/${id}/charge`, { amount }); }
  cancelLoan(id: number) { return this.http.delete(`${this.base}/loans/${id}`); }
  getCalendarEvents() { return this.http.get<CalendarEvent[]>(`${this.base}/calendar-events`); }
  importCalendarWorkbook(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CalendarImportResult>(`${this.base}/calendar-events/import`, formData);
  }

  getCategories() { return this.http.get<Category[]>(`${this.base}/categories`); }
  createCategory(data: { name: string; icon: string; parent_id?: number | null }) { return this.http.post<Category>(`${this.base}/categories`, data); }
  deleteCategory(id: number) { return this.http.delete(`${this.base}/categories/${id}`); }
  getSubcategories(category: string) { return this.http.get<string[]>(`${this.base}/subcategories/${encodeURIComponent(category)}`); }

  getLaptopOverdue() { return this.http.get<any[]>(`${this.base}/laptops/overdue`); }

  getStudents(q?: string) { return this.http.get<Student[]>(`${this.base}/students${q ? '?q=' + encodeURIComponent(q) : ''}`); }
  getStudent(id_number: string) { return this.http.get<Student>(`${this.base}/students/${id_number}`); }
  updateStudent(id_number: string, data: Pick<Student, 'name' | 'phone' | 'track' | 'year' | 'phone_code' | 'extra_data'>) {
    return this.http.put(`${this.base}/students/${encodeURIComponent(id_number)}`, data);
  }
  deleteStudent(id_number: string) {
    return this.http.delete<{ success: boolean; id_number: string; name: string }>(`${this.base}/students/${encodeURIComponent(id_number)}`);
  }
  resetDatabase() {
    return this.http.post<{ success: boolean; message: string; cleared: Record<string, number> }>(`${this.base}/admin/reset-database`, {});
  }

  getApprovalTypes() { return this.http.get<any[]>(`${this.base}/approval-types`); }
  createApprovalType(data: { name: string; template: string; signature: string; type: 'single' | 'regular' }) {
    return this.http.post<any>(`${this.base}/approval-types`, data);
  }
  updateApprovalType(id: number, data: { name: string; template: string; signature: string; type: 'single' | 'regular' }) {
    return this.http.put<{ success: boolean }>(`${this.base}/approval-types/${id}`, data);
  }
  deleteApprovalType(id: number) { return this.http.delete(`${this.base}/approval-types/${id}`); }

  getTracks() { return this.http.get<TracksOverview>(`${this.base}/tracks`); }
  createTrack(name: string) { return this.http.post<{ id: number; name: string }>(`${this.base}/tracks`, { name }); }
  renameTrack(id: number, name: string) { return this.http.put(`${this.base}/tracks/${id}`, { name }); }
  deleteTrack(id: number) { return this.http.delete(`${this.base}/tracks/${id}`); }
  mergeTrack(id: number, targetId: number | null) {
    return this.http.put(`${this.base}/tracks/${id}/merge`, { target_id: targetId });
  }
  createTrackRequirement(trackId: number, data: { title: string; required: boolean; requires_file?: boolean; years?: string[] }) {
    return this.http.post<{ id: number }>(`${this.base}/tracks/${trackId}/requirements`, data);
  }
  updateTrackRequirement(id: number, data: { title: string; required: boolean; requires_file?: boolean; years?: string[] }) {
    return this.http.put(`${this.base}/track-requirements/${id}`, data);
  }
  deleteTrackRequirement(id: number) { return this.http.delete(`${this.base}/track-requirements/${id}`); }
  createRequirementForTracks(data: { title: string; required: boolean; requires_file?: boolean; years?: string[]; track_ids: number[] }) {
    return this.http.post<{ added: number; skipped: number }>(`${this.base}/track-requirements/bulk`, data);
  }
  getTrackStats(id: number) { return this.http.get<TrackStats>(`${this.base}/tracks/${id}/stats`); }
  getDatabaseTrackReport(track: string, year: string) {
    return this.http.get<TrackReport>(`${this.base}/reports/track`, { params: { track, year } });
  }
  getDatabaseClassReport(className: string) {
    return this.http.get<ClassReport>(`${this.base}/reports/class`, { params: { class_name: className } });
  }
  requirementFileUrl(id_number: string, requirementId: number) {
    return `${this.base}/students/${encodeURIComponent(id_number)}/requirements/${requirementId}/file`;
  }
  uploadRequirementFile(id_number: string, requirementId: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(this.requirementFileUrl(id_number, requirementId), form);
  }
  getStudentRequirements(id_number: string) {
    return this.http.get<StudentRequirements>(`${this.base}/students/${encodeURIComponent(id_number)}/requirements`);
  }
  setStudentRequirement(id_number: string, requirementId: number, completed: boolean) {
    return this.http.put(`${this.base}/students/${encodeURIComponent(id_number)}/requirements/${requirementId}`, { completed });
  }

  // ── Exams ──
  getExams() { return this.http.get<any[]>(`${this.base}/exams`); }
  getExam(id: number) { return this.http.get<any>(`${this.base}/exams/${id}`); }
  createExam(data: { name: string; track?: string; year?: string; exam_date?: string }) { return this.http.post<{ id: number }>(`${this.base}/exams`, data); }
  deleteExam(id: number) { return this.http.delete(`${this.base}/exams/${id}`); }
  generateExamCodes(id: number, data: { track?: string; year?: string; id_number?: string }) { return this.http.post<{ created: number }>(`${this.base}/exams/${id}/codes`, data); }
  getExamCode(code: string) { return this.http.get<any>(`${this.base}/exam-codes/${encodeURIComponent(code)}`); }
  setExamCodeGrade(code: string, grade: number) { return this.http.put(`${this.base}/exam-codes/${encodeURIComponent(code)}/grade`, { grade }); }
  getExamStats() { return this.http.get<{ byStudent: any[]; byExam: any[] }>(`${this.base}/exams-stats/summary`); }
  getStudentExams(id_number: string) { return this.http.get<any[]>(`${this.base}/students/${encodeURIComponent(id_number)}/exams`); }
  getExamBarcodeUrl(code: string) { return `${this.base}/exam-codes/${encodeURIComponent(code)}/barcode`; }

  // ── דפים אישיים ──
  getPageTopics() { return this.http.get<any[]>(`${this.base}/pages/topics`); }
  createPageTopic(name: string) { return this.http.post<{ id: number; name: string }>(`${this.base}/pages/topics`, { name }); }
  getTopicPages(topicId: number) { return this.http.get<any[]>(`${this.base}/pages/topics/${topicId}/pages`); }
  createPage(topicId: number, data: { title: string; body: string; visibility: 'private' | 'public' }) {
    return this.http.post<{ id: number }>(`${this.base}/pages/topics/${topicId}/pages`, data);
  }
  getPage(id: number) { return this.http.get<any>(`${this.base}/pages/${id}`); }
  updatePage(id: number, data: { title: string; body: string; visibility: 'private' | 'public' }) {
    return this.http.put<{ success: boolean }>(`${this.base}/pages/${id}`, data);
  }
  deletePage(id: number) { return this.http.delete<{ success: boolean }>(`${this.base}/pages/${id}`); }
  requestPageAccess(id: number) { return this.http.post<{ status: string }>(`${this.base}/pages/${id}/request-access`, {}); }
  getPageRequests(id: number) { return this.http.get<any[]>(`${this.base}/pages/${id}/requests`); }
  decidePageRequest(requestId: number, status: 'approved' | 'denied') {
    return this.http.put<{ success: boolean; status: string }>(`${this.base}/pages/requests/${requestId}`, { status });
  }
  getIncomingPageRequests() { return this.http.get<any[]>(`${this.base}/pages/requests/incoming`); }
}
