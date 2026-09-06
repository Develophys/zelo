import { useState, type InputHTMLAttributes, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FIELD_SURFACE } from "@/presentation/ui/TextField";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  ref?: Ref<HTMLInputElement>;
}

export function PasswordField({ className = "", ...rest }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`relative flex ${className}`}>
      <input type={isVisible ? "text" : "password"} className={`${FIELD_SURFACE} pr-12`} {...rest} />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={isVisible}
        className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted transition-opacity duration-150 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
