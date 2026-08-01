import { AUTO_REFRESH_MS, SESSION_STORAGE_KEY } from "./config.js";
import { rpc } from "./api.js";
import {
  $,
  $$,
  emptyState,
  escapeHtml,
  formatDate,
  initials,
  money,
  setButtonBusy,
  showFatalError,
  statusClass,
  statusText,
  toast,
  toDateTimeLocal
} from "./utils.js";

const state = {
  token: localStorage.getItem(SESSION_STORAGE_KEY),
  user: null,
  events: [],
  adminUsers: [],
  adminEvents: [],
  selectedBet: null,
  selectedUser: null,
  selectedFinishEvent: null,
  refreshTimer: null
};

const documents = {
  terms: {
    title: "Пользовательское соглашение",
    body: `
      <p><strong>БкФит</strong> — закрытый шуточный сайт для игры среди друзей.</p>
      <h4>1. Виртуальный характер</h4>
      <p>Все балансы, ставки, выигрыши и знак $ внутри сайта являются виртуальными. Они не являются настоящими деньгами, не продаются и не выводятся.</p>
      <h4>2. Управление событиями</h4>
      <p>Администратор создаёт, редактирует, закрывает, завершает и отменяет события. При отмене события активные ставки возвращаются на виртуальный баланс.</p>
      <h4>3. Доступ</h4>
      <p>Пользователь отвечает за сохранность имени и PIN-кода. Администратор может установить пользователю новый PIN для восстановления доступа.</p>
      <h4>4. Согласие</h4>
      <p>Создавая аккаунт, пользователь подтверждает, что понимает развлекательный и некоммерческий характер сайта.</p>
    `
  },
  privacy: {
    title: "Согласие на обработку данных",
    body: `
      <p>Для работы БкФит сохраняет имя пользователя, хэш PIN-кода, виртуальный баланс, историю ставок, уведомления и техническую сессию входа.</p>
      <h4>Назначение</h4>
      <p>Данные используются только для входа, расчёта виртуальных ставок, рейтинга и работы админ-панели.</p>
      <h4>Безопасность</h4>
      <p>PIN не хранится открытым текстом. Администратор не видит старый PIN, но может установить новый.</p>
      <h4>Рекомендация</h4>
      <p>Не указывайте в имени лишние персональные сведения. Сайт предназначен для закрытого круга друзей.</p>
    `
  }
};

