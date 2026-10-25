export interface UserProfile {
  id: string;
  displayName: string;
  role: 'user' | 'moderator' | 'admin';
}
