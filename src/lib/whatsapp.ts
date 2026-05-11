import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Normaliza telefone para formato wa.me (apenas dígitos, com DDI Brasil se faltar). */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // Adiciona 55 (Brasil) se número tiver 10 ou 11 dígitos (DDD + número)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function waLink(phone: string | null | undefined, message: string) {
  const text = encodeURIComponent(message);
  const p = normalizePhone(phone);
  return p ? `https://wa.me/${p}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function buildConfirmationMessage(opts: {
  guestName: string;
  eventName: string;
  eventDate: string | Date;
  promoterName: string;
  location?: string | null;
  flyerUrl?: string | null;
  instagramHandle?: string;
}) {
  const date = format(new Date(opts.eventDate), "dd/MM 'às' HH:mm", {
    locale: ptBR,
  });
  const lines = [
    `Olá ${opts.guestName}! 🎉`,
    ``,
    `Você está CONFIRMADO(A) na lista de *${opts.promoterName}* para *${opts.eventName}*.`,
    `📅 ${date}`,
  ];
  if (opts.location) lines.push(`📍 ${opts.location}`);
  lines.push(
    ``,
    `🍹 *Promo:* poste um story marcando ${opts.instagramHandle ?? "o evento"} no Instagram e ganhe uma caipirinha na entrada!`,
  );
  if (opts.flyerUrl) lines.push(``, `Flyer: ${opts.flyerUrl}`);
  lines.push(``, `Te esperamos! 🥂`);
  return lines.join("\n");
}

export function buildReminderMessage(opts: {
  guestName: string;
  eventName: string;
  eventDate: string | Date;
  location?: string | null;
}) {
  const date = format(new Date(opts.eventDate), "HH:mm", { locale: ptBR });
  const lines = [
    `Oi ${opts.guestName}! 👋`,
    ``,
    `Lembrete: hoje é o dia do *${opts.eventName}*! Começa às ${date}.`,
  ];
  if (opts.location) lines.push(`📍 ${opts.location}`);
  lines.push(
    ``,
    `Você já está na lista. Não esqueça do story marcando o evento pra ganhar a caipirinha 🍹`,
    ``,
    `Até mais tarde! 🎶`,
  );
  return lines.join("\n");
}
