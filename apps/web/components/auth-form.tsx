"use client";

import { apiBaseUrl } from "@/lib/api-config";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  PawPrint,
} from "lucide-react";
import { LocationPicker, type LocationSelection } from "@/components/location-picker";

const API_BASE_URL = apiBaseUrl;

/**
 * Validation schema for Authentication (Login and Registration)
 */
function createAuthSchema(mode: "login" | "signup") {
  return z
    .object({
      name: z.string().trim().max(80, "Use até 80 caracteres."),
      email: z
        .string()
        .trim()
        .max(254)
        .pipe(z.email("Digite um e-mail válido.")),
      password: z
        .string()
        .min(8, "Use pelo menos 8 caracteres.")
        .max(72, "Use até 72 caracteres."),
      city: z.string().trim().max(80, "Use até 80 caracteres."),
      state: z
        .string()
        .trim()
        .transform((value) => value.toUpperCase()),
      consent: z.boolean(),
    })
    .superRefine((values, context) => {
      if (mode !== "signup") return;

      if (values.name.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["name"],
          message: "Conte como podemos chamar você.",
        });
      }

      if (values.city.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["city"],
          message: "Informe sua cidade.",
        });
      }

      if (!/^[A-Z]{2}$/.test(values.state)) {
        context.addIssue({
          code: "custom",
          path: ["state"],
          message: "Use a sigla do estado, como BA.",
        });
      }

      if (!values.consent) {
        context.addIssue({
          code: "custom",
          path: ["consent"],
          message: "Aceite os termos e a política de privacidade para criar sua conta.",
        });
      }
    });
}

type AuthValues = z.infer<ReturnType<typeof createAuthSchema>>;
type FieldName = Exclude<keyof AuthValues, "consent">;

/**
 * Metadata configuration for form inputs
 */
function getFieldMetadata(name: FieldName, mode: "login" | "signup") {
  switch (name) {
    case "password":
      return {
        autoComplete: mode === "signup" ? "new-password" : "current-password",
        maxLength: 72,
        spellCheck: false,
      };
    case "email":
      return {
        autoComplete: "email",
        maxLength: 254,
        autoCapitalize: "none" as const,
        spellCheck: false,
      };
    case "state":
      return {
        autoComplete: "address-level1",
        maxLength: 2,
        autoCapitalize: "characters" as const,
      };
    case "city":
      return {
        autoComplete: "address-level2",
        maxLength: 80,
      };
    case "name":
    default:
      return {
        autoComplete: "name",
        maxLength: 80,
      };
  }
}

interface AuthInputProps {
  name: FieldName;
  label: string;
  placeholder: string;
  icon: ReactNode;
  type?: string;
  mode: "login" | "signup";
  error?: string;
  register: UseFormRegister<AuthValues>;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

/**
 * Reusable and accessible input component for Auth fields
 */
function AuthInput({
  name,
  label,
  placeholder,
  icon,
  type = "text",
  mode,
  error,
  register,
  showPassword = false,
  onTogglePassword,
}: AuthInputProps) {
  const id = `auth-${name}`;
  const isPassword = name === "password";
  const hint = isPassword && mode === "signup" ? "Use de 8 a 72 caracteres." : undefined;
  const meta = getFieldMetadata(name, mode);
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="field-label">
      <label htmlFor={id}>{label}</label>

      <span className="field-control">
        {icon}
        <input
          id={id}
          type={inputType}
          placeholder={placeholder}
          autoComplete={meta.autoComplete}
          maxLength={meta.maxLength}
          autoCapitalize={meta.autoCapitalize}
          spellCheck={meta.spellCheck}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...register(name)}
        />

