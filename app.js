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
  refreshTimer: null,
  eventsRequestId: 0,
  betsRequestId: 0,
  playerStatsRequestId: 0,
  leaderboardMode: "balance",
  expressLegs: [],
  bonuses: null
};

const BET_STATUS_LABELS = {
  active: "Активна",
  won: "Выигрыш",
  lost: "Проигрыш",
  refunded: "Возврат",
  cashed_out: "Выкуплена"
};

function betStatusText(status) {
  return BET_STATUS_LABELS[status] || status;
}

const THEME_STORAGE_KEY = "bkfit_theme";
const HIDE_BALANCE_STORAGE_KEY = "bkfit_hide_balance";
const ALLOWED_THEMES = new Set(["gold", "white", "mono", "blue"]);

const ACHIEVEMENT_DEFINITIONS = [
  { icon:"🎟", title:"Первый шаг", description:"Сделать первую ставку", metric:"total_bets", target:1, tier:"basic" },
  { icon:"🔟", title:"Завсегдатай", description:"Сделать 10 ставок", metric:"total_bets", target:10, tier:"basic" },
  { icon:"🏁", title:"Первая победа", description:"Выиграть первую ставку", metric:"wins", target:1, tier:"basic" },
  { icon:"🏆", title:"Десять побед", description:"Выиграть 10 ставок", metric:"wins", target:10, tier:"special" },
  { icon:"👑", title:"Двадцать пять побед", description:"Выиграть 25 ставок", metric:"wins", target:25, tier:"gold" },
  { icon:"🚀", title:"Охотник за X10", description:"Выиграть с коэффициентом 10+", metric:"max_winning_odds", target:10, tier:"special" },
  { icon:"🥉", title:"Бронзовая серия", description:"3 победы подряд", metric:"max_win_streak", target:3, tier:"bronze" },
  { icon:"🥈", title:"Серебряная серия", description:"4 победы подряд", metric:"max_win_streak", target:4, tier:"silver" },
  { icon:"🥇", title:"Золотая серия", description:"5 побед подряд", metric:"max_win_streak", target:5, tier:"gold" },
  { icon:"🔥", title:"Несокрушимый", description:"7 побед подряд", metric:"max_win_streak", target:7, tier:"gold" },
  { icon:"💪", title:"Крупная ставка", description:"Поставить 500 $ одной ставкой", metric:"max_bet", target:500, tier:"special", moneyProgress:true },
  { icon:"💰", title:"Большой куш", description:"Выиграть 1000 $ одной ставкой", metric:"max_win", target:1000, tier:"special", moneyProgress:true },
  { icon:"📈", title:"Капитал", description:"Достичь баланса 5000 $", metric:"max_balance", target:5000, tier:"gold", moneyProgress:true },
  { icon:"🧾", title:"Первый экспресс", description:"Сделать первый экспресс", metric:"express_bets", target:1, tier:"basic" },
  { icon:"✅", title:"Экспресс прошёл", description:"Выиграть экспресс", metric:"express_wins", target:1, tier:"special" },
  { icon:"⚡", title:"Экспресс X10", description:"Выиграть экспресс с коэффициентом 10+", metric:"max_express_winning_odds", target:10, tier:"special" },
  { icon:"🌪", title:"Безумный экспресс", description:"Выиграть экспресс с коэффициентом 25+", metric:"max_express_winning_odds", target:25, tier:"gold" },
  { icon:"🎡", title:"Колесо запущено", description:"Получить первый приз", metric:"wheel_spins", target:1, tier:"basic" },
  { icon:"💎", title:"Джекпот", description:"Получить 500 $ в колесе", metric:"wheel_500_wins", target:1, tier:"gold" },
  { icon:"🛡", title:"Под защитой", description:"Получить возврат по страховке", metric:"insurance_saves", target:1, tier:"special" },
  { icon:"🔵", title:"Бустер", description:"Выиграть ставку с бустом", metric:"boosted_wins", target:1, tier:"special" },
  { icon:"🤝", title:"Первый друг", description:"Пригласить одного участника", metric:"referrals", target:1, tier:"basic" },
  { icon:"👥", title:"Своя команда", description:"Пригласить трёх участников", metric:"referrals", target:3, tier:"gold" }
];

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return ALLOWED_THEMES.has(saved) ? saved : "gold";
  } catch {
    return "gold";
  }
}

