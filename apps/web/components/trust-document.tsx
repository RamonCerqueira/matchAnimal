import Link from "next/link";
import { ArrowLeft, Heart, ShieldCheck } from "lucide-react";

const docs = {
  privacy: {
    label: "TRANSPARÊNCIA SOBRE DADOS",
    title: "Aviso de privacidade",
    intro: "Este aviso descreve o tratamento previsto nesta versão inicial do MatchAnimal. O produto ainda está em desenvolvimento; este texto é um rascunho de produto, não um documento jurídico final.",
    sections: [
      ["Quais dados entram no perfil?", "No cadastro: nome de exibição, e-mail, senha (armazenada como hash) e cidade/UF. No perfil do pet: nome, espécie, raça, porte, sexo, data de nascimento opcional, descrição, interesses e fotografias enviadas pelo dispositivo. O sistema registra a versão e a data do consentimento informado."],
      ["Para que são usados?", "Para criar e proteger a conta, exibir perfis que o tutor escolheu tornar públicos, aplicar filtros de descoberta e organizar candidaturas de adoção. A compatibilidade considera atributos explicáveis do perfil e não toma decisões sobre pessoas ou animais."],
      ["Como a localização é tratada?", "A descoberta usa a cidade e o estado do perfil como região ampla. O modelo não solicita endereço residencial nem publica coordenadas. A API omite a célula interna de busca nas respostas públicas."],
      ["O que fica visível?", "Cada perfil de pet começa privado. O tutor precisa ativar a visibilidade. As fotos enviadas podem aparecer nos perfis publicados. A comunidade pode denunciá-las e a equipe pode remover conteúdo inadequado; esta versão não oferece revisão humana prévia de todas as fotos."],
      ["Como a conta é protegida?", "A senha é armazenada como hash; os tokens de acesso e renovação são enviados em cookies HttpOnly. O token de renovação é guardado no banco como hash."],
      ["O que ainda precisa ser definido?", "Antes de uma operação pública, o MatchAnimal precisa publicar a identificação e os contatos do controlador, prazos de retenção, operadores e compartilhamentos, canal para pedidos do titular, fluxo de exportação/correção/exclusão, e processo de resposta a incidentes. As telas para exercer esses pedidos ainda não estão disponíveis."],
    ],
  },
  terms: {
    label: "RASCUNHO DA VERSÃO DE DESENVOLVIMENTO",
    title: "Condições de uso",
    intro: "Este texto registra princípios de produto durante a construção do MatchAnimal. Ele não representa os termos comerciais finais e não deve ser usado como contrato de lançamento.",
    sections: [
      ["Quem pode criar uma conta?", "A experiência está sendo projetada para tutores adultos, organizações de proteção animal e profissionais do segmento pet. Os perfis publicados devem ter autorização do responsável pelo animal."],
      ["Como funcionam as conexões?", "Amizade e relacionamento começam com interesse mútuo entre tutores. Adoção segue uma candidatura analisada pelo responsável pelo animal, sem depender de curtidas mútuas."],
      ["Reprodução responsável", "A pontuação de compatibilidade não é recomendação de reprodução. O MatchAnimal não verifica documentos nem aprova reprodução. Os tutores devem conversar, procurar orientação veterinária e confirmar saúde, bem-estar e normas aplicáveis antes de qualquer decisão."],
      ["Conteúdo e segurança", "O produto está sendo preparado para oferecer denúncia, bloqueio e moderação de fotos e publicações. A interface dessas ferramentas e o processo de atendimento ainda não estão completos nesta etapa."],
      ["Versão de lançamento", "Antes de abrir o serviço ao público, serão publicados termos completos com regras de uso, responsabilidades, canais de suporte, encerramento de conta e tratamento de disputas, após revisão apropriada."],
    ],
  },
};

export function TrustDocument({ type }: { type: keyof typeof docs }) {
  const doc = docs[type];
  return <main className="trust-document-page"><Link className="wordmark trust-doc-brand" href="/"><span className="wordmark-icon"><Heart size={16}/></span><span>match<span>animal</span></span></Link><Link href="/cadastro" className="back-link"><ArrowLeft size={14}/> Voltar ao cadastro</Link><div className="document-kicker"><ShieldCheck size={14}/>{doc.label}</div><h1>{doc.title}</h1><p className="document-intro">{doc.intro}</p><div className="draft-banner">Documento provisório · Versão de desenvolvimento</div><div className="document-sections">{doc.sections.map(([heading, body])=><section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}</div><p className="document-source">Referência de transparência: <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares" target="_blank" rel="noreferrer">orientações públicas da ANPD sobre direitos dos titulares</a>.</p><p className="document-date">MatchAnimal · documento de trabalho atualizado em 14 de outubro de 2026</p></main>;
}
