export interface UserInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  /** Generated deterministically from `id` when missing. */
  color?: string;
  roles?: string[];
}
