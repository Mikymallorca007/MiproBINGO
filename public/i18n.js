// ============================================================
//   i18n — Aldea Bella Bingo
// ============================================================
const I18N = {
  es: {
    // Login
    "login.sub": "Noches de Bingo",
    "login.session_code": "Código de sesión",
    "login.your_name": "Tu nombre",
    "login.change": "✏️ Cambiar",
    "login.join": "🎫 Entrar a la partida",
    "login.err_code": "Introduce el código de sesión",
    "login.err_name": "Introduce tu nombre",
    "login.connecting": "Conectando...",

    // Waiting
    "waiting.title": "Esperando al anfitrión",
    "waiting.text": "En cuanto te apruebe, empieza la partida. No cierres esta pantalla.",
    "waiting.name": "Nombre",
    "waiting.session": "Sesión",
    "waiting.cancel": "✏️ Cancelar",

    // Waiting room
    "wr.title": "🚪 SALA DE ESPERA",
    "wr.subtitle": "Pulsa LISTO para empezar",
    "wr.ready_btn": "✅ ESTOY LISTO",
    "wr.ready_done": "¡Listo! Esperando a los demás…",
    "wr.players_label": "listos",
    "wr.countdown_label": "¡PREPARADOS!",
    "wr.leave": "🚪 Salir",

    // Approved
    "approved.title": "¡Estás dentro!",
    "approved.text": "En cuanto el host pulse START, empezará la partida.",

    // Ready-wait (cartón vacío)
    "readyWait.title": "Esperando al host…",
    "readyWait.subtitle": "En cuanto pulse START, tu cartón se rellenará solo.",

    // Game
    "game.pool": "Bote",
    "game.line": "Línea",
    "game.bingo": "Bingo",
    "game.help": "Marca los números según salgan.",
    "game.screen_on": "Pantalla siempre encendida",
    "game.leave": "Salir de la partida",
    "game.leave_confirm_title": "¿Salir de la partida?",
    "game.leave_confirm_msg": "Te sacarán de la ronda. ¿Seguro?",
    "game.round_timer": "⏱️",
    "game.balls": "🎱",

    // Claim buttons
    "claim.line": "¡LÍNEA!",
    "claim.bingo": "¡BINGO!",
    "claim.line_sent": "📣 ¡Línea cantada!",
    "claim.bingo_sent": "📣 ¡Bingo cantado!",
    "claim.practice": "🎓 Ronda de práctica — sin premios",
    "claim.sent_info": "📣 Reclamación de {claim} enviada al host",
    "claim.has_line": "¡TIENES LÍNEA! Pulsa el botón",
    "claim.has_bingo": "¡TIENES BINGO! Pulsa el botón",
    "claim.other_called": "⚠️ ¡{name} ha cantado {claim} con la bola {ball}! Marca tu casilla rápido.",

    // Claim window
    "cw.claimed_title": "¡HAS CANTADO {claim}!",
    "cw.you_already": "✅ Ya has cantado {claim}",
    "cw.waiting_other": "Esperando a otros reclamantes…",
    "cw.waiting_close": "⏳ Esperando a que cierre la ventana…",
    "cw.no_valid": "No tienes {claim} válido con la última bola",
    "cw.claim_msg": "¡Alguien ha cantado <strong>{claim}</strong> con el <strong>{ball}</strong>!<br/>Si tú también la tienes, ¡pulsa ahora!",
    "cw.join_btn": "🖐️ ¡YO TAMBIÉN TENGO {claim}!",

    // Pause
    "pause.title": "PAUSA",
    "pause.host_verifying": "El anfitrión está verificando la reclamación",
    "pause.wait_host": "El host reanudará la partida en breve",
    "pause.paused_by_host": "Ronda pausada por el anfitrión",
    "pause.waiting_resume": "Esperando a que el host reanude…",
    "pause.winner": "Ganador",
    "pause.winners": "Ganadores",
    "pause.prize_total": "Premio total: €{amount} · Compartido",
    "pause.verify": "VERIFICANDO {claim}",
    "pause.verify_wait": "Esperando a que se resuelva la reclamación",

    // Round end
    "end.title": "🏁 ¡Partida terminada!",
    "end.show_card": "👁️ Mostrar mi cartón",
    "end.play_again": "🎮 Jugar otra vez",
    "end.leave": "🚪 Salir",
    "end.no_winner": "{icon} {label}: sin ganador",
    "end.shared": "Compartido · Total: €{amount}",
    "end.remaining_balls": "🎱 Bolas sin salir ({count})",
    "end.leave_confirm_title": "¿Salir de la partida?",
    "end.leave_confirm_msg": "Saldrás de la sesión. Puedes volver a entrar con el mismo código.",

    // Kicked
    "kicked.rejected_title": "No aprobado",
    "kicked.rejected_msg": "El anfitrión no te aprobó para esta ronda.",
    "kicked.kicked_title": "Expulsado de la partida",
    "kicked.kicked_msg": "El anfitrión te ha sacado de esta ronda.",
    "kicked.banned_title": "Vetado",
    "kicked.banned_msg": "Has sido vetado de esta sesión.",

    // Reconnect
    "reconnect.banner": "🔄 Reconectando…",

    // Toasts
    "toast.payment_ok": "💵 Pago confirmado",
    "toast.screen_kept": "💡 La pantalla se mantendrá encendida mientras juegas",
    "toast.screen_unsupported": "⚠️ Tu móvil no soporta mantener la pantalla encendida. Ajusta el tiempo de apagado si se oscurece.",
    "toast.name_changed": "✏️ Nombre cambiado a {name}",
    "toast.won_claim": "🎉 ¡Has ganado {claim}! €{amount}{shared}",
    "toast.shared_suffix": " (compartido)",
    "toast.other_won": "🎉 {name} gana {claim}! €{amount}",
    "toast.other_won_bingo": "🏆 {name} gana BINGO! €{amount}",
    "toast.claim_rejected": "❌ {reason}",
    "toast.claim_rejected_generic": "❌ Reclamación rechazada — la ronda continúa",
    "toast.mark_invalid": "⚠️ {msg}",
    "toast.round_resumed": "▶️ Ronda reanudada",
    "toast.all_ready": "▶️ ¡Todos listos! Reanudando…",

    // Confirm
    "confirm.cancel": "Cancelar",
    "confirm.ok": "OK",
    "confirm.change_name_title": "¿Cambiar tu nombre?",
    "confirm.change_name_msg": "Esto olvidará el nombre guardado.",
    "confirm.cancel_wait_title": "¿Cancelar espera?",
    "confirm.cancel_wait_msg": "Saldrás de la cola de aprobación. Puedes intentarlo más tarde.",
    "confirm.leave_room_title": "¿Salir de la sala?",
    "confirm.leave_room_msg": "Saldrás de la partida. Puedes volver a entrar con el mismo código.",

    "payout.title_line": "¡LÍNEA!",
    "payout.title_bingo": "¡BINGO!",
    "payout.winner_msg": "Has ganado {claim}. Muestra el comprobante al host y pulsa OK cuando hayas cobrado.",
    "payout.others_msg": "{claim} cantada por {names}. Esperando a que cobren…",
    "payout.receipt": "🎫 Comprobante",
    "payout.prize": "Premio: €{amount}",
    "payout.ok_paid": "✅ OK, HE COBRADO",
    "payout.winner_label_one": "🏆 Ganador",
    "payout.winner_label_many": "🏆 Ganadores",
    "payout.waiting_pay": "⏳ Esperando cobro…",
    "payout.when_all_ok": "Cuando todos los ganadores pulsen OK, arrancará la cuenta atrás",
    "payout.resume_when_paid": "La partida se reanudará cuando el ganador cobre",
    "payout.resuming_in": "▶️ REANUDANDO EN",

    // Misc
    "misc.locked": "🔒 FIN DE PARTIDA",
    "misc.you_left": "Has salido",
    "misc.sound_unlocked": "🔊 Audio activado"
  },

  en: {
    // Login
    "login.sub": "Bingo Night",
    "login.session_code": "Session Code",
    "login.your_name": "Your Name",
    "login.change": "✏️ Change",
    "login.join": "🎫 Join the game",
    "login.err_code": "Enter the session code",
    "login.err_name": "Enter your name",
    "login.connecting": "Connecting...",

    // Waiting
    "waiting.title": "Waiting for the host",
    "waiting.text": "The game starts as soon as you're approved. Don't close this screen.",
    "waiting.name": "Name",
    "waiting.session": "Session",
    "waiting.cancel": "✏️ Cancel",

    // Waiting room
    "wr.title": "🚪 WAITING ROOM",
    "wr.subtitle": "Press READY to start",
    "wr.ready_btn": "✅ I'M READY",
    "wr.ready_done": "Ready! Waiting for the others…",
    "wr.players_label": "ready",
    "wr.countdown_label": "GET READY!",
    "wr.leave": "🚪 Leave",

    // Approved
    "approved.title": "You're in!",
    "approved.text": "As soon as the host presses START, the game will begin.",

    // Ready-wait (cartón vacío)
    "readyWait.title": "Waiting for the host…",
    "readyWait.subtitle": "As soon as they press START, your card will fill in.",

    // Game
    "game.pool": "Pool",
    "game.line": "Line",
    "game.bingo": "Bingo",
    "game.help": "Tap the numbers as they are called.",
    "game.screen_on": "Screen kept on",
    "game.leave": "Leave game",
    "game.leave_confirm_title": "Leave the game?",
    "game.leave_confirm_msg": "You will be removed from the round. Are you sure?",
    "game.round_timer": "⏱️",
    "game.balls": "🎱",

    // Claim buttons
    "claim.line": "🥉 LINE!",
    "claim.bingo": "🥈 BINGO!",
    "claim.line_sent": "📣 LINE claim sent!",
    "claim.bingo_sent": "📣 BINGO claim sent!",
    "claim.practice": "🎓 Practice round — no prizes",
    "claim.sent_info": "📣 {claim} claim sent to host",
    "claim.has_line": "YOU HAVE LINE! Press the button",
    "claim.has_bingo": "YOU HAVE BINGO! Press the button",
    "claim.other_called": "⚠️ {name} called {claim} with ball {ball}! Mark your cell fast.",

    // Claim window
    "cw.claimed_title": "YOU CALLED {claim}!",
    "cw.you_already": "✅ You already claimed {claim}",
    "cw.waiting_other": "Waiting for other claimers…",
    "cw.waiting_close": "⏳ Waiting for the window to close…",
    "cw.no_valid": "You don't have a valid {claim} with the last ball",
    "cw.claim_msg": "A <strong>{claim}</strong> was claimed with <strong>{ball}</strong>!<br/>If you also have it, press now!",
    "cw.join_btn": "🖐️ I ALSO HAVE {claim}!",

    // Pause
    "pause.title": "PAUSED",
    "pause.host_verifying": "The host is verifying the claim",
    "pause.wait_host": "The host will resume the game shortly",
    "pause.paused_by_host": "Round paused by the host",
    "pause.waiting_resume": "Waiting for the host to resume…",
    "pause.winner": "Winner",
    "pause.winners": "Winners",
    "pause.prize_total": "Total prize: €{amount} · Shared",
    "pause.verify": "VERIFYING {claim}",
    "pause.verify_wait": "Waiting for the claim to be resolved",

    // Round end
    "end.title": "🏁 Round over!",
    "end.show_card": "👁️ Show my card",
    "end.play_again": "🎮 Play again",
    "end.leave": "🚪 Leave",
    "end.no_winner": "{icon} {label}: no winner",
    "end.shared": "Shared · Total: €{amount}",
    "end.remaining_balls": "🎱 Remaining balls ({count})",
    "end.leave_confirm_title": "Leave the game?",
    "end.leave_confirm_msg": "You will leave the session. You can rejoin later with the same code.",

    // Kicked
    "kicked.rejected_title": "Not approved",
    "kicked.rejected_msg": "The host did not approve you for this round.",
    "kicked.kicked_title": "Removed from game",
    "kicked.kicked_msg": "The host has removed you from this round.",
    "kicked.banned_title": "Banned",
    "kicked.banned_msg": "You have been banned from this session.",

    // Reconnect
    "reconnect.banner": "🔄 Reconnecting…",

    // Toasts
    "toast.payment_ok": "💵 Payment confirmed",
    "toast.screen_kept": "💡 Your screen will stay on while playing",
    "toast.screen_unsupported": "⚠️ Your phone doesn't support keeping the screen on. Adjust your screen timeout if it goes dark.",
    "toast.name_changed": "✏️ Name changed to {name}",
    "toast.won_claim": "🎉 You won {claim}! €{amount}{shared}",
    "toast.shared_suffix": " (shared)",
    "toast.other_won": "🎉 {name} wins {claim}! €{amount}",
    "toast.other_won_bingo": "🏆 {name} wins BINGO! €{amount}",
    "toast.claim_rejected": "❌ {reason}",
    "toast.claim_rejected_generic": "❌ Claim rejected — round continues",
    "toast.mark_invalid": "⚠️ {msg}",
    "toast.round_resumed": "▶️ Round resumed",
    "toast.all_ready": "▶️ All ready! Resuming…",

    // Confirm
    "confirm.cancel": "Cancel",
    "confirm.ok": "OK",
    "confirm.change_name_title": "Change your name?",
    "confirm.change_name_msg": "This will forget your saved name.",
    "confirm.cancel_wait_title": "Cancel waiting?",
    "confirm.cancel_wait_msg": "You will leave the approval queue. You can try again later.",
    "confirm.leave_room_title": "Leave the room?",
    "confirm.leave_room_msg": "You will leave the game. You can rejoin later with the same code.",

    "payout.title_line": "LINE!",
    "payout.title_bingo": "BINGO!",
    "payout.winner_msg": "You won {claim}. Show the receipt to the host and press OK when paid.",
    "payout.others_msg": "{claim} called by {names}. Waiting for payout…",
    "payout.receipt": "🎫 Receipt",
    "payout.prize": "Prize: €{amount}",
    "payout.ok_paid": "✅ OK, I'VE BEEN PAID",
    "payout.winner_label_one": "🏆 Winner",
    "payout.winner_label_many": "🏆 Winners",
    "payout.waiting_pay": "⏳ Waiting for payout…",
    "payout.when_all_ok": "The countdown starts when all winners press OK",
    "payout.resume_when_paid": "The game resumes when the winner gets paid",
    "payout.resuming_in": "▶️ RESUMING IN",

    // Misc
    "misc.locked": "🔒 ROUND OVER",
    "misc.you_left": "You left",
    "misc.sound_unlocked": "🔊 Audio unlocked"
  }
};

let currentLang = localStorage.getItem("ab_lang") || "es";
if (!I18N[currentLang]) currentLang = "es";

function t(key, vars) {
  let str = I18N[currentLang]?.[key] ?? I18N.es[key] ?? key;
  if (vars) {
    Object.keys(vars).forEach(k => {
      str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
    });
  }
  return str;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem("ab_lang", lang);
  applyTranslations();
  updateLangButtons();
}

function applyTranslations() {
  // Texto simple
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.innerHTML = t(el.dataset.i18n);
  });
  // Placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // Titles
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

function updateLangButtons() {
  document.querySelectorAll("[data-lang-btn]").forEach(b => {
    b.classList.toggle("active", b.dataset.langBtn === currentLang);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  updateLangButtons();
  document.querySelectorAll("[data-lang-btn]").forEach(b => {
    b.onclick = () => setLang(b.dataset.langBtn);
  });
});
