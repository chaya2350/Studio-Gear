import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Equipment, Loan, Category } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getEquipment() { return this.http.get<Equipment[]>(`${this.base}/equipment`); }
  getEquipmentById(id: number) { return this.http.get<Equipment>(`${this.base}/equipment/${id}`); }
  getEquipmentByBarcode(barcode: string) { return this.http.get<Equipment>(`${this.base}/equipment/barcode/${barcode}`); }
  createEquipment(data: Partial<Equipment>) { return this.http.post<{id: number}>(`${this.base}/equipment`, data); }
  updateEquipment(id: number, data: Partial<Equipment>) { return this.http.put(`${this.base}/equipment/${id}`, data); }
  deleteEquipment(id: number) { return this.http.delete(`${this.base}/equipment/${id}`); }
  getNewBarcode() { return this.http.get<{barcode: string}>(`${this.base}/equipment/new-barcode`); }
  getBarcodeUrl(id: number) { return `${this.base}/equipment/${id}/barcode`; }
  uploadImage(fd: FormData) { return this.http.post<{url: string}>(`${this.base}/upload`, fd); }

  getLoans() { return this.http.get<Loan[]>(`${this.base}/loans`); }
  getOverdueLoans() { return this.http.get<Loan[]>(`${this.base}/loans/overdue`); }
  getLoansByEquipment(id: number) { return this.http.get<Loan[]>(`${this.base}/loans/equipment/${id}`); }
  createLoan(data: Partial<Loan>) { return this.http.post<{id: number}>(`${this.base}/loans`, data); }
  returnLoan(id: number) { return this.http.put<{success:boolean; chargeAmount:number; isOverdue:boolean}>(`${this.base}/loans/${id}/return`, {}); }
  chargeLoan(id: number, amount: number) { return this.http.put<{success:boolean; message:string}>(`${this.base}/loans/${id}/charge`, { amount }); }
  cancelLoan(id: number) { return this.http.delete(`${this.base}/loans/${id}`); }

  getCategories() { return this.http.get<Category[]>(`${this.base}/categories`); }
  createCategory(data: { name: string; icon: string }) { return this.http.post<Category>(`${this.base}/categories`, data); }
  deleteCategory(id: number) { return this.http.delete(`${this.base}/categories/${id}`); }
  getSubcategories(category: string) { return this.http.get<string[]>(`${this.base}/subcategories/${encodeURIComponent(category)}`); }

  getLaptopOverdue() { return this.http.get<any[]>(`${this.base}/laptops/overdue`); }
}
