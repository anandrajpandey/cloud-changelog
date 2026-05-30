import { formatDistanceToNow } from "date-fns";

function toValidDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidDate(value: string | number | Date | null | undefined) {
  return toValidDate(value) !== null;
}

export function formatRelativeDate(value: string | number | Date | null | undefined) {
  const date = toValidDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : "date unavailable";
}

export function formatLongDate(value: string | number | Date | null | undefined) {
  const date = toValidDate(value);
  return date
    ? date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Date unavailable";
}

export function formatShortDate(value: string | number | Date | null | undefined) {
  const date = toValidDate(value);
  return date ? date.toLocaleDateString() : "Date unavailable";
}