function showAuth() {
  $("#authScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
  stopAutoRefresh();
}

function showApp() {
  $("#authScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  startAutoRefresh();
}

function renderCurrentUser() {
  const user = state.user;
  if (!user) return;

  $("#headerName").textContent = user.name;
  $("#homeBalance").textContent = money(user.balance);
  $("#profileBalance").textContent = money(user.balance);
  $("#profileName").textContent = user.name;
  $("#profileRole").textContent = user.role === "admin" ? "Администратор" : "Пользователь";
  $("#profileAvatar").textContent = initials(user.name);
  $("#adminNavButton").classList.toggle("hidden", user.role !== "admin");
}

async function restoreSession() {
  if (!state.token) {
    showAuth();
    return;
  }

  try {
    state.user = await rpc("bkf_me", { p_token: state.token });
    renderCurrentUser();
    showApp();
    await refreshAll();
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    state.token = null;
    state.user = null;
    showAuth();
  }
}

async function refreshCurrentUser() {
  state.user = await rpc("bkf_me", { p_token: state.token });
  renderCurrentUser();
}

async function refreshAll({ silent = false } = {}) {
  try {
    await Promise.all([
      loadStatus(),
      loadEvents(),
      loadMyBets(),
      loadLeaderboard(),
      loadProfileStats(),
      loadNotifications()
    ]);

    if (state.user?.role === "admin") {
      await Promise.all([loadAdminUsers(), loadAdminEvents()]);
    }
  } catch (error) {
    if (!silent) toast(error.message, "error");
    throw error;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = window.setInterval(() => {
    if (!document.hidden && state.token) {
      refreshAll({ silent: true }).catch(() => {});
    }
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $("#loginSubmit");
  setButtonBusy(button, true, "Входим...");

  try {
    const result = await rpc("bkf_login", {
      p_name: $("#loginName").value,
      p_pin: $("#loginPin").value
    });

    state.token = result.token;
    state.user = result.user;
    localStorage.setItem(SESSION_STORAGE_KEY, state.token);

    renderCurrentUser();
    showApp();
    await refreshAll();
    $("#loginForm").reset();
    toast("Вход выполнен");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const button = $("#registerSubmit");
  setButtonBusy(button, true, "Создаём...");

  try {
    const result = await rpc("bkf_register", {
      p_name: $("#registerName").value,
      p_pin: $("#registerPin").value,
      p_accept_terms: $("#termsCheck").checked,
      p_accept_privacy: $("#privacyCheck").checked
    });

    state.token = result.token;
    state.user = result.user;
    localStorage.setItem(SESSION_STORAGE_KEY, state.token);

    renderCurrentUser();
    showApp();
    await refreshAll();
    $("#registerForm").reset();
    toast("Аккаунт создан");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleLogout() {
  try {
    if (state.token) await rpc("bkf_logout", { p_token: state.token });
  } catch {
    // Локальный выход всё равно выполняется.
  }

  localStorage.removeItem(SESSION_STORAGE_KEY);
  state.token = null;
  state.user = null;
  showAuth();
}

async function loadStatus() {
  const status = await rpc("bkf_status", { p_token: state.token });

  $("#rowsCount").textContent = status.rows_count;
  $("#documentsCount").textContent = status.documents_count;
  $("#statusUpdated").textContent = `Обновлено: ${formatDate(status.updated_at)}`;
  $("#statusRows").value = status.rows_count;
  $("#statusDocuments").value = status.documents_count;
}

async function loadEvents() {
  state.events = await rpc("bkf_events", { p_token: state.token });
  const host = $("#eventsList");

  if (!state.events.length) {
    host.innerHTML = emptyState("Пока нет активных событий.");
    return;
  }

  host.innerHTML = state.events.map((event) => `
    <article class="event-card">
      <div class="event-head">
        <span class="status-pill status-open">Открыто</span>
        <span class="event-time">${event.closes_at ? `до ${formatDate(event.closes_at)}` : "без срока"}</span>
      </div>

      <h3>${escapeHtml(event.title)}</h3>
      ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}

      <div class="outcome-list">
        ${event.outcomes.map((outcome) => `
          <button
            class="outcome-button"
            type="button"
            data-bet-event="${event.id}"
            data-bet-outcome="${outcome.id}"
          >
            <span>${escapeHtml(outcome.title)}</span>
            <strong>${Number(outcome.odds).toFixed(2)}</strong>
          </button>
        `).join("")}
      </div>

      <div class="event-footer">
        <span>${event.bets_count} ставок</span>
        <span>Поставлено: ${money(event.total_bet)}</span>
      </div>

      ${event.recent_bets.length ? `
        <div class="recent-bets">
          ${event.recent_bets.map((bet) => `
            <p>${escapeHtml(bet.user_name)} — ${money(bet.amount)} на «${escapeHtml(bet.outcome_title)}»</p>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `).join("");

  $$("[data-bet-event]").forEach((button) => {
    button.addEventListener("click", () => {
      openBetDialog(button.dataset.betEvent, button.dataset.betOutcome);
    });
  });
}

function openBetDialog(eventId, outcomeId) {
  const event = state.events.find((item) => item.id === eventId);
  const outcome = event?.outcomes.find((item) => item.id === outcomeId);
  if (!event || !outcome) return;

  state.selectedBet = { event, outcome };
  $("#betOutcomeName").textContent = outcome.title;
  $("#betEventName").textContent = event.title;
  $("#betOdds").textContent = Number(outcome.odds).toFixed(2);
  $("#betAmount").value = "";
  $("#possibleWin").textContent = "0 $";
  $("#betDialog").showModal();
}

async function handleBet(event) {
  event.preventDefault();
  const submit = $("#betForm button[type='submit']");
  setButtonBusy(submit, true, "Принимаем...");

  try {
    await rpc("bkf_place_bet", {
      p_token: state.token,
      p_event_id: state.selectedBet.event.id,
      p_outcome_id: state.selectedBet.outcome.id,
      p_amount: Number($("#betAmount").value)
    });

    $("#betDialog").close();
    toast("Ставка принята");
    await refreshCurrentUser();
    await refreshAll();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setButtonBusy(submit, false);
  }
}

async function loadMyBets() {
  const bets = await rpc("bkf_my_bets", { p_token: state.token });
  const host = $("#myBetsList");

  if (!bets.length) {
    host.innerHTML = emptyState("Вы ещё не делали ставок.");
    return;
  }

  const labels = {
    active: "Активна",
    won: "Выигрыш",
    lost: "Проигрыш",
    refunded: "Возврат"
  };

  host.innerHTML = bets.map((bet) => `
    <article class="list-card">
      <div class="list-row">
        <div>
          <h3>${escapeHtml(bet.event_title)}</h3>
          <p>${escapeHtml(bet.outcome_title)} · коэффициент ${Number(bet.odds_at_bet).toFixed(2)}</p>
        </div>
        <div class="list-actions">
          <strong>${money(bet.amount)}</strong>
          <span class="list-meta">${labels[bet.status] || bet.status}</span>
        </div>
      </div>
      <div class="event-footer">
        <span>${formatDate(bet.created_at)}</span>
        <span>Возможный выигрыш: ${money(bet.potential_win)}</span>
      </div>
    </article>
  `).join("");
}

async function loadLeaderboard() {
  const players = await rpc("bkf_leaderboard", { p_token: state.token });
  const host = $("#leaderboardList");

  host.innerHTML = players.length ? players.map((player, index) => `
    <article class="list-card">
      <div class="list-row">
        <div>
          <h3>${index + 1}. ${escapeHtml(player.display_name)}</h3>
          <p>
            ${player.wins} побед · ${player.losses} поражений ·
            ${player.total_bets} ставок · ${player.win_rate}%
          </p>
        </div>
        <div class="list-actions">
          <strong>${money(player.balance)}</strong>
          <span class="list-meta">выиграно ${money(player.total_won)}</span>
        </div>
      </div>
    </article>
  `).join("") : emptyState("В рейтинге пока никого нет.");
}

async function loadProfileStats() {
  const stats = await rpc("bkf_profile_stats", { p_token: state.token });

  $("#profileBets").textContent = stats.total_bets;
  $("#profileWins").textContent = stats.wins;
  $("#profileWinRate").textContent = `${stats.win_rate}%`;
  $("#profileWagered").textContent = money(stats.total_wagered);
  $("#profileWon").textContent = money(stats.total_won);
}

async function loadNotifications() {
  const notifications = await rpc("bkf_notifications", { p_token: state.token });
  const unread = notifications.filter((item) => !item.is_read).length;

  $("#notificationCount").textContent = unread;
  $("#notificationCount").classList.toggle("hidden", unread === 0);

  $("#notificationsList").innerHTML = notifications.length ? notifications.map((item) => `
    <article class="list-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.message)}</p>
      <div class="event-footer">
        <span>${formatDate(item.created_at)}</span>
        <span>${item.is_read ? "Прочитано" : "Новое"}</span>
      </div>
    </article>
  `).join("") : emptyState("Нет уведомлений.");
}

async function openNotifications() {
  $("#notificationsDialog").showModal();

  try {
    await rpc("bkf_mark_notifications_read", { p_token: state.token });
    await loadNotifications();
  } catch {
    // Содержимое уже открыто, ошибка отметки не критична.
  }
}

async function loadAdminUsers() {
  state.adminUsers = await rpc("bkf_admin_users", { p_token: state.token });
  renderAdminUsers();
}

function renderAdminUsers() {
  const query = $("#userSearch").value.trim().toLowerCase();
  const users = state.adminUsers.filter((user) =>
    user.display_name.toLowerCase().includes(query)
  );

  $("#adminUsersList").innerHTML = users.length ? users.map((user) => `
    <article class="list-card">
      <div class="list-row">
        <div>
          <h3>${escapeHtml(user.display_name)}</h3>
          <p>
            ${user.role === "admin" ? "Администратор" : "Пользователь"} ·
            ${user.is_blocked ? "Заблокирован" : "Активен"} ·
            ${user.wins} побед из ${user.total_bets} ставок
          </p>
        </div>
        <div class="list-actions">
          <strong>${money(user.balance)}</strong>
          <button class="button button-ghost button-small" type="button" data-open-user="${user.id}">Управление</button>
        </div>
      </div>
    </article>
  `).join("") : emptyState("Пользователи не найдены.");

  $$("[data-open-user]").forEach((button) => {
    button.addEventListener("click", () => openUserDialog(button.dataset.openUser));
  });
}

async function openUserDialog(userId) {
  state.selectedUser = state.adminUsers.find((user) => user.id === userId);
  if (!state.selectedUser) return;

  const user = state.selectedUser;
  $("#userDialogName").textContent = user.display_name;
  $("#userDialogMeta").textContent =
    `${money(user.balance)} · ${user.role === "admin" ? "администратор" : "пользователь"} · ${user.is_blocked ? "заблокирован" : "активен"}`;

  $("#balanceDelta").value = "";
  $("#balanceReason").value = "";
  $("#newUserPin").value = "";
  $("#toggleRoleButton").textContent =
    user.role === "admin" ? "Сделать пользователем" : "Сделать администратором";
  $("#toggleBlockButton").textContent =
    user.is_blocked ? "Разблокировать" : "Заблокировать";

  $("#userTransactions").innerHTML = `<div class="loading-card">Загрузка...</div>`;
  $("#userBets").innerHTML = `<div class="loading-card">Загрузка...</div>`;
  $("#userDialog").showModal();

  try {
    const history = await rpc("bkf_admin_user_history", {
      p_token: state.token,
      p_user_id: user.id
    });

    $("#userTransactions").innerHTML = history.transactions.length
      ? history.transactions.map((item) => `
          <article class="list-card">
            <div class="list-row">
              <div>
                <h3>${escapeHtml(item.note || item.kind)}</h3>
                <p>${formatDate(item.created_at)}</p>
              </div>
              <div class="list-actions">
                <strong>${Number(item.amount) >= 0 ? "+" : ""}${money(item.amount)}</strong>
                <span class="list-meta">баланс ${money(item.balance_after)}</span>
              </div>
            </div>
          </article>
        `).join("")
      : emptyState("Операций нет.");

    $("#userBets").innerHTML = history.bets.length
      ? history.bets.map((bet) => `
          <article class="list-card">
            <div class="list-row">
              <div>
                <h3>${escapeHtml(bet.event_title)}</h3>
                <p>${escapeHtml(bet.outcome_title)} · ${Number(bet.odds_at_bet).toFixed(2)}</p>
              </div>
              <div class="list-actions">
                <strong>${money(bet.amount)}</strong>
                <span class="list-meta">${escapeHtml(bet.status)}</span>
              </div>
            </div>
          </article>
        `).join("")
      : emptyState("Ставок нет.");
  } catch (error) {
    $("#userTransactions").innerHTML = emptyState(error.message);
    $("#userBets").innerHTML = emptyState("Не удалось загрузить историю.");
  }
}

async function changeUserBalance() {
  const amount = Number($("#balanceDelta").value);
  if (!amount) {
    toast("Введите сумму изменения", "error");
    return;
  }

  try {
    await rpc("bkf_admin_change_balance", {
      p_token: state.token,
      p_user_id: state.selectedUser.id,
      p_amount: amount,
      p_reason: $("#balanceReason").value
    });

    toast("Баланс изменён");
    $("#userDialog").close();
    await refreshCurrentUser();
    await refreshAll();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function resetUserPin() {
  try {
    await rpc("bkf_admin_reset_pin", {
      p_token: state.token,
      p_user_id: state.selectedUser.id,
      p_new_pin: $("#newUserPin").value
    });

    toast("Новый PIN установлен");
    $("#newUserPin").value = "";
  } catch (error) {
    toast(error.message, "error");
  }
}

async function toggleUserRole() {
  const nextRole = state.selectedUser.role === "admin" ? "user" : "admin";
  const question =
    nextRole === "admin"
      ? "Назначить пользователя администратором?"
      : "Убрать права администратора?";

  if (!confirm(question)) return;

  try {
    await rpc("bkf_admin_set_role", {
      p_token: state.token,
      p_user_id: state.selectedUser.id,
      p_role: nextRole
    });

    toast("Роль изменена");
    $("#userDialog").close();
    await refreshAll();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function toggleUserBlock() {
  const blocked = !state.selectedUser.is_blocked;
  if (!confirm(blocked ? "Заблокировать пользователя?" : "Разблокировать пользователя?")) return;

  try {
    await rpc("bkf_admin_set_blocked", {
      p_token: state.token,
      p_user_id: state.selectedUser.id,
      p_blocked: blocked
    });

    toast(blocked ? "Пользователь заблокирован" : "Пользователь разблокирован");
    $("#userDialog").close();
    await loadAdminUsers();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadAdminEvents() {
  state.adminEvents = await rpc("bkf_admin_events", { p_token: state.token });
  renderAdminEvents();
}

function renderAdminEvents() {
  const host = $("#adminEventsList");

  if (!state.adminEvents.length) {
    host.innerHTML = emptyState("Событий ещё нет.");
    return;
  }

  host.innerHTML = state.adminEvents.map((event) => `
    <article class="list-card">
      <div class="list-row">
        <div>
          <span class="status-pill ${statusClass(event.status)}">${statusText(event.status)}</span>
          <h3>${escapeHtml(event.title)}</h3>
          <p>${event.bets_count} ставок · ${money(event.total_bet)}</p>
        </div>

        <div class="list-actions">
          ${["open", "closed"].includes(event.status)
            ? `<button class="button button-ghost button-small" type="button" data-edit-event="${event.id}">Изменить</button>`
            : ""}

          <button class="button button-ghost button-small" type="button" data-event-bets="${event.id}">Ставки</button>

          ${event.status === "open"
            ? `<button class="button button-ghost button-small" type="button" data-close-event="${event.id}">Закрыть</button>`
            : ""}

          ${event.status === "closed"
            ? `<button class="button button-ghost button-small" type="button" data-reopen-event="${event.id}">Открыть</button>`
            : ""}

          ${["open", "closed"].includes(event.status)
            ? `<button class="button button-ghost button-small" type="button" data-finish-event="${event.id}">Завершить</button>
               <button class="button button-danger button-small" type="button" data-cancel-event="${event.id}">Отменить</button>`
            : ""}

          ${event.bets_count === 0
            ? `<button class="button button-danger button-small" type="button" data-delete-event="${event.id}">Удалить</button>`
            : ""}
        </div>
      </div>
    </article>
  `).join("");

  $$("[data-edit-event]").forEach((button) =>
    button.addEventListener("click", () => openEditEventDialog(button.dataset.editEvent))
  );
  $$("[data-event-bets]").forEach((button) =>
    button.addEventListener("click", () => openEventBets(button.dataset.eventBets))
  );
  $$("[data-close-event]").forEach((button) =>
    button.addEventListener("click", () => adminEventAction("bkf_admin_close_event", button.dataset.closeEvent, "Закрыть приём ставок?"))
  );
  $$("[data-reopen-event]").forEach((button) =>
    button.addEventListener("click", () => adminEventAction("bkf_admin_reopen_event", button.dataset.reopenEvent, "Снова открыть приём ставок?"))
  );
  $$("[data-cancel-event]").forEach((button) =>
    button.addEventListener("click", () => adminEventAction("bkf_admin_cancel_event", button.dataset.cancelEvent, "Отменить событие и вернуть все активные ставки?"))
  );
  $$("[data-delete-event]").forEach((button) =>
    button.addEventListener("click", () => adminEventAction("bkf_admin_delete_event", button.dataset.deleteEvent, "Удалить событие без ставок?"))
  );
  $$("[data-finish-event]").forEach((button) =>
    button.addEventListener("click", () => openFinishDialog(button.dataset.finishEvent))
  );
}

function addOutcomeRow(outcome = {}) {
  const row = document.createElement("div");
  row.className = "outcome-row";
  row.dataset.outcomeId = outcome.id || "";

  row.innerHTML = `
    <input class="outcome-title" placeholder="Название исхода" maxlength="100" value="${escapeHtml(outcome.title || "")}" required>
    <input class="outcome-odds" type="number" min="1.01" step="0.01" placeholder="Коэф." value="${outcome.odds ?? ""}" required>
    <button class="remove-outcome" type="button" aria-label="Удалить исход">×</button>
  `;

  $(".remove-outcome", row).addEventListener("click", () => row.remove());
  $("#outcomeEditor").append(row);
}

function openCreateEventDialog() {
  $("#eventForm").reset();
  $("#editingEventId").value = "";
  $("#eventDialogTitle").textContent = "Новое событие";
  $("#outcomeEditor").innerHTML = "";
  addOutcomeRow();
  addOutcomeRow();
  $("#eventDialog").showModal();
}

function openEditEventDialog(eventId) {
  const event = state.adminEvents.find((item) => item.id === eventId);
  if (!event) return;

  $("#eventForm").reset();
  $("#editingEventId").value = event.id;
  $("#eventDialogTitle").textContent = "Изменить событие";
  $("#eventTitle").value = event.title;
  $("#eventDescription").value = event.description || "";
  $("#eventClosesAt").value = toDateTimeLocal(event.closes_at);
  $("#outcomeEditor").innerHTML = "";
  event.outcomes.forEach(addOutcomeRow);
  $("#eventDialog").showModal();
}

async function saveEvent(event) {
  event.preventDefault();

  const outcomes = $$("#outcomeEditor .outcome-row").map((row, index) => ({
    id: row.dataset.outcomeId || null,
    title: $(".outcome-title", row).value.trim(),
    odds: Number($(".outcome-odds", row).value),
    sort_order: index
  }));

  if (outcomes.length < 2) {
    toast("Нужно минимум два исхода", "error");
    return;
  }

  const button = $("#saveEventButton");
  setButtonBusy(button, true, "Сохраняем...");

  const common = {
    p_token: state.token,
    p_title: $("#eventTitle").value,
    p_description: $("#eventDescription").value,
    p_closes_at: $("#eventClosesAt").value
      ? new Date($("#eventClosesAt").value).toISOString()
      : null,
    p_outcomes: outcomes
  };

  try {
    const eventId = $("#editingEventId").value;

    if (eventId) {
      await rpc("bkf_admin_update_event", {
        ...common,
        p_event_id: eventId
      });
      toast("Событие обновлено");
    } else {
      await rpc("bkf_admin_create_event", common);
      toast("Событие создано");
    }

    $("#eventDialog").close();
    await refreshAll();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function adminEventAction(functionName, eventId, question) {
  if (!confirm(question)) return;

  try {
    await rpc(functionName, {
      p_token: state.token,
      p_event_id: eventId
    });
    toast("Готово");
    await refreshAll();
  } catch (error) {
    toast(error.message, "error");
  }
}

function openFinishDialog(eventId) {
  const event = state.adminEvents.find((item) => item.id === eventId);
  if (!event) return;

  state.selectedFinishEvent = event;
  $("#finishEventName").textContent = event.title;
  $("#winnerOutcome").innerHTML = event.outcomes.map((outcome) =>
    `<option value="${outcome.id}">${escapeHtml(outcome.title)}</option>`
  ).join("");
  $("#finishEventDialog").showModal();
}

async function finishEvent(event) {
  event.preventDefault();

  if (!confirm("Завершить событие и окончательно рассчитать все ставки?")) return;

  try {
    await rpc("bkf_admin_finish_event", {
      p_token: state.token,
      p_event_id: state.selectedFinishEvent.id,
      p_winner_outcome_id: $("#winnerOutcome").value
    });

    $("#finishEventDialog").close();
    toast("Событие рассчитано");
    await refreshAll();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function openEventBets(eventId) {
  const event = state.adminEvents.find((item) => item.id === eventId);
  $("#eventBetsTitle").textContent = event?.title || "Ставки";
  $("#eventBetsList").innerHTML = `<div class="loading-card">Загрузка...</div>`;
  $("#eventBetsDialog").showModal();

  try {
    const bets = await rpc("bkf_admin_event_bets", {
      p_token: state.token,
      p_event_id: eventId
    });

    $("#eventBetsList").innerHTML = bets.length ? bets.map((bet) => `
      <article class="list-card">
        <div class="list-row">
          <div>
            <h3>${escapeHtml(bet.display_name)}</h3>
            <p>${escapeHtml(bet.outcome_title)} · коэффициент ${Number(bet.odds_at_bet).toFixed(2)}</p>
          </div>
          <div class="list-actions">
            <strong>${money(bet.amount)}</strong>
            <span class="list-meta">${escapeHtml(bet.status)}</span>
          </div>
        </div>
        <div class="event-footer">
          <span>${formatDate(bet.created_at)}</span>
          <span>Возможный выигрыш: ${money(bet.potential_win)}</span>
        </div>
      </article>
    `).join("") : emptyState("На событие никто не ставил.");
  } catch (error) {
    $("#eventBetsList").innerHTML = emptyState(error.message);
  }
}

async function updateStatus(event) {
  event.preventDefault();

  try {
    await rpc("bkf_admin_update_status", {
      p_token: state.token,
      p_rows: Number($("#statusRows").value),
      p_documents: Number($("#statusDocuments").value)
    });

    toast("Показатели обновлены");
    await loadStatus();
  } catch (error) {
    toast(error.message, "error");
  }
}

function switchPage(pageName) {
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  $$(".page").forEach((page) => page.classList.remove("active"));
  $(`#page-${pageName}`).classList.add("active");

  if (pageName === "admin" && state.user?.role === "admin") {
    Promise.all([loadAdminUsers(), loadAdminEvents()]).catch((error) => {
      toast(error.message, "error");
    });
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDocument(documentName) {
  const document = documents[documentName];
  if (!document) return;

  $("#documentTitle").textContent = document.title;
  $("#documentBody").innerHTML = document.body;
  $("#documentDialog").showModal();
}

function bindEvents() {
  $$("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-auth-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      const login = button.dataset.authTab === "login";
      $("#loginForm").classList.toggle("hidden", !login);
      $("#registerForm").classList.toggle("hidden", login);
    });
  });

  $("#loginForm").addEventListener("submit", handleLogin);
  $("#registerForm").addEventListener("submit", handleRegister);
  $("#logoutButton").addEventListener("click", handleLogout);
  $("#refreshButton").addEventListener("click", () => refreshAll().catch(() => {}));
  $("#notificationsButton").addEventListener("click", openNotifications);

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });

  $$("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-admin-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      $$(".admin-pane").forEach((pane) => pane.classList.remove("active"));
      $(`#admin-${button.dataset.adminTab}`).classList.add("active");
    });
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      dialog?.close();
    });
  });

  $$("[data-document]").forEach((button) => {
    button.addEventListener("click", () => openDocument(button.dataset.document));
  });

  $("#betAmount").addEventListener("input", () => {
    const amount = Number($("#betAmount").value || 0);
    const odds = Number(state.selectedBet?.outcome.odds || 0);
    $("#possibleWin").textContent = money(amount * odds);
  });

  $$("[data-quick-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#betAmount").value = button.dataset.quickAmount;
      $("#betAmount").dispatchEvent(new Event("input"));
    });
  });

  $("#betAllButton").addEventListener("click", () => {
    $("#betAmount").value = Math.floor(Number(state.user.balance));
    $("#betAmount").dispatchEvent(new Event("input"));
  });

  $("#betForm").addEventListener("submit", handleBet);
  $("#userSearch").addEventListener("input", renderAdminUsers);
  $("#reloadUsersButton").addEventListener("click", () => loadAdminUsers().catch((error) => toast(error.message, "error")));

  $("#changeBalanceButton").addEventListener("click", changeUserBalance);
  $("#resetPinButton").addEventListener("click", resetUserPin);
  $("#toggleRoleButton").addEventListener("click", toggleUserRole);
  $("#toggleBlockButton").addEventListener("click", toggleUserBlock);

  $("#createEventButton").addEventListener("click", openCreateEventDialog);
  $("#addOutcomeButton").addEventListener("click", () => addOutcomeRow());
  $("#eventForm").addEventListener("submit", saveEvent);
  $("#finishEventForm").addEventListener("submit", finishEvent);
  $("#statusForm").addEventListener("submit", updateStatus);
}

async function init() {
  try {
    bindEvents();
    await restoreSession();
  } catch (error) {
    console.error(error);
    showFatalError(`Ошибка запуска сайта: ${error.message}`);
  }
}

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
});

init();