function isBalanceHidden() {
  try {
    return localStorage.getItem(HIDE_BALANCE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyTheme(theme, { save = true } = {}) {
  const safeTheme = ALLOWED_THEMES.has(theme) ? theme : "gold";
  document.documentElement.dataset.theme = safeTheme;

  const themeColors = {
    gold: "#080705",
    white: "#f5f5f5",
    mono: "#050505",
    blue: "#070b14"
  };

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColors[safeTheme]);

  if (save) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    } catch {
      // Тема всё равно применена на текущей странице.
    }
  }

  $$("[data-theme-option]").forEach((button) => {
    const active = button.dataset.themeOption === safeTheme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function applyBalancePrivacy(hidden, { save = true } = {}) {
  document.documentElement.dataset.hideBalance = hidden ? "true" : "false";

  const toggle = $("#hideBalanceToggle");
  if (toggle) toggle.checked = hidden;

  if (save) {
    try {
      localStorage.setItem(HIDE_BALANCE_STORAGE_KEY, hidden ? "1" : "0");
    } catch {
      // Настройка всё равно действует на текущей странице.
    }
  }
}

function initAppearance() {
  applyTheme(getSavedTheme(), { save: false });
  applyBalancePrivacy(isBalanceHidden(), { save: false });
}

const documents = {
  terms: {
    title: "Пользовательское соглашение",
    body: `
      <p><strong>БкФит</strong> — закрытый шуточный сайт для игры среди друзей.</p>
      <h4>1. Виртуальный характер</h4>
      <p>Все балансы, ставки, выигрыши и знак $ внутри сайта являются виртуальными. Они не являются настоящими деньгами, не продаются и не выводятся.</p>
      <h4>2. Управление событиями</h4>
      <p>Администратор создаёт, редактирует, закрывает, завершает и отменяет события. При отмене события активные ставки возвращаются на виртуальный баланс.</p>
      <h4>3. Выкуп ставки</h4>
      <p>Пользователь может один раз досрочно выкупить активную ставку и получить 30% от её первоначальной суммы. После выкупа ставка окончательно закрывается и больше не участвует в выигрыше или возврате.</p>
      <h4>4. Экспрессы и бонусы</h4><p>Экспресс выигрывает только при успешном расчёте всех его исходов. Бонусы колеса являются виртуальными и применяются по правилам сайта.</p><h4>5. Реферальная программа</h4><p>Награда начисляется только за нового участника, который активирует код в установленный срок до первой ставки.</p>
      <h4>6. Доступ</h4>
      <p>Пользователь отвечает за сохранность имени и PIN-кода. Администратор может установить пользователю новый PIN для восстановления доступа.</p>
      <h4>7. Согласие</h4>
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
      refreshCurrentUser(),
      loadStatus(),
      loadEvents(),
      loadMyBets(),
      loadLeaderboard(),
      loadProfileStats(),
      loadAchievements(),
      loadRewardsProfile(),
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
  const requestId = ++state.eventsRequestId;
  const tokenAtStart = state.token;
  const result = await rpc("bkf_events", { p_token: tokenAtStart });

  if (requestId !== state.eventsRequestId || tokenAtStart !== state.token) {
    return;
  }

  state.events = result;
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
          <div class="outcome-actions">
            <button class="outcome-button" type="button" data-bet-event="${event.id}" data-bet-outcome="${outcome.id}">
              <span>${escapeHtml(outcome.title)}</span><strong>${Number(outcome.odds).toFixed(2)}</strong>
            </button>
            <button class="express-add-button" type="button" data-express-event="${event.id}" data-express-outcome="${outcome.id}" aria-label="Добавить в экспресс">+</button>
          </div>
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

  $$('[data-express-event]').forEach((button) => {
    button.addEventListener('click', () => addExpressLeg(button.dataset.expressEvent, button.dataset.expressOutcome));
  });


function addExpressLeg(eventId, outcomeId) {
  const event = state.events.find((item) => item.id === eventId);
  const outcome = event?.outcomes.find((item) => item.id === outcomeId);
  if (!event || !outcome) return;
  if (state.expressLegs.some((leg) => leg.eventId === eventId)) {
    toast("В экспрессе можно выбрать только один исход одного события", "error"); return;
  }
  if (state.expressLegs.length >= 5) { toast("В экспрессе максимум 5 исходов", "error"); return; }
  state.expressLegs.push({eventId,outcomeId,eventTitle:event.title,outcomeTitle:outcome.title,odds:Number(outcome.odds)});
  renderExpressBuilder();
}
function renderExpressBuilder() {
  const box=$("#expressBuilder"), host=$("#expressLegs");
  box.classList.toggle("hidden", state.expressLegs.length===0);
  host.innerHTML=state.expressLegs.map((leg,i)=>`<div class="express-leg"><div><strong>${escapeHtml(leg.outcomeTitle)}</strong><small>${escapeHtml(leg.eventTitle)}</small></div><span>${leg.odds.toFixed(2)}</span><button type="button" data-remove-express="${i}">×</button></div>`).join("");
  const odds=state.expressLegs.reduce((v,l)=>v*l.odds,1);
  $("#expressOdds").textContent=odds.toFixed(2);
  $("#expressPossibleWin").textContent=money(Number($("#expressAmount").value||0)*odds);
  $$('[data-remove-express]').forEach(b=>b.addEventListener('click',()=>{state.expressLegs.splice(Number(b.dataset.removeExpress),1);renderExpressBuilder();}));
}
async function handleExpress(event) {
  event.preventDefault();
  if (state.expressLegs.length<2) { toast("Для экспресса нужно минимум 2 исхода", "error"); return; }
  const button=$("#expressForm button[type='submit']"); setButtonBusy(button,true,"Принимаем...");
  try {
    await rpc("bkf_place_express",{p_token:state.token,p_legs:state.expressLegs.map(l=>({event_id:l.eventId,outcome_id:l.outcomeId})),p_amount:Number($("#expressAmount").value)});
    state.expressLegs=[]; $("#expressAmount").value=""; renderExpressBuilder(); toast("Экспресс принят"); await refreshAll();
  } catch(error){toast(error.message,"error");} finally {setButtonBusy(button,false);}
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
    toast("Ставка сохранена в базе");
    await refreshCurrentUser();
    await Promise.all([
      loadMyBets(),
      loadEvents(),
      loadProfileStats(),
      loadAchievements(),
      loadLeaderboard(),
      loadNotifications()
    ]);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setButtonBusy(submit, false);
  }
}

async function loadMyBets() {
  const requestId=++state.betsRequestId, tokenAtStart=state.token;
  const [bets,expresses,bonuses]=await Promise.all([
    rpc("bkf_my_bets",{p_token:tokenAtStart}), rpc("bkf_my_express_bets",{p_token:tokenAtStart}), rpc("bkf_bonus_status",{p_token:tokenAtStart})
  ]);
  if(requestId!==state.betsRequestId||tokenAtStart!==state.token)return;
  state.bonuses=bonuses; const host=$("#myBetsList");
  const singleHtml=bets.map(bet=>{const active=bet.status==='active',free=Number(bonuses.free_cashouts||0)>0;return `<article class="list-card"><div class="list-row"><div><h3>${escapeHtml(bet.event_title)}</h3><p>${escapeHtml(bet.outcome_title)} · коэффициент ${Number(bet.odds_at_bet).toFixed(2)}${bet.boosted?' · БУСТ':''}${bet.insured?' · СТРАХОВКА':''}</p></div><div class="list-actions"><strong>${money(bet.amount)}</strong><span class="list-meta">${escapeHtml(betStatusText(bet.status))}</span>${active&&bet.cashout_available?`<button class="button button-ghost button-small" data-cashout-bet="${bet.id}" data-cashout-amount="${Number(bet.cashout_offer||0)}">Выкупить за ${money(bet.cashout_offer)}</button>`:''}${active&&free?`<button class="button button-gold button-small" data-free-cashout-type="single" data-free-cashout-id="${bet.id}">Бесплатный выкуп</button>`:''}</div></div><div class="event-footer"><span>${formatDate(bet.created_at)}</span><span>${bet.status==='cashed_out'?`Возвращено: ${money(bet.cashout_amount)}`:`Возможный выигрыш: ${money(bet.potential_win)}`}</span></div></article>`;}).join('');
  const expressHtml=expresses.map(ex=>{const active=ex.status==='active',free=Number(bonuses.free_cashouts||0)>0;return `<article class="list-card express-history"><div class="list-row"><div><span class="status-pill">Экспресс · ${ex.legs.length} исхода</span><h3>Общий коэффициент ${Number(ex.total_odds).toFixed(2)}</h3><div class="express-history-legs">${ex.legs.map(l=>`<p>${escapeHtml(l.event_title)} — ${escapeHtml(l.outcome_title)} (${Number(l.odds).toFixed(2)})</p>`).join('')}</div></div><div class="list-actions"><strong>${money(ex.amount)}</strong><span class="list-meta">${escapeHtml(betStatusText(ex.status))}</span>${active?`<button class="button button-ghost button-small" data-cashout-express="${ex.id}" data-cashout-amount="${Number(ex.cashout_offer||0)}">Выкупить за ${money(ex.cashout_offer)}</button>`:''}${active&&free?`<button class="button button-gold button-small" data-free-cashout-type="express" data-free-cashout-id="${ex.id}">Бесплатный выкуп</button>`:''}</div></div><div class="event-footer"><span>${formatDate(ex.created_at)}</span><span>Возможный выигрыш: ${money(ex.potential_win)}</span></div></article>`;}).join('');
  host.innerHTML=(expressHtml+singleHtml)||emptyState("Вы ещё не делали ставок.");
  $$('[data-cashout-bet]').forEach(b=>b.addEventListener('click',()=>cashoutBet(b.dataset.cashoutBet,Number(b.dataset.cashoutAmount),b)));
  $$('[data-cashout-express]').forEach(b=>b.addEventListener('click',()=>cashoutExpress(b.dataset.cashoutExpress,Number(b.dataset.cashoutAmount),b)));
  $$('[data-free-cashout-id]').forEach(b=>b.addEventListener('click',()=>freeCashout(b.dataset.freeCashoutType,b.dataset.freeCashoutId,b)));
}

async function cashoutBet(betId, cashoutAmount, button) {
  const confirmed = confirm(
    `Выкупить ставку за ${money(cashoutAmount)}?\n\n` +
    "Эта сумма вернётся на баланс, а ставка больше не сможет выиграть или получить возврат."
  );

  if (!confirmed) return;

  setButtonBusy(button, true, "Выкупаем...");

  try {
    const result = await rpc("bkf_cashout_bet", {
      p_token: state.token,
      p_bet_id: betId
    });

    toast(`Ставка выкуплена. Возвращено ${money(result.cashout_amount)}`);

    await refreshCurrentUser();
    await Promise.all([
      loadMyBets(),
      loadEvents(),
      loadProfileStats(),
      loadAchievements(),
      loadLeaderboard(),
      loadNotifications()
    ]);
  } catch (error) {
    toast(error.message, "error");
    setButtonBusy(button, false);
  }
}

async function cashoutExpress(id,amount,button){if(!confirm(`Выкупить экспресс за ${money(amount)}?`))return;setButtonBusy(button,true,"Выкупаем...");try{await rpc("bkf_cashout_express",{p_token:state.token,p_express_id:id});toast("Экспресс выкуплен");await refreshAll();}catch(e){toast(e.message,"error");setButtonBusy(button,false);}}
async function freeCashout(type,id,button){if(!confirm("Использовать бесплатный выкуп и вернуть всю сумму?"))return;setButtonBusy(button,true,"Выкупаем...");try{await rpc("bkf_use_free_cashout",{p_token:state.token,p_bet_type:type,p_bet_id:id});toast("Бесплатный выкуп использован");await refreshAll();}catch(e){toast(e.message,"error");setButtonBusy(button,false);}}

async function loadLeaderboard() {
  const players = await rpc("bkf_leaderboard_v2", { p_token: state.token, p_mode: state.leaderboardMode });
  const host = $("#leaderboardList");

  host.innerHTML = players.length ? players.map((player, index) => `
    <button
      class="list-card leaderboard-player-card"
      type="button"
      data-player-stats="${player.id}"
      aria-label="Открыть статистику игрока ${escapeHtml(player.display_name)}"
    >
      <div class="list-row">
        <div class="leaderboard-player-main">
          <div class="leaderboard-rank">${index + 1}</div>
          <div>
            <h3>${escapeHtml(player.display_name)}</h3>
            <p>
              ${player.wins} побед · ${player.losses} поражений ·
              ${player.total_bets} ставок · ${player.win_rate}%
            </p>
          </div>
        </div>

        <div class="list-actions leaderboard-player-side">
          <strong>${state.leaderboardMode === "balance" ? money(player.balance) : state.leaderboardMode === "winrate" ? `${player.win_rate}%` : `${player.losses} поражений`}</strong>
          <span class="list-meta">баланс ${money(player.balance)}</span>
          <span class="leaderboard-open">Открыть статистику ›</span>
        </div>
      </div>
    </button>
  `).join("") : emptyState("В рейтинге пока никого нет.");

  $$("[data-player-stats]").forEach((button) => {
    button.addEventListener("click", () => {
      openPlayerStats(button.dataset.playerStats);
    });
  });
}

async function openPlayerStats(userId) {
  const requestId = ++state.playerStatsRequestId;
  const dialog = $("#playerStatsDialog");

  $("#playerStatsAvatar").textContent = "—";
  $("#playerStatsName").textContent = "Загрузка...";
  $("#playerStatsMeta").textContent = "Получаем статистику";
  $("#playerStatsContent").innerHTML =
    `<div class="loading-card">Загрузка статистики...</div>`;

  if (!dialog.open) {
    dialog.showModal();
  }

  try {
    const stats = await rpc("bkf_public_player_stats", {
      p_token: state.token,
      p_user_id: userId
    });

    if (requestId !== state.playerStatsRequestId) return;

    $("#playerStatsAvatar").textContent = initials(stats.display_name);
    $("#playerStatsName").textContent = stats.display_name;
    $("#playerStatsMeta").textContent =
      `${stats.role === "admin" ? "Администратор" : "Игрок"} · на сайте с ${formatDate(stats.registered_at)}`;

    const bestOdds = Number(stats.best_winning_odds || 0);

    $("#playerStatsContent").innerHTML = `
      <section class="public-player-balance">
        <span>Текущий баланс</span>
        <strong>${money(stats.balance)}</strong>
      </section>

      <div class="public-player-metrics">
        <article class="metric">
          <span>Всего ставок</span>
          <strong>${Number(stats.total_bets || 0)}</strong>
        </article>

        <article class="metric">
          <span>Активных</span>
          <strong>${Number(stats.active_bets || 0)}</strong>
        </article>

        <article class="metric metric-success">
          <span>Побед</span>
          <strong>${Number(stats.wins || 0)}</strong>
        </article>

        <article class="metric metric-danger">
          <span>Поражений</span>
          <strong>${Number(stats.losses || 0)}</strong>
        </article>

        <article class="metric">
          <span>Винрейт</span>
          <strong>${Number(stats.win_rate || 0)}%</strong>
        </article>

        <article class="metric">
          <span>Всего поставлено</span>
          <strong>${money(stats.total_wagered)}</strong>
        </article>

        <article class="metric">
          <span>Всего выиграно</span>
          <strong>${money(stats.total_won)}</strong>
        </article>

        <article class="metric">
          <span>Макс. выигрыш</span>
          <strong>${money(stats.max_win)}</strong>
        </article>

        <article class="metric">
          <span>Макс. ставка</span>
          <strong>${money(stats.max_bet)}</strong>
        </article>

        <article class="metric metric-highlight">
          <span>Макс. баланс</span>
          <strong>${money(stats.max_balance)}</strong>
        </article>
      </div>

      <section class="public-player-extra">
        <div>
          <span>Лучший выигрышный коэффициент</span>
          <strong>${bestOdds > 0 ? bestOdds.toFixed(2) : "—"}</strong>
        </div>
        <div>
          <span>Возвратов</span>
          <strong>${Number(stats.refunded_bets || 0)}</strong>
        </div>
        <div>
          <span>Выкупленных ставок</span>
          <strong>${Number(stats.cashed_out_bets || 0)}</strong>
        </div>
      </section>

      <p class="public-player-note">
        Винрейт считается только по ставкам со статусом «Выигрыш» или «Проигрыш».
      </p>
    `;
  } catch (error) {
    if (requestId !== state.playerStatsRequestId) return;

    $("#playerStatsName").textContent = "Не удалось загрузить";
    $("#playerStatsMeta").textContent = "Попробуйте открыть профиль ещё раз";
    $("#playerStatsContent").innerHTML = emptyState(error.message);
  }
}

async function loadProfileStats() {
  const stats = await rpc("bkf_profile_stats", { p_token: state.token });

  $("#profileBets").textContent = stats.total_bets;
  $("#profileWins").textContent = stats.wins;
  $("#profileWinRate").textContent = `${stats.win_rate}%`;
  $("#profileWagered").textContent = money(stats.total_wagered);
  $("#profileWon").textContent = money(stats.total_won);
}

async function loadRewardsProfile(){
  const data=await rpc("bkf_rewards_profile",{p_token:state.token}); state.bonuses=data;
  $("#referralCode").textContent=data.referral_code;
  $("#referralInput").disabled=!data.can_redeem_referral; $("#redeemReferralButton").disabled=!data.can_redeem_referral;
  $("#referralStatus").textContent=data.can_redeem_referral?"Код доступно активировать до первой ставки и в течение 24 часов.":data.referred_by?"Реферальный код уже активирован.":"Вы можете приглашать друзей, но ввод чужого кода для этого аккаунта уже недоступен.";
  const parts=[]; if(data.free_cashouts)parts.push(`бесплатный выкуп: ${data.free_cashouts}`); if(data.boost_tokens)parts.push(`буст +20%: ${data.boost_tokens}`); if(data.insurance_tokens)parts.push(`страховка: ${data.insurance_tokens}`);
  $("#wheelInventory").textContent=parts.length?`Ваши бонусы — ${parts.join(" · ")}`:"Активных бонусов пока нет";
  $("#spinWheelButton").disabled=!data.can_spin; $("#wheelTimer").textContent=data.can_spin?"Можно крутить":`Следующая попытка: ${formatDate(data.next_spin_at)}`;
}
async function spinWheel(){const b=$("#spinWheelButton");setButtonBusy(b,true,"Крутим...");$("#wheelVisual").classList.add("spinning");try{const r=await rpc("bkf_spin_wheel",{p_token:state.token});setTimeout(()=>$("#wheelVisual").classList.remove("spinning"),900);toast(`Приз: ${r.label}`);await Promise.all([refreshCurrentUser(),loadRewardsProfile(),loadAchievements()]);}catch(e){$("#wheelVisual").classList.remove("spinning");toast(e.message,"error");}finally{setButtonBusy(b,false);}}
async function redeemReferral(event){event.preventDefault();const b=$("#redeemReferralButton");setButtonBusy(b,true,"Активируем...");try{await rpc("bkf_redeem_referral",{p_token:state.token,p_code:$("#referralInput").value.trim()});toast("Код активирован. Вам обоим начислено 1 000 $");await Promise.all([refreshCurrentUser(),loadRewardsProfile(),loadAchievements(),loadLeaderboard()]);}catch(e){toast(e.message,"error");}finally{setButtonBusy(b,false);}}

async function loadAchievements() {
  const host = $("#achievementsList");
  if (!host) return;

  try {
    const metrics = await rpc("bkf_achievements", { p_token: state.token });
    let unlockedCount = 0;

    host.innerHTML = ACHIEVEMENT_DEFINITIONS.map((achievement) => {
      const current = Math.max(0, Number(metrics[achievement.metric] || 0));
      const unlocked = current >= achievement.target;
      if (unlocked) unlockedCount += 1;

      const progress = Math.min(100, (current / achievement.target) * 100);
      const currentLabel = achievement.moneyProgress
        ? money(current)
        : achievement.metric === "max_winning_odds"
          ? current.toFixed(2)
          : String(Math.floor(current));

      const targetLabel = achievement.moneyProgress
        ? money(achievement.target)
        : achievement.metric === "max_winning_odds"
          ? achievement.target.toFixed(2)
          : String(achievement.target);

      return `
        <article class="achievement-card ${unlocked ? "unlocked" : "locked"} tier-${achievement.tier}">
          <div class="achievement-top">
            <span class="achievement-icon" aria-hidden="true">${achievement.icon}</span>
            <span class="achievement-state">${unlocked ? "Получено" : "Закрыто"}</span>
          </div>
          <h3>${escapeHtml(achievement.title)}</h3>
          <p>${escapeHtml(achievement.description)}</p>
          <div class="achievement-progress" aria-label="Прогресс ${currentLabel} из ${targetLabel}">
            <span style="width:${progress}%"></span>
          </div>
          <small>${currentLabel} / ${targetLabel}</small>
        </article>
      `;
    }).join("");

    $("#achievementsCounter").textContent =
      `${unlockedCount} / ${ACHIEVEMENT_DEFINITIONS.length}`;
  } catch (error) {
    console.error("Не удалось загрузить достижения:", error);
    host.innerHTML = emptyState(
      "Достижения пока не загрузились. Остальные данные сайта работают."
    );
  }
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
                <span class="list-meta">${escapeHtml(betStatusText(bet.status))}</span>
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

  const normalizedTitles = outcomes.map((outcome) =>
    outcome.title.trim().toLowerCase()
  );

  if (normalizedTitles.some((title) => !title)) {
    toast("У каждого исхода должно быть название", "error");
    return;
  }

  if (new Set(normalizedTitles).size !== normalizedTitles.length) {
    toast("Названия исходов не должны повторяться", "error");
    return;
  }

  if (outcomes.some((outcome) => !Number.isFinite(outcome.odds) || outcome.odds <= 1)) {
    toast("Каждый коэффициент должен быть больше 1", "error");
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
            <span class="list-meta">${escapeHtml(betStatusText(bet.status))}</span>
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

  if (pageName === "profile" && state.token) {
    Promise.all([
      refreshCurrentUser(),
      loadProfileStats(),
      loadAchievements(),
      loadRewardsProfile()
    ]).catch(() => {});
  }

  if (pageName === "home" && state.token) {
    refreshCurrentUser().catch(() => {});
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
  $("#expressForm").addEventListener("submit", handleExpress);
  $("#expressAmount").addEventListener("input", renderExpressBuilder);
  $("#clearExpressButton").addEventListener("click",()=>{state.expressLegs=[];renderExpressBuilder();});
  $("#spinWheelButton").addEventListener("click", spinWheel);
  $("#referralForm").addEventListener("submit", redeemReferral);
  $("#copyReferralButton").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("#referralCode").textContent);toast("Код скопирован");}catch{toast("Скопируйте код вручную","error");}});
  $$('[data-leaderboard-mode]').forEach(button=>button.addEventListener('click',()=>{$$('[data-leaderboard-mode]').forEach(x=>x.classList.remove('active'));button.classList.add('active');state.leaderboardMode=button.dataset.leaderboardMode;loadLeaderboard().catch(e=>toast(e.message,'error'));}));

  $$("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeOption);
      toast("Оформление сохранено");
    });
  });

  $("#hideBalanceToggle").addEventListener("change", (event) => {
    applyBalancePrivacy(event.target.checked);
  });

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
    initAppearance();
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

function refreshAfterReturn() {
  if (!state.token) return;
  refreshAll({ silent: true }).catch((error) => {
    console.error("Не удалось обновить данные после возвращения:", error);
  });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshAfterReturn();
  }
});

window.addEventListener("pageshow", refreshAfterReturn);
window.addEventListener("focus", refreshAfterReturn);
window.addEventListener("online", refreshAfterReturn);

init();
