import { ShieldCheck } from "lucide-react";
import { PetFriends } from "@/components/pet-friends";

type ResponsibleCareNoticeProps = {
  title?: string;
  children?: React.ReactNode;
  compact?: boolean;
};

/** Persistent, friendly reminder for flows that require human and veterinary care. */
export function ResponsibleCareNotice({
  title = "Cuidado em primeiro lugar",
  children = "Compatibilidade não é recomendação de reprodução. Qualquer apresentação exige avaliação veterinária, verificações de saúde e bem-estar, e decisão responsável dos tutores.",
  compact = false,
}: ResponsibleCareNoticeProps) {
  return (
    <aside className={`responsible-care-notice${compact ? " responsible-care-compact" : ""}`} role="note">
      <div className="responsible-care-mascots" aria-hidden="true">
        <PetFriends mood="love" label="" />
      </div>
      <div className="responsible-care-copy">
        <span className="responsible-care-kicker"><ShieldCheck size={14} /> BEM-ESTAR ANIMAL</span>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      <span className="responsible-care-paw" aria-hidden="true">🐾</span>
    </aside>
  );
}
