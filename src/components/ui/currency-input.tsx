import { useEffect, useState, forwardRef } from "react";
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
    // internal cents (integer)
    const [cents, setCents] = useState<number>(Math.round((value || 0) * 100));

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
        update(Math.floor(cents / 10));
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const digit = Number(e.key);
        const next = cents * 10 + digit;
        // cap (R$ 99.999.999,99)
        if (next > 9_999_999_999) return;
        update(next);
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // fallback for mobile: extract digits
      const digits = e.target.value.replace(/\D/g, "");
      if (digits === "") {
        update(0);
        return;
      }
      const next = Math.min(parseInt(digits, 10), 9_999_999_999);
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
          // place cursor at end
          const len = e.target.value.length;
          requestAnimationFrame(() => e.target.setSelectionRange(len, len));
        }}
      />
    );
  },
);
