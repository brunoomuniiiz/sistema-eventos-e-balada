import { useEffect, useRef, useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps {
  value: number;
  onChange: (v: number) => void;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

const fmt = (cents: number) =>
  "R$ " +
  (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    { value, onChange, autoFocus, className, disabled, placeholder, id },
    ref,
  ) {
    const [cents, setCents] = useState<number>(Math.round((value || 0) * 100));
    // Quando o input acabou de receber foco, o próximo dígito digitado SUBSTITUI o valor
    // ao invés de empilhar. Resolve o caso "clicar em 370 e digitar 400 deveria virar 400".
    const replaceOnNext = useRef(false);

    useEffect(() => {
      const incoming = Math.round((value || 0) * 100);
      if (incoming !== cents) setCents(incoming);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const update = (next: number) => {
      setCents(next);
      onChange(next / 100);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        replaceOnNext.current = false;
        update(Math.floor(cents / 10));
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const digit = Number(e.key);
        const base = replaceOnNext.current ? 0 : cents;
        replaceOnNext.current = false;
        const next = base * 10 + digit;
        if (next > 9_999_999_999) return;
        update(next);
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "");
      if (digits === "") {
        update(0);
        return;
      }
      const next = Math.min(parseInt(digits, 10), 9_999_999_999);
      replaceOnNext.current = false;
      update(next);
    };

    return (
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? "R$ 0,00"}
        className={className}
        value={fmt(cents)}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onFocus={(e) => {
          replaceOnNext.current = true;
          const el = e.target;
          requestAnimationFrame(() => {
            try { el.select(); } catch { /* noop */ }
          });
        }}
        onBlur={() => {
          replaceOnNext.current = false;
        }}
      />
    );
  },
);
