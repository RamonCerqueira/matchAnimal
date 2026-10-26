"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, LoaderCircle, Mail, ShieldCheck } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Form for password recovery request and password reset completion
 */
export function PasswordRecoveryForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  const confirmationRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError("");
    setMessage("");

    if (token && password !== confirmation) {
      setError("As duas senhas precisam ser iguais.");
      confirmationRef.current?.focus();
      return;
    }

    setBusy(true);

    try {
      const endpoint = token ? "/api/auth/password-reset/complete" : "/api/auth/password-reset/request";
      const payload = token ? { token, password } : { email: email.trim() };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };

      if (!response.ok) {
        const errorText = Array.isArray(result.message)
          ? result.message.join(" ")
          : result.message ?? "Não foi possível concluir. Solicite um novo link se o anterior expirou.";
        throw new Error(errorText);
      }

      if (token) {
        setComplete(true);
        setMessage("Senha alterada. Entre novamente com sua nova senha.");
      } else {
        setMessage(
          "Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. O link vale por 45 minutos. Confira também a pasta de spam."
        );
      }
    } catch (cause) {
      if (cause instanceof TypeError) {
        setError("Não conseguimos conectar ao serviço. Tente novamente em instantes.");
      } else if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("Não foi possível concluir. Tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <div className="recovery-result" role="status">
        <Check size={28} aria-hidden="true" />
        <p>{message}</p>
        <Link href="/entrar">Entrar com a nova senha</Link>
      </div>
    );
  }

  return (
    <form className="recovery-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      {token ? (
        <>
          <p className="recovery-context">Crie uma nova senha com 8 a 72 caracteres.</p>

          <div className="recovery-field">
            <label htmlFor="recovery-password">Nova senha</label>
            <span>
              <input
                id="recovery-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                required
                disabled={busy}
              />
              <button
                className="recovery-password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar senhas" : "Mostrar senhas"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </span>
          </div>

          <div className="recovery-field">
            <label htmlFor="recovery-confirmation">Confirme a nova senha</label>
            <input
              id="recovery-confirmation"
              ref={confirmationRef}
              type={showPassword ? "text" : "password"}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              aria-invalid={Boolean(error && password !== confirmation)}
              aria-describedby={error ? "recovery-error" : undefined}
              required
              disabled={busy}
            />
          </div>
        </>
      ) : (
        <div className="recovery-field">
          <label htmlFor="recovery-email">E-mail da conta</label>
          <span>
            <Mail size={18} aria-hidden="true" />
            <input
              id="recovery-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              required
              maxLength={254}
              placeholder="voce@email.com"
              disabled={busy}
            />
          </span>
        </div>
      )}

      {error && (
        <p id="recovery-error" className="recovery-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="recovery-success" role="status">
          <ShieldCheck size={18} aria-hidden="true" />
          {message}
        </p>
      )}

      <button type="submit" className="recovery-submit" disabled={busy}>
        {busy ? (
          <LoaderCircle className="form-spinner" size={18} aria-hidden="true" />
        ) : (
          <ShieldCheck size={18} aria-hidden="true" />
        )}
        {busy ? "Enviando…" : token ? "Salvar nova senha" : "Enviar link de recuperação"}
      </button>

      {token && (
        <Link className="recovery-new-link" href="/recuperar-senha">
          O link expirou? Solicitar outro
        </Link>
      )}
    </form>
  );
}
