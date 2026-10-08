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
  loan_id?: number;
  notes?: string;
  // future reservation
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
}

export interface Category {
  id: number;
  name: string;
  icon: string;
}