        {isPassword && onTogglePassword && (
          <button
            type="button"
            className="password-toggle"
            onClick={onTogglePassword}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </span>

      {hint && (
        <small id={`${id}-hint`} className="field-hint">
          {hint}
        </small>
      )}

      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

interface AuthFormProps {
  mode: "login" | "signup";
}

/**
 * Authentication Form (Sign In & Sign Up)
 */
export function AuthForm({ mode }: AuthFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [location, setLocation] = useState<LocationSelection | null>(null);

  const form = useForm<AuthValues>({
    resolver: zodResolver(createAuthSchema(mode)),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      city: "",
      state: "",
      consent: false,
    },
    mode: "onTouched",
  });

  const isSignup = mode === "signup";
  const busy = form.formState.isSubmitting || success;

  async function onSubmit(values: AuthValues) {
    setServerError("");

    try {
      const endpoint = isSignup ? "/api/auth/register" : "/api/auth/login";

      const pickedLocation =
        location &&
        location.city.toLocaleLowerCase("pt-BR") === values.city.toLocaleLowerCase("pt-BR") &&
        location.state === values.state
          ? location
          : null;

      const body = isSignup
        ? {
            displayName: values.name,
            email: values.email,
            password: values.password,
            city: values.city,
            state: values.state,
            latitude: pickedLocation?.latitude,
            longitude: pickedLocation?.longitude,
            consent: values.consent,
          }
        : {
            email: values.email,
            password: values.password,
          };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };

      if (!response.ok) {
        const message = Array.isArray(payload.message)
          ? payload.message.join(" ")
          : payload.message ?? "Não foi possível concluir. Confira os dados e tente de novo.";
        throw new Error(message);
      }

      setSuccess(true);
      window.location.assign(isSignup ? "/animais/novo" : "/dashboard");
    } catch (error) {
      if (error instanceof TypeError) {
        setServerError(
          "Não conseguimos conectar ao serviço agora. Seus dados foram mantidos; tente novamente em instantes."
        );
      } else if (error instanceof Error) {
        setServerError(error.message);
      } else {
        setServerError("Não foi possível concluir. Tente novamente.");
      }
    }
  }

  function handleLocationSelect(selected: LocationSelection) {
    setLocation(selected);
    form.setValue("city", selected.city, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue("state", selected.state, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  return (
    <div className="auth-page">
      {/* Coluna Visual Lateral */}
      <div className="auth-picture">
        <Link href="/" className="wordmark auth-wordmark">
          <span className="wordmark-icon">
            <PawPrint size={20} aria-hidden="true" />
          </span>
          <span>
            match<span>animal</span>
          </span>
        </Link>

        <div className="auth-picture-copy">
          <span>CONEXÕES COM MAIS SIGNIFICADO</span>
          <h2>
            Porque a vida
            <br />
            fica melhor <em>em boa<br />companhia.</em>
          </h2>
          <p>
            Um espaço feito para os pets encontrarem o mundo e os tutores
            encontrarem uns aos outros.
          </p>
        </div>

        <div className="auth-picture-footer">
          <Heart size={16} aria-hidden="true" /> BONS ENCONTROS COMEÇAM COM CUIDADO
        </div>
      </div>

      {/* Painel do Formulário */}
      <main className="auth-panel">
        <Link className="auth-back" href="/">
          <ArrowLeft size={18} aria-hidden="true" /> Voltar ao início
        </Link>

        <div className="auth-form-wrap">
          <span className="auth-mobile-mark">
            <PawPrint size={23} aria-hidden="true" />
          </span>

          <div className="auth-kicker">
            {isSignup ? "VAMOS COMEÇAR" : "QUE BOM TER VOCÊ DE VOLTA"}
          </div>

          <h1>
            {isSignup ? (
              <>
                Crie seu <em>cantinho.</em>
              </>
            ) : (
              <>
                Entre na sua <em>conta.</em>
              </>
            )}
          </h1>

          <p className="auth-subtitle">
            {isSignup
              ? "Primeiro, vamos conhecer você. Depois, seu pet."
              : "Seu próximo encontro começa com uma conversa."}
          </p>

          <form
            className="auth-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            aria-busy={busy}
          >
            <fieldset className="auth-fields" disabled={busy}>
              {isSignup && (
                <>
                  <AuthInput
                    name="name"
                    label="Como podemos chamar você?"
                    placeholder="Seu nome"
                    icon={<PawPrint size={18} aria-hidden="true" />}
                    mode={mode}
                    error={form.formState.errors.name?.message}
                    register={form.register}
                  />

                  <div className="field-row">
                    <AuthInput
                      name="city"
                      label="Cidade"
                      placeholder="Ex.: Salvador"
                      icon={<MapPin size={18} aria-hidden="true" />}
                      mode={mode}
                      error={form.formState.errors.city?.message}
                      register={form.register}
                    />

                    <AuthInput
                      name="state"
                      label="Estado"
                      placeholder="BA"
                      icon={<MapPin size={18} aria-hidden="true" />}
                      mode={mode}
                      error={form.formState.errors.state?.message}
                      register={form.register}
                    />
                  </div>

                  <LocationPicker onSelect={handleLocationSelect} />
                </>
              )}

              <AuthInput
                name="email"
                type="email"
                label="E-mail"
                placeholder="voce@email.com"
                icon={<Mail size={18} aria-hidden="true" />}
                mode={mode}
                error={form.formState.errors.email?.message}
                register={form.register}
              />

              <AuthInput
                name="password"
                type="password"
                label="Senha"
                placeholder={isSignup ? "Crie uma senha segura" : "Sua senha"}
                icon={<LockKeyhole size={18} aria-hidden="true" />}
                mode={mode}
                error={form.formState.errors.password?.message}
                register={form.register}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((prev) => !prev)}
              />

              {isSignup && (
                <div>
                  <label className="consent-row">
                    <input
                      type="checkbox"
                      aria-invalid={Boolean(form.formState.errors.consent)}
                      aria-describedby={
                        form.formState.errors.consent ? "auth-consent-error" : undefined
                      }
                      {...form.register("consent")}
                    />
                    <span>
                      Li e aceito os <Link href="/termos">Termos de Uso</Link> e a{" "}
                      <Link href="/privacidade">Política de Privacidade</Link>. Concordo
                      com o tratamento dos meus dados para criar meu perfil.
                    </span>
                  </label>

                  {form.formState.errors.consent && (
                    <p className="field-error" id="auth-consent-error" role="alert">
                      {form.formState.errors.consent.message}
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            {!isSignup && (
              <div className="forgot-row">
                <Link href="/recuperar-senha">Esqueci minha senha</Link>
              </div>
            )}

            {serverError && (
              <div className="form-alert" role="alert">
                {serverError}
              </div>
            )}

            {success && (
              <div className="form-success" role="status">
                Tudo certo! Estamos preparando seu espaço.
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="form-spinner" size={18} aria-hidden="true" />{" "}
                  Preparando seu espaço…
                </>
              ) : isSignup ? (
                <>
                  Criar minha conta <ArrowRight size={18} aria-hidden="true" />
                </>
              ) : (
                <>
                  Entrar <ArrowRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            {isSignup ? (
              <>
                Já tem uma conta? <Link href="/entrar">Entrar</Link>
              </>
            ) : (
              <>
                Ainda não tem uma conta? <Link href="/cadastro">Criar conta</Link>
              </>
            )}
          </div>

          <div className="auth-safety">
            <LockKeyhole size={17} aria-hidden="true" />
            <span>Sua localização residencial nunca é exibida.</span>
          </div>
        </div>
      </main>

      {/* Rodapé Mobile */}
      <div className="auth-mobile-footer">
        <Heart size={14} aria-hidden="true" /> FEITO COM CARINHO PARA TUTORES E PETS
      </div>
    </div>
  );
}
