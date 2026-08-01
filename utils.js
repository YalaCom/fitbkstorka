export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 2
  })} $`;
}

export function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function toast(message, type = "success") {
  const host = $("#toastHost");
  const element = document.createElement("div");
  element.className = `toast toast-${type}`;
  element.textContent = message;
  host.append(element);
  setTimeout(() => element.remove(), 3800);
}

export function setButtonBusy(button, busy, busyText = "Подождите...") {
  if (!button) return;

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

export function showFatalError(message) {
  const box = $("#fatalError");
  box.textContent = message;
  box.classList.remove("hidden");
}

export function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

export function statusText(status) {
  return ({
    open: "Открыто",
    closed: "Закрыто",
    finished: "Завершено",
    cancelled: "Отменено"
  })[status] || status;
}

export function statusClass(status) {
  return ({
    open: "status-open",
    closed: "status-closed",
    finished: "status-finished",
    cancelled: "status-cancelled"
  })[status] || "status-closed";
}
