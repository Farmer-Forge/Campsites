export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  suspended: boolean;
  createdAt: string;
}
