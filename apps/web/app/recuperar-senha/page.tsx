import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

export default function PasswordRecoveryPage() {
  return (
    <main className="recovery-page">
      <Link className="wordmark" href="/">
        <span className="wordmark-icon">
          <LockKeyhole size={20} aria-hidden="true" />
        </span>
        <span>
          match<span>animal</span>
        </span>
      </Link>

      <section>
        <Link href="/entrar" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" /> Voltar para entrar
        </Link>

        <div className="product-eyebrow">
          <span>
            <LockKeyhole size={16} aria-hidden="true" />
          </span>{" "}
          RECUPERAÇÃO DE ACESSO
        </div>

        <h1 className="product-h1">
          Vamos ajudar
          <br />
          <em>você a voltar.</em>
        </h1>

        <p className="product-lead">
          Recupere o acesso à sua conta com um link seguro enviado por e-mail.
        </p>

        <Suspense fallback={<p role="status">Preparando recuperação…</p>}>
          <PasswordRecoveryForm />
        </Suspense>
      </section>
    </main>
  );
}
