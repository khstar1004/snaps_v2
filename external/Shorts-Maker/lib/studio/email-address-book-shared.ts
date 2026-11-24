export const STUDIO_EMAIL_ADDRESS_BOOK_LIMIT = 50;

export type StudioEmailQuickRecipient = {
  id: string;
  label: string;
  email: string;
};

export type StudioEmailAddressBookEntry = {
  email: string;
  label: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export const STUDIO_EMAIL_QUICK_RECIPIENTS: StudioEmailQuickRecipient[] = [
  {
    id: "my-email",
    label: "내꺼메일",
    email: "azicteam@gmail.com",
  },
  {
    id: "didim-lawyer",
    label: "디딤변호사꺼",
    email: "hyt3990@naver.com",
  },
];

export function normalizeStudioEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidStudioEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeStudioEmailAddress(value));
}

export function findStudioEmailQuickRecipient(email: string): StudioEmailQuickRecipient | undefined {
  const normalized = normalizeStudioEmailAddress(email);
  return STUDIO_EMAIL_QUICK_RECIPIENTS.find((item) => item.email === normalized);
}

export function resolveStudioEmailLabel(email: string, label?: string): string {
  const explicit = (label || "").trim();
  if (explicit) return explicit;
  const quickRecipient = findStudioEmailQuickRecipient(email);
  if (quickRecipient) return quickRecipient.label;
  const normalized = normalizeStudioEmailAddress(email);
  return normalized.split("@")[0] || normalized;
}
