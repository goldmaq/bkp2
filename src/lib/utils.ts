import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, isValid as isValidDate, Timestamp } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Text Formatting
export const toTitleCase = (str: string | undefined | null): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Phone Number Utilities
export const getWhatsAppNumber = (phone?: string): string => {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) return cleaned;
  if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) return `55${cleaned}`;
  return cleaned;
};

export const formatPhoneNumberForInputDisplay = (value: string | undefined | null): string => {
  if (!value) return "";
  const cleaned = value.replace(/\D/g, "");
  const len = cleaned.length;

  if (len === 0) return "";

  let ddd = cleaned.substring(0, 2);
  let numberPart = cleaned.substring(2);

  if (len <= 2) return `(${cleaned}`;
  if (len <= 6) return `(${ddd}) ${numberPart}`;

  if (numberPart.length <= 5) {
    return `(${ddd}) ${numberPart}`;
  }

  if (numberPart.length <= 9) {
    const firstPartLength = numberPart.length === 9 ? 5 : 4;
    const firstDigits = numberPart.substring(0, firstPartLength);
    const secondDigits = numberPart.substring(firstPartLength);
    if (secondDigits) {
      return `(${ddd}) ${firstDigits}-${secondDigits}`;
    }
    return `(${ddd}) ${firstDigits}`;
  }
  const firstDigits = numberPart.substring(0, 5);
  const secondDigits = numberPart.substring(5, 9);
  return `(${ddd}) ${firstDigits}-${secondDigits}`;
};

// URL/File Utilities
export const getFileNameFromUrl = (url?: string | null): string => {
  if (!url) return "arquivo";
  try {
    const decodedUrl = decodeURIComponent(url);
    const pathAndQuery = decodedUrl.split('?')[0];
    const segments = pathAndQuery.split('/');
    const fileNameWithPossiblePrefix = segments.pop() || "arquivo";
    const fileNameCleaned = fileNameWithPossiblePrefix.split('?')[0];
    // Handle cases where the prefix might not exist or filename is simple
    const finalFileName = fileNameCleaned.includes('_') ? fileNameCleaned.substring(fileNameCleaned.indexOf('_') + 1) : fileNameCleaned;
    return finalFileName || "arquivo";
  } catch (e) {
    console.error("Error parsing filename from URL:", e);
    return "arquivo";
  }
};

// Data Parsing Utilities
export const parseNumericToNullOrNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};

// Date Formatting Utilities
export const formatDateForInput = (dateValue: any): string => {
  if (!dateValue) return "";
  let d: Date;
  if (dateValue instanceof Timestamp) { // Firestore Timestamp
    d = dateValue.toDate();
  } else if (typeof dateValue === 'string') { // ISO string or yyyy-MM-dd
    d = parseISO(dateValue); // parseISO handles yyyy-MM-dd correctly
  } else if (dateValue instanceof Date) { // JavaScript Date
    d = dateValue;
  } else {
    return "";
  }
  if (!isValidDate(d)) return "";
  return format(d, 'yyyy-MM-dd');
};

export const formatDateForDisplay = (dateValue?: string | Timestamp | Date | null): string => {
  if (!dateValue) return "N/A";
  let parsedDate: Date;
  try {
    if (dateValue instanceof Timestamp) {
      parsedDate = dateValue.toDate();
    } else if (typeof dateValue === 'string') {
      parsedDate = parseISO(dateValue);
    } else if (dateValue instanceof Date) {
      parsedDate = dateValue;
    }
     else {
      return "Data Inválida";
    }

    if (!isValidDate(parsedDate)) return "Data Inválida";
    return format(parsedDate, "dd/MM/yyyy", { locale: ptBR });
  } catch (e) {
    console.error("Error formatting date for display:", e, "Original value:", dateValue);
    return "Erro na Data";
  }
};
